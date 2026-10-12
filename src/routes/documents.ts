import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { storeMedia, resolveMediaUrl, deleteMedia } from "../lib/fileStore";

export const documentsRouter = Router();

// Documents contain ID proofs / photos -> Owner-only, tenant-scoped.
documentsRouter.use(requireAuth, requireTenant, requireRole("OWNER"));

const docBody = z.object({
  studentId: z.string().optional(),
  userId: z.string().optional(),
  type: z.enum(["ID_PROOF", "PHOTO", "AGREEMENT", "OTHER"]).optional(),
  title: z.string().optional(),
  dataUrl: z.string().min(1),
  mimeType: z.string().optional(),
});

documentsRouter.post("/", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = docBody.parse(req.body);
    if (!body.studentId && !body.userId) {
      res.status(400).json({ error: "studentId or userId is required" });
      return;
    }
    if (body.studentId && body.userId) {
      res.status(400).json({ error: "Provide only one of studentId or userId" });
      return;
    }

    if (body.studentId) {
      const student = await prisma.student.findFirst({ where: { id: body.studentId, tenantId } });
      if (!student) {
        res.status(400).json({ error: "Invalid student" });
        return;
      }
    } else if (body.userId) {
      const user = await prisma.user.findFirst({ where: { id: body.userId, tenantId } });
      if (!user) {
        res.status(400).json({ error: "Invalid user" });
        return;
      }
    }

    const scope = body.studentId ? `student/${body.studentId}` : `user/${body.userId}`;
    let stored;
    try {
      stored = await storeMedia(tenantId, body.dataUrl, body.mimeType, {
        kind: "image",
        folder: `documents/${scope}`,
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status) {
        res.status(status).json({ error: (err as Error).message });
        return;
      }
      throw err;
    }

    const document = await prisma.document.create({
      data: {
        tenantId,
        studentId: body.studentId,
        userId: body.userId,
        type: body.type ?? "OTHER",
        title: body.title,
        fileUrl: stored.fileUrl,
        mimeType: stored.mimeType,
        uploadedById: req.user!.sub,
      },
    });
    res.status(201).json({
      document: { ...document, fileUrl: await resolveMediaUrl(document.fileUrl) },
    });
  } catch (err) {
    next(err);
  }
});

documentsRouter.get("/", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const studentId = req.query.studentId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const documents = await prisma.document.findMany({
      where: {
        tenantId,
        ...(studentId ? { studentId } : {}),
        ...(userId ? { userId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    const withUrls = await Promise.all(
      documents.map(async (d) => ({ ...d, fileUrl: await resolveMediaUrl(d.fileUrl) }))
    );
    res.json({ documents: withUrls });
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.document.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.document.delete({ where: { id: existing.id } });
    await deleteMedia(existing.fileUrl);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
