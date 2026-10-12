import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { hashPassword } from "../auth";
import { generateTempPassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { storeMaybeDataUrl, resolveOptionalUrl, resolveMediaUrl } from "../lib/fileStore";

export const usersRouter = Router();

// Account management is Owner-only.
usersRouter.use(requireAuth, requireTenant, requireRole("OWNER"));

usersRouter.get("/", async (req, res, next) => {
  try {
    const role = z
      .enum(["OWNER", "STAFF", "GUARD", "STUDENT", "PARENT"])
      .optional()
      .parse(req.query.role);
    const users = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId!, ...(role ? { role } : {}) },
      select: { id: true, name: true, email: true, phone: true, photoUrl: true, role: true, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        photoUrl: true,
        role: true,
        isActive: true,
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      user: {
        ...user,
        photoUrl: await resolveOptionalUrl(user.photoUrl),
        documents: await Promise.all(
          user.documents.map(async (d) => ({ ...d, fileUrl: await resolveMediaUrl(d.fileUrl) }))
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/staff", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        password: z.string().min(6),
        role: z.enum(["STAFF", "GUARD"]).default("STAFF"),
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        tenantId: req.user!.tenantId!,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/parents", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        studentId: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        password: z.string().min(6),
        relation: z.string().optional(),
      })
      .parse(req.body);

    const student = await prisma.student.findFirst({
      where: { id: body.studentId, tenantId },
    });
    if (!student) {
      res.status(400).json({ error: "Invalid student" });
      return;
    }

    let parent = await prisma.user.findUnique({ where: { email: body.email } });
    if (!parent) {
      parent = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          passwordHash: await hashPassword(body.password),
          role: "PARENT",
          tenantId,
        },
      });
    }

    await prisma.parentStudent.upsert({
      where: {
        parentUserId_studentId: { parentUserId: parent.id, studentId: student.id },
      },
      update: { relation: body.relation },
      create: {
        tenantId,
        parentUserId: parent.id,
        studentId: student.id,
        relation: body.relation,
      },
    });

    res.status(201).json({
      parent: { id: parent.id, name: parent.name, email: parent.email },
      studentId: student.id,
    });
  } catch (err) {
    next(err);
  }
});

// Create a login for a student (Owner only). No email/SMS provider needed.
usersRouter.post("/students", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        studentId: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6).optional(),
        phone: z.string().optional(),
      })
      .parse(req.body);

    const student = await prisma.student.findFirst({ where: { id: body.studentId, tenantId } });
    if (!student) {
      res.status(400).json({ error: "Invalid student" });
      return;
    }
    if (student.userId) {
      res.status(409).json({ error: "Student already has a login" });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const password = body.password ?? generateTempPassword();
    const name = [student.firstName, student.lastName].filter(Boolean).join(" ");
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email: body.email,
          phone: body.phone ?? student.phone,
          passwordHash: await hashPassword(password),
          role: "STUDENT",
          tenantId,
        },
      });
      await tx.student.update({ where: { id: student.id }, data: { userId: created.id } });
      return created;
    });

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      temporaryPassword: body.password ? undefined : password,
    });
  } catch (err) {
    next(err);
  }
});

// Reset a user's password (Owner only, within tenant). Returns a generated
// temporary password when none is supplied. No paid email/SMS involved.
usersRouter.post("/:id/reset-password", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.role === "OWNER" && existing.id !== req.user!.sub) {
      res.status(403).json({ error: "Owners cannot reset another owner's password" });
      return;
    }

    const body = z.object({ newPassword: z.string().min(6).optional() }).parse(req.body ?? {});
    const password = body.newPassword ?? generateTempPassword();
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: req.user!.sub,
        action: "PASSWORD_RESET",
        entity: "User",
        entityId: existing.id,
        meta: { generated: !body.newPassword },
      },
    });
    res.json({
      ok: true,
      userId: existing.id,
      temporaryPassword: body.newPassword ? undefined : password,
    });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.role === "OWNER" && existing.id !== req.user!.sub) {
      res.status(403).json({ error: "Owners cannot modify another owner's account" });
      return;
    }
    const body = z
      .object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().nullable().optional(),
        photoUrl: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    if (body.email) {
      const email = body.email.trim().toLowerCase();
      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (taken) {
        res.status(409).json({ error: "That email is already in use" });
        return;
      }
      body.email = email;
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...body,
        photoUrl: await storeMaybeDataUrl(req.user!.tenantId!, body.photoUrl, {
          kind: "image",
          folder: "users",
        }),
      },
      select: { id: true, name: true, email: true, phone: true, photoUrl: true, role: true, isActive: true },
    });
    res.json({ user: { ...user, photoUrl: await resolveOptionalUrl(user.photoUrl) } });
  } catch (err) {
    next(err);
  }
});

usersRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.role === "OWNER") {
      res.status(400).json({ error: "Cannot delete owner" });
      return;
    }
    await prisma.user.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
