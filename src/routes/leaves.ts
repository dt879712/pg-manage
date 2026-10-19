import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { parsePagination } from "../lib/pagination";
import { getStudentForUser, getParentStudentIds } from "../lib/scope";
import { sendPushToUsers } from "../lib/push";

export const leavesRouter = Router();
leavesRouter.use(requireAuth, requireTenant);

const leaveType = z.enum(["SICK", "PERSONAL", "HOME", "EMERGENCY", "OTHER"]);
const leaveStatus = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

const applicantRoles = ["STUDENT", "STAFF", "PARENT"] as const;

function studentName(s: { firstName: string; lastName?: string | null }): string {
  return [s.firstName, s.lastName].filter(Boolean).join(" ");
}

function range(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  return from.getTime() === to.getTime() ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

/**
 * Lists who the current user may file leave for.
 * Students -> themselves; Parents -> their children; Staff -> none (own leave).
 */
leavesRouter.get("/targets", requireRole(...applicantRoles), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const role = req.user!.role;

    if (role === "STUDENT") {
      const s = await getStudentForUser(req.user!.sub);
      res.json({ targets: s ? [{ id: s.id, name: studentName(s) }] : [] });
      return;
    }
    if (role === "PARENT") {
      const ids = await getParentStudentIds(req.user!.sub);
      const students = await prisma.student.findMany({
        where: { id: { in: ids }, tenantId },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { firstName: "asc" },
      });
      res.json({ targets: students.map((s) => ({ id: s.id, name: studentName(s) })) });
      return;
    }
    // Staff file leave for themselves — no student target.
    res.json({ targets: [] });
  } catch (err) {
    next(err);
  }
});

leavesRouter.post("/", requireRole(...applicantRoles), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const role = req.user!.role;
    const body = z
      .object({
        type: leaveType.default("OTHER"),
        fromDate: z.coerce.date(),
        toDate: z.coerce.date(),
        reason: z.string().max(1000).optional(),
        studentId: z.string().optional(),
      })
      .parse(req.body);

    if (body.toDate.getTime() < body.fromDate.getTime()) {
      res.status(400).json({ error: "End date must be on or after the start date" });
      return;
    }

    let studentId: string | null = null;
    if (role === "STUDENT") {
      const s = await getStudentForUser(req.user!.sub);
      if (!s) {
        res.status(400).json({ error: "No student profile is linked to your account" });
        return;
      }
      studentId = s.id;
    } else if (role === "PARENT") {
      if (!body.studentId) {
        res.status(400).json({ error: "Select which child this leave is for" });
        return;
      }
      const ids = await getParentStudentIds(req.user!.sub);
      if (!ids.includes(body.studentId)) {
        res.status(400).json({ error: "Invalid child" });
        return;
      }
      studentId = body.studentId;
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        tenantId,
        applicantUserId: req.user!.sub,
        studentId,
        type: body.type,
        fromDate: body.fromDate,
        toDate: body.toDate,
        reason: body.reason,
      },
      include: {
        applicant: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ leave });

    const who = leave.student
      ? `${leave.applicant.name} requested leave for ${studentName(leave.student)}`
      : `${leave.applicant.name} requested leave`;
    const body_ = `${who} (${leave.type}) · ${range(leave.fromDate, leave.toDate)}`;
    void notifyOwners(tenantId, "New leave request", body_, {
      type: "leave",
      leaveId: leave.id,
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

leavesRouter.get("/", requireRole("OWNER", ...applicantRoles), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const role = req.user!.role;
    const { take, skip, page } = parsePagination(req);
    const status = leaveStatus.optional().parse(req.query.status);

    const where: Prisma.LeaveRequestWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(role === "OWNER" ? {} : { applicantUserId: req.user!.sub }),
    };

    const [total, leaves] = await Promise.all([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          applicant: { select: { id: true, name: true, role: true } },
          student: {
            select: { id: true, firstName: true, lastName: true, room: { select: { roomNumber: true } } },
          },
          reviewedBy: { select: { id: true, name: true } },
        },
      }),
    ]);
    res.json({ leaves, page, total });
  } catch (err) {
    next(err);
  }
});

leavesRouter.get("/:id", requireRole("OWNER", ...applicantRoles), async (req, res, next) => {
  try {
    const role = req.user!.role;
    const leave = await prisma.leaveRequest.findFirst({
      where: {
        id: req.params.id as string,
        tenantId: req.user!.tenantId!,
        ...(role === "OWNER" ? {} : { applicantUserId: req.user!.sub }),
      },
      include: {
        applicant: { select: { id: true, name: true, role: true, email: true } },
        student: {
          select: { id: true, firstName: true, lastName: true, room: { select: { roomNumber: true } } },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    if (!leave) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ leave });
  } catch (err) {
    next(err);
  }
});

leavesRouter.post("/:id/approve", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const leave = await prisma.leaveRequest.findFirst({
      where: { id: req.params.id as string, tenantId },
    });
    if (!leave) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (leave.status !== "PENDING") {
      res.status(400).json({ error: "This request has already been reviewed" });
      return;
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { status: "APPROVED", reviewedById: req.user!.sub, reviewedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: req.user!.sub,
        action: "LEAVE_APPROVED",
        entity: "LeaveRequest",
        entityId: leave.id,
      },
    });

    res.json({ leave: updated });
    void notifyApplicant(
      tenantId,
      leave,
      "Leave approved",
      `Your leave request (${range(leave.fromDate, leave.toDate)}) was approved.`,
      "leave_approved"
    ).catch(() => {});
  } catch (err) {
    next(err);
  }
});

leavesRouter.post("/:id/reject", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z.object({ reason: z.string().max(1000).optional() }).parse(req.body ?? {});
    const leave = await prisma.leaveRequest.findFirst({
      where: { id: req.params.id as string, tenantId },
    });
    if (!leave) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (leave.status !== "PENDING") {
      res.status(400).json({ error: "This request has already been reviewed" });
      return;
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: "REJECTED",
        reviewedById: req.user!.sub,
        reviewedAt: new Date(),
        rejectionReason: body.reason,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: req.user!.sub,
        action: "LEAVE_REJECTED",
        entity: "LeaveRequest",
        entityId: leave.id,
        meta: { reason: body.reason ?? null },
      },
    });

    res.json({ leave: updated });
    void notifyApplicant(
      tenantId,
      leave,
      "Leave request rejected",
      `Your leave request (${range(leave.fromDate, leave.toDate)}) was rejected.` +
        (body.reason ? ` Reason: ${body.reason}` : ""),
      "leave_rejected"
    ).catch(() => {});
  } catch (err) {
    next(err);
  }
});

leavesRouter.post("/:id/cancel", requireRole(...applicantRoles), async (req, res, next) => {
  try {
    const leave = await prisma.leaveRequest.findFirst({
      where: {
        id: req.params.id as string,
        tenantId: req.user!.tenantId!,
        applicantUserId: req.user!.sub,
      },
    });
    if (!leave) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (leave.status !== "PENDING") {
      res.status(400).json({ error: "Only pending requests can be cancelled" });
      return;
    }
    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { status: "CANCELLED" },
    });
    res.json({ leave: updated });
  } catch (err) {
    next(err);
  }
});

// --- helpers ---

async function notifyOwners(
  tenantId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  const owners = await prisma.user.findMany({
    where: {
      role: "OWNER",
      isActive: true,
      OR: [{ ownedTenants: { some: { id: tenantId } } }, { tenantId }],
    },
    select: { id: true },
  });
  if (!owners.length) return;
  await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: { tenantId, title, body, audience: "OWNERS" },
    });
    await tx.notificationRecipient.createMany({
      data: owners.map((o) => ({ notificationId: created.id, userId: o.id })),
    });
  });
  void sendPushToUsers(
    owners.map((o) => o.id),
    { title, body, data }
  ).catch(() => {});
}

async function notifyApplicant(
  tenantId: string,
  leave: { id: string; applicantUserId: string; studentId: string | null },
  title: string,
  body: string,
  kind: string
): Promise<void> {
  const userIds = new Set<string>([leave.applicantUserId]);
  if (leave.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: leave.studentId },
      select: { userId: true },
    });
    if (student?.userId) userIds.add(student.userId);
  }
  const ids = [...userIds];
  await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: { tenantId, title, body, audience: "USER" },
    });
    await tx.notificationRecipient.createMany({
      data: ids.map((userId) => ({ notificationId: created.id, userId })),
      skipDuplicates: true,
    });
  });
  void sendPushToUsers(ids, { title, body, data: { type: kind, leaveId: leave.id } }).catch(
    () => {}
  );
}
