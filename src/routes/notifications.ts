import { Router } from "express";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { sendPushToUsers } from "../lib/push";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth, requireTenant);

const audienceRoles: Record<string, Role[]> = {
  ALL: ["OWNER", "STAFF", "STUDENT", "PARENT"],
  OWNERS: ["OWNER"],
  STAFF: ["STAFF"],
  STUDENTS: ["STUDENT"],
  PARENTS: ["PARENT"],
};

const AUDIENCE_ENUM = z.enum([
  "ALL",
  "OWNERS",
  "STAFF",
  "STUDENTS",
  "PARENTS",
  "SUPER_PARENTS",
]);

// "Super parents" = parents whose child has an invoice for a future month
// (periodMonth/periodYear) that is already fully PAID, i.e. fees paid in
// advance. The owner can override this per parent via User.isSuperParent
// (true = always super, false = always normal, null = auto).
async function superParentUsers(tenantId: string): Promise<{ id: string }[]> {
  const parents = await prisma.user.findMany({
    where: { tenantId, role: "PARENT", isActive: true, NOT: { isSuperParent: false } },
    select: { id: true, isSuperParent: true },
  });
  if (!parents.length) return [];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const autoLinks = await prisma.parentStudent.findMany({
    where: {
      tenantId,
      student: {
        invoices: {
          some: {
            tenantId,
            status: "PAID",
            periodYear: { not: null },
            OR: [
              { periodYear: { gt: year } },
              { periodYear: year, periodMonth: { gt: month } },
            ],
          },
        },
      },
    },
    select: { parentUserId: true },
  });
  const autoIds = new Set(autoLinks.map((l) => l.parentUserId));

  return parents
    .filter((p) => p.isSuperParent === true || (p.isSuperParent === null && autoIds.has(p.id)))
    .map((p) => ({ id: p.id }));
}

// Current user's inbox.
notificationsRouter.get("/", async (req, res, next) => {
  try {
    const items = await prisma.notificationRecipient.findMany({
      where: { userId: req.user!.sub },
      include: { notification: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({
      notifications: items.map((i) => ({
        id: i.notification.id,
        title: i.notification.title,
        body: i.notification.body,
        audience: i.notification.audience,
        createdAt: i.notification.createdAt,
        readAt: i.readAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Owner sends a greeting / announcement to their own users.
notificationsRouter.post("/broadcast", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z
      .object({
        title: z.string().min(1),
        body: z.string().min(1),
        audiences: AUDIENCE_ENUM.array().min(1).optional(),
        audience: AUDIENCE_ENUM.optional(),
      })
      .parse(req.body);

    const selected = body.audiences ?? (body.audience ? [body.audience] : ["ALL"]);
    const tenantId = req.user!.tenantId!;

    const roles = new Set<Role>();
    let wantsSuperParents = false;
    for (const aud of selected) {
      if (aud === "SUPER_PARENTS") {
        wantsSuperParents = true;
        continue;
      }
      for (const role of audienceRoles[aud] ?? []) roles.add(role);
    }

    const recipientIds = new Set<string>();
    if (roles.size) {
      const found = await prisma.user.findMany({
        where: { tenantId, role: { in: [...roles] }, isActive: true },
        select: { id: true },
      });
      for (const user of found) recipientIds.add(user.id);
    }
    if (wantsSuperParents) {
      for (const user of await superParentUsers(tenantId)) recipientIds.add(user.id);
    }
    const users = [...recipientIds].map((id) => ({ id }));

    // Notification.audience is display metadata only (recipients are stored
    // explicitly). Keep a single enum value: the sole audience, else ALL.
    const first = selected[0];
    const storedAudience =
      selected.includes("ALL") || selected.length !== 1 || !first
        ? "ALL"
        : first === "SUPER_PARENTS"
          ? "PARENTS"
          : first;

    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          tenantId,
          title: body.title,
          body: body.body,
          audience: storedAudience,
          createdById: req.user!.sub,
        },
      });
      if (users.length) {
        await tx.notificationRecipient.createMany({
          data: users.map((u) => ({ notificationId: created.id, userId: u.id })),
        });
      }
      return created;
    });

    res.status(201).json({ notification: { id: notification.id }, recipients: users.length });

    void sendPushToUsers(
      users.map((u) => u.id),
      { title: body.title, body: body.body, data: { type: "broadcast", notificationId: notification.id } }
    ).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// Registers (or refreshes) this device's push token for the current user.
notificationsRouter.post("/register-device", async (req, res, next) => {
  try {
    const body = z
      .object({ token: z.string().min(1), platform: z.string().min(1) })
      .parse(req.body);
    await prisma.deviceToken.upsert({
      where: { token: body.token },
      create: {
        token: body.token,
        platform: body.platform,
        userId: req.user!.sub,
        tenantId: req.user!.tenantId,
      },
      update: { userId: req.user!.sub, tenantId: req.user!.tenantId, platform: body.platform },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    await prisma.notificationRecipient.updateMany({
      where: { userId: req.user!.sub, notificationId: req.params.id as string },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
