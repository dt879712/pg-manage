import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../env";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { getParentStudentIds, getStudentForUser } from "../lib/scope";
import {
  destroyAsset,
  inspectUploadedAsset,
  signDirectUpload,
  type CloudResourceType,
} from "../lib/cloudinary";
import { mediaStorageConfigured, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../lib/fileStore";

export const mediaRouter = Router();

const purposeSchema = z.enum([
  "student-photo",
  "user-photo",
  "document",
  "tenant-branding",
  "tenant-gallery",
  "status-video",
  "admission-document",
]);
type UploadPurpose = z.infer<typeof purposeSchema>;

type UploadContext = {
  tenantId: string;
  folder: string;
  resourceType: CloudResourceType;
  studentId?: string;
  userId?: string;
};

async function resolveUploadContext(
  purpose: UploadPurpose,
  tenantId: string,
  actor: NonNullable<Express.Request["user"]>,
  studentId?: string,
  userId?: string
): Promise<UploadContext> {
  if (["student-photo", "user-photo", "tenant-branding", "tenant-gallery"].includes(purpose)) {
    if (actor.role !== "OWNER") throw Object.assign(new Error("Only the PG owner can upload this media."), { status: 403 });
  }

  if (purpose === "student-photo") return { tenantId, folder: "students", resourceType: "image" };
  if (purpose === "user-photo") return { tenantId, folder: "users", resourceType: "image" };
  if (purpose === "tenant-branding") return { tenantId, folder: "branding", resourceType: "image" };
  if (purpose === "tenant-gallery") return { tenantId, folder: "branding/gallery", resourceType: "image" };

  if (purpose === "status-video") {
    if (actor.role !== "GUARD") throw Object.assign(new Error("Only guards can upload status videos."), { status: 403 });
    if (!studentId) throw Object.assign(new Error("Choose a student for this video."), { status: 400 });
    const student = await prisma.student.findFirst({ where: { id: studentId, tenantId, status: "ACTIVE" } });
    if (!student) throw Object.assign(new Error("Student not found."), { status: 404 });
    return { tenantId, folder: `status-videos/${studentId}`, resourceType: "video", studentId };
  }

  if (actor.role !== "OWNER" && actor.role !== "STUDENT" && actor.role !== "PARENT") {
    throw Object.assign(new Error("You cannot upload this document."), { status: 403 });
  }
  if (Boolean(studentId) === Boolean(userId)) {
    throw Object.assign(new Error("Choose exactly one student or user for this document."), { status: 400 });
  }
  if (actor.role === "STUDENT") {
    const student = await getStudentForUser(actor.sub);
    if (!student || userId || (studentId && studentId !== student.id)) {
      throw Object.assign(new Error("You can only upload documents for yourself."), { status: 403 });
    }
    studentId = student.id;
  } else if (actor.role === "PARENT") {
    const linkedIds = await getParentStudentIds(actor.sub);
    if (!studentId || !linkedIds.includes(studentId) || userId) {
      throw Object.assign(new Error("You can only upload documents for your child."), { status: 403 });
    }
  }

  if (studentId) {
    const student = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true } });
    if (!student) throw Object.assign(new Error("Student not found."), { status: 404 });
    return { tenantId, folder: `documents/student/${studentId}`, resourceType: "image", studentId };
  }
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  if (!user) throw Object.assign(new Error("User not found."), { status: 404 });
  return { tenantId, folder: `documents/user/${userId}`, resourceType: "image", userId };
}

function publicAdmissionRateLimit(req: Request, res: Response): boolean {
  const key = req.ip || "unknown";
  const now = Date.now();
  const prior = admissionRequests.get(key);
  const record = !prior || now - prior.startedAt >= 60_000
    ? { startedAt: now, count: 1 }
    : { ...prior, count: prior.count + 1 };
  admissionRequests.set(key, record);
  if (record.count <= 30) return true;
  res.status(429).json({ error: "Too many upload requests. Please try again shortly." });
  return false;
}

const admissionRequests = new Map<string, { startedAt: number; count: number }>();

function issueSignature(context: UploadContext) {
  if (!mediaStorageConfigured()) {
    throw Object.assign(new Error("Cloudinary is not configured."), { status: 503 });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${context.folder}/${context.tenantId}`;
  const publicId = randomUUID();
  const type = "authenticated";
  const params = { folder, public_id: publicId, timestamp, type };
  return {
    cloudName: env.cloudinaryCloudName,
    apiKey: env.cloudinaryApiKey,
    resourceType: context.resourceType,
    folder,
    publicId,
    timestamp,
    type,
    signature: signDirectUpload(params),
  };
}

async function confirmUpload(
  context: UploadContext,
  publicId: string
) {
  if (!mediaStorageConfigured()) throw Object.assign(new Error("Cloudinary is not configured."), { status: 503 });
  const asset = await inspectUploadedAsset(publicId, context.resourceType);
  const expectedFolder = `${context.folder}/${context.tenantId}/`;
  if (asset.type !== "authenticated" || !asset.publicId.startsWith(expectedFolder)) {
    throw Object.assign(new Error("Uploaded media does not belong to this PG."), { status: 403 });
  }
  const maxBytes = context.resourceType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (asset.bytes <= 0 || asset.bytes > maxBytes) {
    await destroyAsset(asset.publicId, context.resourceType).catch(() => {});
    throw Object.assign(new Error(`Uploaded file exceeds the ${(maxBytes / (1024 * 1024)).toFixed(1)} MB limit.`), {
      status: 413,
    });
  }
  return {
    fileUrl: `cld:${context.resourceType}:${asset.publicId}`,
    mimeType: context.resourceType === "video" ? "video/mp4" : "image/jpeg",
    sizeBytes: asset.bytes,
  };
}

mediaRouter.post("/sign", requireAuth, requireTenant, async (req, res, next) => {
  try {
    const body = z.object({
      purpose: purposeSchema,
      studentId: z.string().optional(),
      userId: z.string().optional(),
    }).parse(req.body);
    if (body.purpose === "admission-document") throw Object.assign(new Error("Invalid upload purpose."), { status: 400 });
    const context = await resolveUploadContext(body.purpose, req.user!.tenantId!, req.user!, body.studentId, body.userId);
    res.json(issueSignature(context));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status) res.status(status).json({ error: (error as Error).message });
    else next(error);
  }
});

mediaRouter.post("/confirm", requireAuth, requireTenant, async (req, res, next) => {
  try {
    const body = z.object({
      purpose: purposeSchema,
      publicId: z.string().min(1).max(512),
      studentId: z.string().optional(),
      userId: z.string().optional(),
    }).parse(req.body);
    if (body.purpose === "admission-document") throw Object.assign(new Error("Invalid upload purpose."), { status: 400 });
    const context = await resolveUploadContext(body.purpose, req.user!.tenantId!, req.user!, body.studentId, body.userId);
    res.json(await confirmUpload(context, body.publicId));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status) res.status(status).json({ error: (error as Error).message });
    else next(error);
  }
});

mediaRouter.post("/admission/sign", (req, res, next) => {
  if (!publicAdmissionRateLimit(req, res)) return;
  next();
}, async (req, res, next) => {
  try {
    const body = z.object({ purpose: z.literal("admission-document") }).parse(req.body);
    const tenant = await prisma.tenant.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!tenant) {
      res.status(404).json({ error: "No PG is currently accepting applications" });
      return;
    }
    res.json(issueSignature({ tenantId: tenant.id, folder: "admissions", resourceType: "image" }));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status) res.status(status).json({ error: (error as Error).message });
    else next(error);
  }
});

mediaRouter.post("/admission/confirm", (req, res, next) => {
  if (!publicAdmissionRateLimit(req, res)) return;
  next();
}, async (req, res, next) => {
  try {
    z.object({ purpose: z.literal("admission-document"), publicId: z.string().min(1).max(512) }).parse(req.body);
    const tenant = await prisma.tenant.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!tenant) {
      res.status(404).json({ error: "No PG is currently accepting applications" });
      return;
    }
    res.json(await confirmUpload({
      tenantId: tenant.id,
      folder: "admissions",
      resourceType: "image",
    }, req.body.publicId));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status) res.status(status).json({ error: (error as Error).message });
    else next(error);
  }
});
