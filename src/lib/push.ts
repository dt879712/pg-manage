import { prisma } from "../prisma";
import { env } from "../env";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Sends messages through Expo's push service (https://exp.host). Best-effort. */
export async function sendExpoPush(messages: PushMessage[]): Promise<number> {
  let sent = 0;
  for (const batch of chunk(messages, 100)) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(env.expoAccessToken ? { Authorization: `Bearer ${env.expoAccessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((m) => ({ sound: "default", channelId: "default", ...m }))
        ),
      });
      if (res.ok) sent += batch.length;
      else console.error("Expo push failed", res.status, await res.text().catch(() => ""));
    } catch (err) {
      console.error("Expo push error", err);
    }
  }
  return sent;
}

/** Sends a push notification to every device belonging to the given users. */
export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<number> {
  if (!userIds.length) return 0;
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  });
  if (!tokens.length) return 0;
  return sendExpoPush(tokens.map(({ token }) => ({ to: token, ...payload })));
}
