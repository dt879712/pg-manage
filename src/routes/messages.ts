import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { parsePagination } from "../lib/pagination";
import { sendPushToUsers } from "../lib/push";

export const messagesRouter = Router();
messagesRouter.use(requireAuth, requireTenant);

const composerRoles = ["STAFF"] as const;
const inboxViewerRoles = ["OWNER", "STAFF"] as const;

/** Messages are retained for 48 hours, then removed automatically. */
export const MESSAGE_TTL_MS = 48 * 60 * 60 * 1000;
export function messageCutoff(): Date {
  return new Date(Date.now() - MESSAGE_TTL_MS);
}

const senderSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
  phone: true,
  studentProfile: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      room: { select: { roomNumber: true } },
    },
  },
  parentLinks: {
    select: {
      relation: true,
      student: {
        select: { id: true, firstName: true, lastName: true, room: { select: { roomNumber: true } } },
      },
    },
  },
} satisfies Prisma.UserSelect;

/**
 * Student / parent / staff send a direct message to the PG owner.
 */
messagesRouter.post("/", requireRole(...composerRoles), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        subject: z.string().trim().max(200).optional(),
        body: z.string().trim().min(1, "Message cannot be empty").max(4000),
      })
      .parse(req.body);

    const message = await prisma.message.create({
      data: {
        tenantId,
        senderUserId: req.user!.sub,
        subject: body.subject || null,
        body: body.body,
      },
      include: { sender: { select: { name: true, role: true } } },
    });

    res.status(201).json({ message });

    const who = message.sender?.name ?? "Someone";
    const preview = body.body.length > 120 ? `${body.body.slice(0, 117)}...` : body.body;
    void notifyInbox(tenantId, `New message from ${who}`, preview, {
      type: "message",
      messageId: message.id,
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

/**
 * Owner/Staff: reply to a message. The reply is delivered to whoever sent the
 * original (or, when replying to your own outbound message, to its recipient).
 */
messagesRouter.post("/:id/reply", requireRole("OWNER", "STAFF"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({ body: z.string().trim().min(1, "Reply cannot be empty").max(4000) })
      .parse(req.body);

    const original = await prisma.message.findFirst({
      where: { id: req.params.id as string, tenantId, createdAt: { gte: messageCutoff() } },
    });
    if (!original) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const recipientUserId =
      original.senderUserId === req.user!.sub ? original.recipientUserId : original.senderUserId;
    if (!recipientUserId) {
      res.status(400).json({ error: "There is nobody to reply to" });
      return;
    }

    const subject = original.subject
      ? original.subject.startsWith("Re: ")
        ? original.subject
        : `Re: ${original.subject}`
      : null;

    const message = await prisma.message.create({
      data: {
        tenantId,
        senderUserId: req.user!.sub,
        recipientUserId,
        replyToId: original.id,
        subject,
        body: body.body,
      },
      include: { sender: { select: { name: true, role: true } } },
    });

    res.status(201).json({ message });

    const who = message.sender?.name ?? "The PG";
    const preview = body.body.length > 120 ? `${body.body.slice(0, 117)}...` : body.body;
    void notifyUser(tenantId, recipientUserId, `Reply from ${who}`, preview, {
      type: "message",
      messageId: message.id,
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

/**
 * Owner: every message in the tenant.
 * Staff: messages sent by parents or students.
 * Student/Parent: the messages they sent, plus any replies addressed to them.
 */
messagesRouter.get("/", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const role = req.user!.role;
    const { take, skip, page } = parsePagination(req);
    const fresh = { createdAt: { gte: messageCutoff() } };

    let where: Prisma.MessageWhereInput;
    if (role === "OWNER") {
      where = { tenantId, ...fresh };
    } else if (role === "STAFF") {
      where = {
        tenantId,
        ...fresh,
        OR: [
          { sender: { role: { in: ["PARENT", "STUDENT"] } } },
          { senderUserId: req.user!.sub },
        ],
      };
    } else {
      where = {
        tenantId,
        ...fresh,
        OR: [{ senderUserId: req.user!.sub }, { recipientUserId: req.user!.sub }],
      };
    }

    const canViewInbox = (inboxViewerRoles as readonly string[]).includes(role);
    const unreadWhere: Prisma.MessageWhereInput =
      role === "OWNER"
        ? { ...where, readAt: null }
        : role === "STAFF"
          ? { tenantId, ...fresh, readAt: null, sender: { role: { in: ["PARENT", "STUDENT"] } } }
          : {};
    const [total, unread, messages] = await Promise.all([
      prisma.message.count({ where }),
      canViewInbox ? prisma.message.count({ where: unreadWhere }) : 0,
      prisma.message.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: { sender: { select: senderSelect }, _count: { select: { replies: true } } },
      }),
    ]);

    res.json({ messages, page, total, unread });
  } catch (err) {
    next(err);
  }
});

messagesRouter.get("/:id", async (req, res, next) => {
  try {
    const role = req.user!.role;
    const visibility: Prisma.MessageWhereInput =
      role === "OWNER"
        ? {}
        : role === "STAFF"
          ? {
              OR: [
                { sender: { role: { in: ["PARENT", "STUDENT"] } } },
                { senderUserId: req.user!.sub },
              ],
            }
          : { OR: [{ senderUserId: req.user!.sub }, { recipientUserId: req.user!.sub }] };
    const message = await prisma.message.findFirst({
      where: {
        id: req.params.id as string,
        tenantId: req.user!.tenantId!,
        createdAt: { gte: messageCutoff() },
        ...visibility,
      },
      include: { sender: { select: senderSelect }, _count: { select: { replies: true } } },
    });
    if (!message) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ message });
  } catch (err) {
    next(err);
  }
});

messagesRouter.post("/:id/read", requireRole(...inboxViewerRoles), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const message = await prisma.message.findFirst({
      where: { id: req.params.id as string, tenantId, createdAt: { gte: messageCutoff() } },
    });
    if (!message) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const updated = message.readAt
      ? message
      : await prisma.message.update({ where: { id: message.id }, data: { readAt: new Date() } });
    res.json({ message: updated });
  } catch (err) {
    next(err);
  }
});

/** Removes messages older than the 48h TTL. Safe to call repeatedly. */
export async function cleanupExpiredMessages(): Promise<number> {
  const { count } = await prisma.message.deleteMany({
    where: { createdAt: { lt: messageCutoff() } },
  });
  return count;
}

// --- helpers ---

async function notifyInbox(
  tenantId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  const recipients = await prisma.user.findMany({
    where: {
      role: { in: ["OWNER", "STAFF"] },
      isActive: true,
      OR: [{ tenantId }, { ownedTenants: { some: { id: tenantId } } }],
    },
    select: { id: true },
  });
  if (!recipients.length) return;
  await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: { tenantId, title, body, audience: "OWNERS" },
    });
    await tx.notificationRecipient.createMany({
      data: recipients.map((r) => ({ notificationId: created.id, userId: r.id })),
    });
  });
  void sendPushToUsers(
    recipients.map((r) => r.id),
    { title, body, data }
  ).catch(() => {});
}

async function notifyUser(
  tenantId: string,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { role: true },
  });
  if (!user) return;
  const audience =
    user.role === "PARENT" ? "PARENTS" : user.role === "STUDENT" ? "STUDENTS" : "OWNERS";
  await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: { tenantId, title, body, audience },
    });
    await tx.notificationRecipient.create({ data: { notificationId: created.id, userId } });
  });
  void sendPushToUsers([userId], { title, body, data }).catch(() => {});
}
