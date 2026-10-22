import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { getStudentForUser, getParentStudentIds } from "../lib/scope";
import { sendPushToUsers } from "../lib/push";
import {
  storeMedia,
  resolveMediaUrl,
  deleteMedia,
  mediaStorageConfigured,
} from "../lib/fileStore";

export const statusVideosRouter = Router();
statusVideosRouter.use(requireAuth, requireTenant);

const recorderRoles = ["GUARD"] as const;
const viewerRoles = ["OWNER", "STAFF", "GUARD", "STUDENT", "PARENT"] as const;
const directionEnum = z.enum(["CHECK_IN", "CHECK_OUT"]);

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  room: { select: { roomNumber: true } },
} satisfies Prisma.StudentSelect;

async function resolveStudent(req: Request, explicitId?: string) {
  const tenantId = req.user!.tenantId!;
  if (!explicitId) return null;
  return prisma.student.findFirst({ where: { id: explicitId, tenantId } });
}

/**
 * Record a 6-second check-in/out clip in a single request. The clip arrives as
 * a base64 data URL, is pushed to Cloudinary, then replaces the student's
 * previous clip and writes the matching attendance row.
 */
statusVideosRouter.post("/", requireRole(...recorderRoles), async (req, res, next) => {
  try {
    if (!mediaStorageConfigured()) {
      res.status(503).json({ error: "Video storage is not configured" });
      return;
    }
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        dataUrl: z.string().min(1),
        direction: directionEnum,
        studentId: z.string().optional(),
        mimeType: z.string().optional(),
      })
      .parse(req.body);

    const student = await resolveStudent(req, body.studentId);
    if (!student || student.status !== "ACTIVE") {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    // Enforce the same in/out sequence as attendance.
    const last = await prisma.attendance.findFirst({
      where: { studentId: student.id },
      orderBy: { at: "desc" },
      select: { type: true },
    });
    const state = last?.type ?? "NONE";
    const wrong = body.direction === "CHECK_IN" ? state === "CHECK_IN" : state !== "CHECK_IN";
    if (wrong) {
      res.status(409).json({
        error: body.direction === "CHECK_IN" ? "Already checked in" : "Already checked out",
      });
      return;
    }

    let stored;
    try {
      stored = await storeMedia(tenantId, body.dataUrl, body.mimeType ?? "video/mp4", {
        kind: "video",
        folder: `status-videos/${student.id}`,
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status) {
        res.status(status).json({ error: (err as Error).message });
        return;
      }
      throw err;
    }

    const previous = await prisma.studentStatusVideo.findMany({
      where: { studentId: student.id },
      select: { id: true, objectKey: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      await tx.studentStatusVideo.deleteMany({ where: { studentId: student.id } });
      const attendance = await tx.attendance.create({
        data: {
          tenantId,
          studentId: student.id,
          type: body.direction,
          method: "STAFF_MANUAL",
          recordedById: req.user!.sub,
        },
      });
      const video = await tx.studentStatusVideo.create({
        data: {
          tenantId,
          studentId: student.id,
          direction: body.direction,
          objectKey: stored.fileUrl,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          recordedById: req.user!.sub,
        },
      });
      return { attendance, video };
    });

    // Best-effort cleanup of the replaced clips from storage.
    await Promise.all(previous.map((p) => deleteMedia(p.objectKey)));

    res.status(201).json({ video: result.video, attendance: result.attendance });

    void notifyStakeholders(tenantId, student, body.direction, req.user!.sub).catch(() => {});
  } catch (err) {
    next(err);
  }
});

/** Latest clip per relevant student, with a playable (signed) URL. */
statusVideosRouter.get("/", requireRole(...viewerRoles), async (req, res, next) => {
  try {
    if (!mediaStorageConfigured()) {
      res.status(503).json({ error: "Video storage is not configured" });
      return;
    }
    const tenantId = req.user!.tenantId!;
    const role = req.user!.role;

    let scopedStudentIds: string[] | null = null;
    if (role === "STUDENT") {
      const s = await getStudentForUser(req.user!.sub);
      scopedStudentIds = s ? [s.id] : [];
    } else if (role === "PARENT") {
      scopedStudentIds = await getParentStudentIds(req.user!.sub);
    }

    const videos = await prisma.studentStatusVideo.findMany({
      where: {
        tenantId,
        ...(scopedStudentIds ? { studentId: { in: scopedStudentIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { student: { select: studentSelect } },
    });

    const items = await Promise.all(
      videos.map(async (v) => ({
        id: v.id,
        studentId: v.studentId,
        student: v.student,
        direction: v.direction,
        createdAt: v.createdAt,
        url: await resolveMediaUrl(v.objectKey).catch(() => null),
      }))
    );

    res.json({ videos: items });
  } catch (err) {
    next(err);
  }
});

statusVideosRouter.get("/:studentId", requireRole(...viewerRoles), async (req, res, next) => {
  try {
    if (!mediaStorageConfigured()) {
      res.status(503).json({ error: "Video storage is not configured" });
      return;
    }
    const tenantId = req.user!.tenantId!;
    const role = req.user!.role;
    const studentId = req.params.studentId as string;

    if (role === "STUDENT") {
      const s = await getStudentForUser(req.user!.sub);
      if (!s || s.id !== studentId) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    } else if (role === "PARENT") {
      const ids = await getParentStudentIds(req.user!.sub);
      if (!ids.includes(studentId)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }

    const video = await prisma.studentStatusVideo.findFirst({
      where: { tenantId, studentId },
      orderBy: { createdAt: "desc" },
      include: { student: { select: studentSelect } },
    });
    if (!video) {
      res.status(404).json({ error: "No video" });
      return;
    }

    res.json({
      video: {
        id: video.id,
        studentId: video.studentId,
        student: video.student,
        direction: video.direction,
        createdAt: video.createdAt,
        url: await resolveMediaUrl(video.objectKey).catch(() => null),
      },
    });
  } catch (err) {
    next(err);
  }
});

// --- helpers ---

async function notifyStakeholders(
  tenantId: string,
  student: { id: string; firstName: string; lastName: string | null },
  direction: "CHECK_IN" | "CHECK_OUT",
  actorId: string
): Promise<void> {
  const staff = await prisma.user.findMany({
    where: { tenantId, role: { in: ["OWNER", "STAFF", "GUARD"] }, isActive: true },
    select: { id: true },
  });
  const parents = await prisma.parentStudent.findMany({
    where: { studentId: student.id },
    select: { parentUserId: true },
  });
  const recipients = new Set<string>();
  for (const s of staff) recipients.add(s.id);
  for (const p of parents) recipients.add(p.parentUserId);
  recipients.delete(actorId);
  const ids = [...recipients];
  if (!ids.length) return;

  const name = [student.firstName, student.lastName].filter(Boolean).join(" ");
  const title = direction === "CHECK_IN" ? `${name} checked in` : `${name} checked out`;
  const body =
    direction === "CHECK_IN"
      ? `${name} has returned to the PG (6s video).`
      : `${name} has left the PG (6s video).`;

  await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: { tenantId, title, body, audience: "ALL" },
    });
    await tx.notificationRecipient.createMany({
      data: ids.map((userId) => ({ notificationId: created.id, userId })),
    });
  });

  void sendPushToUsers(ids, {
    title,
    body,
    data: { type: "status-video", studentId: student.id, direction },
  }).catch(() => {});
}
