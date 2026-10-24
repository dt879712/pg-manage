import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

let notificationsPromise: Promise<NotificationsModule | null> | null = null;
function loadNotifications(): Promise<NotificationsModule | null> {
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications").catch(() => null);
  }
  return notificationsPromise;
}

let devicePromise: Promise<DeviceModule | null> | null = null;
function loadDevice(): Promise<DeviceModule | null> {
  if (!devicePromise) {
    devicePromise = import("expo-device").catch(() => null);
  }
  return devicePromise;
}

let handlerSet = false;

async function ensureHandler(Notifications: NotificationsModule): Promise<void> {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Requests permission and returns a push token + platform, or null if unavailable. */
export async function getPushToken(): Promise<{ token: string; platform: string } | null> {
  if (Platform.OS === "web") return null;
  try {
    const [Device, Notifications] = await Promise.all([loadDevice(), loadNotifications()]);
    if (!Device || !Notifications) return null;
    if (!Device.isDevice) return null;
    await ensureHandler(Notifications);

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#4F46E5",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
      });
    }

    if (Platform.OS === "android") {
      const native = await Notifications.getDevicePushTokenAsync();
      return { token: native.data, platform: "android" };
    }

    const pid = projectId();
    if (!pid) return null;

    const token = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    return { token: token.data, platform: Platform.OS };
  } catch {
    return null;
  }
}

/** Registers this device's push token with the backend. Safe to call repeatedly. */
export async function syncPushToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await syncExistingWebPush();
      return;
    }
    const registration = await getPushToken();
    if (!registration) return;
    await api("/notifications/register-device", {
      method: "POST",
      body: registration,
    });
  } catch {
    // Push is best-effort; never block the app on it.
  }
}

async function syncExistingWebPush(): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  await api("/notifications/web-push/subscribe", {
    method: "POST",
    body: subscription.toJSON(),
  });
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalledWebApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export async function getWebPushEnabled(): Promise<boolean> {
  if (Platform.OS !== "web" || !("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return Boolean(await registration?.pushManager?.getSubscription());
}

export async function enableWebPush(): Promise<void> {
  if (Platform.OS !== "web" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("This browser does not support notifications.");
  }
  if (isIosDevice() && !isInstalledWebApp()) {
    throw new Error("On iPhone or iPad, first use Safari’s Share button and choose Add to Home Screen. Then open the installed app and enable notifications here.");
  }
  if (!("PushManager" in window)) throw new Error("This browser does not support web push notifications.");

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser’s site settings, then try again.");

  const { publicKey } = await api<{ publicKey: string }>("/notifications/web-push/config");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const ready = await navigator.serviceWorker.ready;
  const subscription = await (ready ?? registration).pushManager.getSubscription() ??
    await (ready ?? registration).pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(publicKey) as BufferSource,
    });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("The browser did not provide a complete notification subscription. Please try again.");
  }
  await api("/notifications/web-push/subscribe", {
    method: "POST",
    body: { endpoint: json.endpoint, keys: json.keys },
  });
}

export async function disableWebPush(): Promise<void> {
  if (Platform.OS !== "web" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  await api("/notifications/web-push/subscribe", {
    method: "DELETE",
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}
