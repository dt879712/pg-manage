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

/** Requests permission and returns an Expo push token, or null if unavailable. */
export async function getPushToken(): Promise<string | null> {
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
        lightColor: "#4F46E5",
      });
    }

    const pid = projectId();
    if (!pid) return null;

    const token = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    return token.data;
  } catch {
    return null;
  }
}

/** Registers this device's push token with the backend. Safe to call repeatedly. */
export async function syncPushToken(): Promise<void> {
  try {
    const token = await getPushToken();
    if (!token) return;
    await api("/notifications/register-device", {
      method: "POST",
      body: { token, platform: Platform.OS },
    });
  } catch {
    // Push is best-effort; never block the app on it.
  }
}