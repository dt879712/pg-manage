import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { hashPassword } from "../auth";
import { generateTempPassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { storeMaybeDataUrl, resolveOptionalUrl, resolveMediaUrl } from "../lib/fileStore";
import { ensureGuardianParent, syncStudentPasswordToParents } from "../lib/guardian";

export const usersRouter = Router();

// Account management is Owner-only.
usersRouter.use(requireAuth, requireTenant, requireRole("OWNER"));

// Logins must have a unique email (the DB requires it), but owners often only
// have a student's or parent's mobile number. When no email is supplied we
// derive a stable placeholder from the phone so the account can still be
// created and later signed in with the phone number.
function accountEmail(email?: string, phone?: string): string {
  if (email?.trim()) return email.trim().toLowerCase();
  const digits = (phone ?? "").replace(/\D/g, "");
  return `user-${digits || "unknown"}@devhostel.local`;
}

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
        isSuperParent: true,
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
        email: z.string().email().optional(),
        phone: z.string().optional(),
        password: z.string().min(6),
        relation: z.string().optional(),
      })
      .parse(req.body);

    if (!body.email && !body.phone?.trim()) {
      res.status(400).json({ error: "Enter an email or a mobile number" });
      return;
    }

    const student = await prisma.student.findFirst({
      where: { id: body.studentId, tenantId },
    });
    if (!student) {
      res.status(400).json({ error: "Invalid student" });
      return;
    }

    const email = accountEmail(body.email, body.phone);
    const phone = body.phone?.trim();
    let parent = await prisma.user.findFirst({
      where: {
        tenantId,
        role: "PARENT",
        OR: [{ email }, ...(phone ? [{ phone }] : [])],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!parent) {
      parent = await prisma.user.create({
        data: {
          name: body.name,
          email,
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
// The owner can identify the login by email OR by mobile number.
usersRouter.post("/students", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        studentId: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        password: z.string().min(6).optional(),
      })
      .parse(req.body);

    if (!body.email && !body.phone?.trim()) {
      res.status(400).json({ error: "Enter an email or a mobile number" });
      return;
    }

    const student = await prisma.student.findFirst({ where: { id: body.studentId, tenantId } });
    if (!student) {
      res.status(400).json({ error: "Invalid student" });
      return;
    }
    if (student.userId) {
      res.status(409).json({ error: "Student already has a login" });
      return;
    }
    const email = accountEmail(body.email, body.phone ?? student.phone ?? undefined);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "That login is already registered" });
      return;
    }

    const password = body.password ?? generateTempPassword();
    const passwordHash = await hashPassword(password);
    const name = [student.firstName, student.lastName].filter(Boolean).join(" ");
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          phone: body.phone ?? student.phone,
          passwordHash,
          role: "STUDENT",
          tenantId,
        },
      });
      await tx.student.update({ where: { id: student.id }, data: { userId: created.id } });
      await ensureGuardianParent(tx, tenantId, student, passwordHash);
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
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: existing.id }, data: { passwordHash } });
      if (existing.role === "STUDENT") {
        const student = await tx.student.findFirst({
          where: { userId: existing.id, tenantId },
          select: { id: true },
        });
        if (student) await syncStudentPasswordToParents(tx, student.id, passwordHash);
      }
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
        isSuperParent: z.boolean().nullable().optional(),
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
      select: { id: true, name: true, email: true, phone: true, photoUrl: true, role: true, isActive: true, isSuperParent: true },
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
