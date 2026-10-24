import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { resolveMediaUrl, deleteMedia, validateCloudinaryRef } from "../lib/fileStore";
import { getStudentForUser, getParentStudentIds } from "../lib/scope";

export const documentsRouter = Router();

// Tenant-scoped. Owners manage any document; students and parents may only
// upload/view documents for themselves or their linked children.
documentsRouter.use(requireAuth, requireTenant);

const docBody = z.object({
  studentId: z.string().optional(),
  userId: z.string().optional(),
  type: z.enum(["ID_PROOF", "PHOTO", "AGREEMENT", "OTHER"]).optional(),
  title: z.string().optional(),
  side: z.enum(["front", "back"]).optional(),
  fileUrl: z.string().min(1),
  mimeType: z.string().optional(),
});

// Documents visible to the signed-in student/parent, grouped by person.
documentsRouter.get(
  "/mine",
  requireRole("STUDENT", "PARENT"),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const role = req.user!.role;

      let ids: string[];
      if (role === "STUDENT") {
        const s = await getStudentForUser(req.user!.sub);
        ids = s ? [s.id] : [];
      } else {
        ids = await getParentStudentIds(req.user!.sub);
      }

      const students = await prisma.student.findMany({
        where: { id: { in: ids }, tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          documents: { orderBy: { createdAt: "desc" } },
        },
      });

      const people = await Promise.all(
        students.map(async (s) => ({
          studentId: s.id,
          name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
          documents: await Promise.all(
            s.documents.map(async (d) => ({ ...d, fileUrl: await resolveMediaUrl(d.fileUrl) }))
          ),
        }))
      );

      res.json({ people });
    } catch (err) {
      next(err);
    }
  }
);

documentsRouter.post(
  "/",
  requireRole("OWNER", "STUDENT", "PARENT"),
  async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const role = req.user!.role;
    const body = docBody.parse(req.body);

    if (role === "STUDENT") {
      const s = await getStudentForUser(req.user!.sub);
      if (!s) {
        res.status(403).json({ error: "No student profile is linked to this login" });
        return;
      }
      if (body.userId) {
        res.status(400).json({ error: "Provide only one of studentId or userId" });
        return;
      }
      if (body.studentId && body.studentId !== s.id) {
        res.status(403).json({ error: "You can only upload documents for yourself" });
        return;
      }
      body.studentId = s.id;
    } else if (role === "PARENT") {
      if (body.userId) {
        res.status(400).json({ error: "Provide only one of studentId or userId" });
        return;
      }
      const ids = await getParentStudentIds(req.user!.sub);
      if (!body.studentId) {
        if (ids.length === 1) {
          body.studentId = ids[0];
        } else {
          res.status(400).json({ error: "studentId is required" });
          return;
        }
      }
      if (!ids.includes(body.studentId)) {
        res.status(403).json({ error: "You can only upload documents for your child" });
        return;
      }
    }

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
    const fileUrl = validateCloudinaryRef(
      body.fileUrl,
      `documents/${scope}/${tenantId}`,
      "image"
    );

    const document = await prisma.document.create({
      data: {
        tenantId,
        studentId: body.studentId,
        userId: body.userId,
        type: body.type ?? "OTHER",
        title: body.title,
        side: body.side,
        fileUrl,
        mimeType: body.mimeType,
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

documentsRouter.get("/", requireRole("OWNER"), async (req, res, next) => {
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

documentsRouter.delete("/:id", requireRole("OWNER", "STUDENT", "PARENT"), async (req, res, next) => {
  try {
    const existing = await prisma.document.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (req.user!.role !== "OWNER" && existing.uploadedById !== req.user!.sub) {
      res.status(403).json({ error: "You can only remove documents you uploaded" });
      return;
    }
    await prisma.document.delete({ where: { id: existing.id } });
    await deleteMedia(existing.fileUrl);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
