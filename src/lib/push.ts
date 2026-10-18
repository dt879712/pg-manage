import { GoogleAuth } from "google-auth-library";
import { prisma } from "../prisma";
import { env } from "../env";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type PushMessage = PushPayload & { to: string };

const FCM_CONFIG_KEY = "fcm_service_account";

function isExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

function parseServiceAccount(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

let cachedServiceAccount: Record<string, unknown> | null | undefined;

async function getServiceAccount(): Promise<Record<string, unknown> | null> {
  if (cachedServiceAccount !== undefined) return cachedServiceAccount;

  const fromEnv = parseServiceAccount(env.fcmServiceAccount);
  if (fromEnv) {
    cachedServiceAccount = fromEnv;
    return fromEnv;
  }

  try {
    const row = await prisma.appConfig.findUnique({ where: { key: FCM_CONFIG_KEY } });
    cachedServiceAccount = row ? parseServiceAccount(row.value) : null;
  } catch {
    cachedServiceAccount = null;
  }
  return cachedServiceAccount;
}

let authClient: GoogleAuth | null = null;
let signingEmail: string | null = null;

async function getAccessToken(sa: Record<string, unknown>): Promise<{ token: string; projectId: string } | null> {
  const projectId = String(sa.project_id ?? "");
  const email = String(sa.client_email ?? "");
  if (!projectId || !email) return null;

  if (!authClient || signingEmail !== email) {
    authClient = new GoogleAuth({
      credentials: sa,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    signingEmail = email;
  }
  const client = await authClient.getClient();
  const token = await client.getAccessToken();
  if (!token.token) return null;
  return { token: token.token, projectId };
}

function toFcmData(data?: Record<string, unknown>): Record<string, string> | undefined {
  if (!data) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

async function sendOneFcm(
  projectId: string,
  accessToken: string,
  message: PushMessage
): Promise<boolean> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: message.to,
          notification: { title: message.title, body: message.body },
          data: toFcmData(message.data),
          android: {
            priority: "high",
            notification: { sound: "default", channel_id: "default" },
          },
        },
      }),
    });
    if (!res.ok) {
      console.error("FCM send failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("FCM send error", err);
    return false;
  }
}

async function sendFcm(messages: PushMessage[]): Promise<number> {
  const sa = await getServiceAccount();
  if (!sa) {
    console.error("FCM not configured: no service account available");
    return 0;
  }
  const auth = await getAccessToken(sa);
  if (!auth) {
    console.error("FCM not configured: invalid service account");
    return 0;
  }
  const results = await Promise.all(
    messages.map((m) => sendOneFcm(auth.projectId, auth.token, m))
  );
  return results.filter(Boolean).length;
}

/** Sends a push notification to every device belonging to the given users. */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  if (!userIds.length) return 0;
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  });
  if (!tokens.length) return 0;

  const all = tokens.map(({ token }) => ({ to: token, ...payload }));
  const expoMessages = all.filter((m) => isExpoToken(m.to));
  const fcmMessages = all.filter((m) => !isExpoToken(m.to));

  let sent = 0;
  if (fcmMessages.length) sent += await sendFcm(fcmMessages);
  if (expoMessages.length) sent += await sendExpoPush(expoMessages);
  return sent;
}

/** Legacy Expo Push relay (used for tokens issued before the FCM migration). */
export async function sendExpoPush(messages: PushMessage[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(env.expoAccessToken ? { Authorization: `Bearer ${env.expoAccessToken}` } : {}),
        },
        body: JSON.stringify(batch.map((m) => ({ sound: "default", channelId: "default", ...m }))),
      });
      if (res.ok) sent += batch.length;
      else console.error("Expo push failed", res.status, await res.text().catch(() => ""));
    } catch (err) {
      console.error("Expo push error", err);
    }
  }
  return sent;
}
