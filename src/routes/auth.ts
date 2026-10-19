import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { hashPassword, verifyPassword, signToken } from "../auth";
import { requireAuth } from "../middleware/auth";
import { env } from "../env";
import { mailConfigured, sendMail } from "../lib/mail";

export const authRouter = Router();

const RESET_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "pg"
  );
}

// Register a new PG owner -> creates the tenant + owner user in one transaction.
authRouter.post("/register-owner", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        password: z.string().min(6),
        pgName: z.string().min(1),
        city: z.string().optional(),
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await hashPassword(body.password);

    const baseSlug = slugify(body.pgName);
    let slug = baseSlug;
    let i = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${i++}`;
    }

    const { tenant, user } = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: { name: body.pgName, slug, city: body.city },
      });
      const createdUser = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          passwordHash,
          role: "OWNER",
          tenantId: createdTenant.id,
        },
      });
      await tx.tenant.update({
        where: { id: createdTenant.id },
        data: { ownerUserId: createdUser.id },
      });
      return { tenant: createdTenant, user: createdUser };
    });

    const token = signToken({ sub: user.id, tenantId: tenant.id, role: "OWNER" });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: tenant.id },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = z
      .object({ email: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);

    // Students/staff/owners sign in with their email; parents can use the
    // guardian mobile number instead (they share the student's password).
    const identifier = body.email.trim();
    const user = identifier.includes("@")
      ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
      : await prisma.user.findFirst({
          where: { phone: identifier, role: "PARENT" },
          orderBy: { createdAt: "asc" },
        });
    if (!user) {
      // Only owners can self-reset; everyone else is told to contact their owner.
      res.status(401).json({ error: "Invalid credentials", canReset: false });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({
        error:
          "Your account isn't active yet. If you applied for admission, it may still be pending approval by the PG owner.",
      });
      return;
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      const canReset = user.role === "OWNER";
      res.status(401).json({ error: "Invalid credentials", canReset });
      return;
    }

    const token = signToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, name: true, email: true, phone: true, role: true, tenantId: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// Owner-only password reset. Emails a one-time link to the owner's registered
// address via the configured free SMTP provider. When SMTP isn't configured,
// returns the link so the app can show it (dev mode).
authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Never reveal whether an owner exists for this email.
    if (!user || user.role !== "OWNER" || !user.isActive) {
      res.json({ ok: true, needsEmail: mailConfigured() });
      return;
    }

    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const resetBase = env.resetUrlBase.replace(/\/+$/, "");
    const link = `${resetBase}${resetBase.endsWith(":") ? "//" : "/"}reset-password?token=${token}`;
    const text =
      `Hi ${user.name},\n\n` +
      `We received a request to reset your Dev Hostel password.\n\n` +
      `Open this link to choose a new password (valid for 30 minutes):\n${link}\n\n` +
      `If you didn't request this, you can safely ignore this email.`;
    const html =
      `<p>Hi ${user.name},</p>` +
      `<p>We received a request to reset your Dev Hostel password.</p>` +
      `<p><a href="${link}">Choose a new password</a> — link valid for 30 minutes.</p>` +
      `<p>If you didn't request this, you can safely ignore this email.</p>`;

    let delivered = false;
    if (mailConfigured()) {
      try {
        await sendMail({ to: user.email, subject: "Reset your Dev Hostel password", text, html });
        delivered = true;
      } catch (err) {
        console.error("Password reset email failed:", err);
      }
    } else {
      console.log(`[dev] Password reset link for ${user.email}: ${link}`);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        entity: "User",
        entityId: user.id,
        meta: { delivered },
      },
    });

    res.json({ ok: true, needsEmail: mailConfigured(), devLink: delivered ? null : link });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = z
      .object({ token: z.string().min(20), password: z.string().min(6) })
      .parse(req.body);

    const record = await prisma.passwordResetToken.findFirst({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      res.status(400).json({ error: "Reset link is invalid or has expired" });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: record.user.tenantId,
          actorId: record.userId,
          action: "PASSWORD_RESET",
          entity: "User",
          entityId: record.userId,
          meta: { viaEmail: true },
        },
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
