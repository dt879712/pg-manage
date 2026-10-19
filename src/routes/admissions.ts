import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { hashPassword } from "../auth";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { sendPushToUsers } from "../lib/push";
import { mailConfigured, sendMail } from "../lib/mail";
import { storeMedia, resolveMediaUrl } from "../lib/fileStore";
import { ensureGuardianParent } from "../lib/guardian";

export const admissionsRouter = Router();

// This router mixes public (unauthenticated) applicant endpoints with
// owner-only review endpoints. Owner routes apply their own guards.

const ownerGuard = [requireAuth, requireTenant, requireRole("OWNER")];

const documentInput = z.object({
  type: z.enum(["ID_PROOF", "PHOTO", "AGREEMENT", "OTHER"]).default("OTHER"),
  title: z.string().optional(),
  dataUrl: z.string().min(1),
  mimeType: z.string().optional(),
});

const applyBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dob: z.coerce.date().optional(),
  phone: z.string().min(4),
  email: z.string().email(),
  address: z.string().optional(),
  course: z.string().optional(),
  college: z.string().optional(),
  note: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().optional(),
  password: z.string().min(6),
  documents: z.array(documentInput).min(1),
});

/** The public application form targets the single configured PG (first active tenant). */
async function resolvePublicTenant() {
  return prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      description: true,
      address: true,
      city: true,
      phone: true,
      email: true,
    },
  });
}

// --- Public ---

admissionsRouter.get("/pg", async (_req, res, next) => {
  try {
    const tenant = await resolvePublicTenant();
    if (!tenant) {
      res.status(404).json({ error: "No PG is currently accepting applications" });
      return;
    }
    res.json({ pg: tenant });
  } catch (err) {
    next(err);
  }
});

admissionsRouter.post("/", async (req, res, next) => {
  try {
    const body = applyBody.parse(req.body);
    const tenant = await resolvePublicTenant();
    if (!tenant) {
      res.status(404).json({ error: "No PG is currently accepting applications" });
      return;
    }

    const email = body.email.trim().toLowerCase();
    const name = [body.firstName, body.lastName].filter(Boolean).join(" ");

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const pending = await prisma.admissionRequest.findFirst({
      where: { tenantId: tenant.id, email, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      res.status(409).json({ error: "You already have a pending application" });
      return;
    }

    const passwordHash = await hashPassword(body.password);

    let storedDocuments;
    try {
      storedDocuments = await Promise.all(
        body.documents.map(async (d) => {
          const result = await storeMedia(tenant.id, d.dataUrl, d.mimeType, {
            kind: "image",
            folder: "admissions",
          });
          return { type: d.type, title: d.title, fileUrl: result.fileUrl, mimeType: result.mimeType };
        })
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status) {
        res.status(status).json({ error: (err as Error).message });
        return;
      }
      throw err;
    }

    const request = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone: body.phone,
          role: "STUDENT",
          tenantId: tenant.id,
          passwordHash,
          isActive: false,
        },
      });
      const created = await tx.admissionRequest.create({
        data: {
          tenantId: tenant.id,
          firstName: body.firstName,
          lastName: body.lastName,
          gender: body.gender,
          dob: body.dob,
          phone: body.phone,
          email,
          address: body.address,
          course: body.course,
          college: body.college,
          note: body.note,
          guardianName: body.guardianName,
          guardianPhone: body.guardianPhone,
          guardianEmail: body.guardianEmail,
          passwordHash,
          userId: user.id,
        },
      });
      await tx.document.createMany({
        data: storedDocuments.map((d) => ({
          tenantId: tenant.id,
          admissionRequestId: created.id,
          type: d.type,
          title: d.title,
          fileUrl: d.fileUrl,
          mimeType: d.mimeType,
        })),
      });
      return created;
    });

    res.status(201).json({ admission: { id: request.id, status: request.status } });

    void notifyOwners(tenant.id, request.id, name).catch(() => {});
  } catch (err) {
    next(err);
  }
});

admissionsRouter.post("/status", async (req, res, next) => {
  try {
    const body = z
      .object({ email: z.string().email(), phone: z.string().min(1) })
      .parse(req.body);
    const tenant = await resolvePublicTenant();
    if (!tenant) {
      res.status(404).json({ error: "No PG is currently accepting applications" });
      return;
    }
    const request = await prisma.admissionRequest.findFirst({
      where: { tenantId: tenant.id, email: body.email.trim().toLowerCase(), phone: body.phone },
      orderBy: { createdAt: "desc" },
      include: { room: { select: { roomNumber: true } }, bed: { select: { label: true } } },
    });
    if (!request || request.phone !== body.phone) {
      res.status(404).json({ error: "No application found for those details" });
      return;
    }
    res.json({
      status: request.status,
      firstName: request.firstName,
      roomNumber: request.room?.roomNumber ?? null,
      bedLabel: request.bed?.label ?? null,
      rejectionReason: request.rejectionReason,
      submittedAt: request.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// --- Owner review ---
// Owners may run multiple PGs: the list spans every PG they own, and an
// application can be approved into any of them (targetPgId).

async function ownedTenantIds(ownerId: string): Promise<string[]> {
  const pgs = await prisma.tenant.findMany({
    where: { ownerUserId: ownerId },
    select: { id: true },
  });
  return pgs.map((p) => p.id);
}

admissionsRouter.get("/", ...ownerGuard, async (req, res, next) => {
  try {
    const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional().parse(req.query.status);
    const tenantIds = await ownedTenantIds(req.user!.sub);
    const admissions = await prisma.admissionRequest.findMany({
      where: { tenantId: { in: tenantIds }, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        room: { select: { roomNumber: true } },
        bed: { select: { label: true } },
        tenant: { select: { id: true, name: true } },
      },
    });
    res.json({ admissions });
  } catch (err) {
    next(err);
  }
});

admissionsRouter.get("/:id", ...ownerGuard, async (req, res, next) => {
  try {
    const tenantIds = await ownedTenantIds(req.user!.sub);
    const admission = await prisma.admissionRequest.findFirst({
      where: { id: req.params.id as string, tenantId: { in: tenantIds } },
      include: {
        room: { select: { roomNumber: true } },
        bed: { select: { label: true } },
        tenant: { select: { id: true, name: true } },
        documents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!admission) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      admission: {
        ...admission,
        documents: await Promise.all(
          admission.documents.map(async (d) => ({ ...d, fileUrl: await resolveMediaUrl(d.fileUrl) }))
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

admissionsRouter.post("/:id/approve", ...ownerGuard, async (req, res, next) => {
  try {
    const body = z
      .object({
        // Target PG to admit the student into. Defaults to the PG the
        // application was submitted to.
        tenantId: z.string().optional(),
        roomId: z.string().optional(),
        bedId: z.string().optional(),
        monthlyFee: z.number().int().nonnegative().optional(),
        paidForCurrentMonth: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    const tenantIds = await ownedTenantIds(req.user!.sub);
    const request = await prisma.admissionRequest.findFirst({
      where: { id: req.params.id as string, tenantId: { in: tenantIds } },
    });
    if (!request) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (request.status !== "PENDING") {
      res.status(400).json({ error: "This application has already been reviewed" });
      return;
    }

    // Decide which PG the student is allotted to.
    const tenantId = body.tenantId ?? request.tenantId;
    if (!tenantIds.includes(tenantId)) {
      res.status(403).json({ error: "You cannot admit a student into that PG" });
      return;
    }

    let roomId: string | null = null;
    let bedId: string | null = null;
    if (body.bedId) {
      const bed = await prisma.bed.findFirst({ where: { id: body.bedId, tenantId } });
      if (!bed) {
        res.status(400).json({ error: "Invalid bed" });
        return;
      }
      if (bed.status === "OCCUPIED") {
        res.status(400).json({ error: "That bed is already occupied" });
        return;
      }
      const occupant = await prisma.student.findFirst({
        where: { bedId: bed.id, tenantId, status: "ACTIVE" },
        select: { firstName: true, lastName: true },
      });
      if (occupant) {
        const name = [occupant.firstName, occupant.lastName].filter(Boolean).join(" ");
        res.status(400).json({ error: `That bed is already occupied${name ? ` by ${name}` : ""}` });
        return;
      }
      roomId = bed.roomId;
      bedId = bed.id;
    } else if (body.roomId) {
      const room = await prisma.room.findFirst({ where: { id: body.roomId, tenantId } });
      if (!room) {
        res.status(400).json({ error: "Invalid room" });
        return;
      }
      roomId = room.id;
    }

    const name = [request.firstName, request.lastName].filter(Boolean).join(" ");

    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          tenantId,
          firstName: request.firstName,
          lastName: request.lastName,
          gender: request.gender,
          dob: request.dob,
          phone: request.phone,
          email: request.email,
          address: request.address,
          guardianName: request.guardianName,
          guardianPhone: request.guardianPhone,
          guardianEmail: request.guardianEmail,
          monthlyFee: body.monthlyFee ?? undefined,
          roomId,
          bedId,
          createdById: req.user!.sub,
        },
      });
      if (bedId) {
        await tx.bed.update({ where: { id: bedId }, data: { status: "OCCUPIED" } });
      }
      if (request.userId) {
        await tx.user.update({
          where: { id: request.userId },
          data: { isActive: true, name, phone: request.phone, tenantId },
        });
        await tx.student.update({ where: { id: created.id }, data: { userId: request.userId } });
      }
      await tx.admissionRequest.update({
        where: { id: request.id },
        data: {
          tenantId,
          status: "APPROVED",
          roomId,
          bedId,
          studentId: created.id,
          reviewedById: req.user!.sub,
          reviewedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.user!.sub,
          action: "ADMISSION_APPROVED",
          entity: "AdmissionRequest",
          entityId: request.id,
          meta: { studentId: created.id, roomId, bedId, pgId: tenantId, fromPgId: request.tenantId },
        },
      });
      await ensureGuardianParent(tx, tenantId, created, request.passwordHash);
      const amount = body.monthlyFee ?? 0;
      if (body.paidForCurrentMonth && amount > 0) {
        const now = new Date();
        const invoice = await tx.invoice.create({
          data: {
            tenantId,
            studentId: created.id,
            title: `Monthly fee — ${now.toLocaleString("en-IN", { month: "long" })} ${now.getFullYear()}`,
            amount,
            periodMonth: now.getMonth() + 1,
            periodYear: now.getFullYear(),
            status: "PAID",
            dueDate: now,
          },
        });
        await tx.payment.create({
          data: {
            tenantId,
            studentId: created.id,
            invoiceId: invoice.id,
            amount,
            method: "CASH",
            note: "Paid on admission",
            recordedById: req.user!.sub,
          },
        });
      }
      return created;
    });

    const room = roomId
      ? await prisma.room.findUnique({ where: { id: roomId }, select: { roomNumber: true } })
      : null;
    const bed = bedId
      ? await prisma.bed.findUnique({ where: { id: bedId }, select: { label: true } })
      : null;
    const placement = room ? `Room ${room.roomNumber}${bed ? ` · ${bed.label}` : ""}` : "your allotted room";

    res.json({ ok: true, studentId: student.id });

    if (request.userId) {
      void notifyStudent(
        tenantId,
        request.userId,
        request.email,
        "Admission approved",
        `Welcome ${name}! You've been allotted ${placement}. You can now sign in.`,
        request.id
      ).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

admissionsRouter.post("/:id/reject", ...ownerGuard, async (req, res, next) => {
  try {
    const tenantIds = await ownedTenantIds(req.user!.sub);
    const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const request = await prisma.admissionRequest.findFirst({
      where: { id: req.params.id as string, tenantId: { in: tenantIds } },
    });
    if (!request) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (request.status !== "PENDING") {
      res.status(400).json({ error: "This application has already been reviewed" });
      return;
    }
    const tenantId = request.tenantId;

    await prisma.$transaction(async (tx) => {
      await tx.admissionRequest.update({
        where: { id: request.id },
        data: {
          status: "REJECTED",
          rejectionReason: body.reason,
          reviewedById: req.user!.sub,
          reviewedAt: new Date(),
        },
      });
      if (request.userId) {
        await tx.user.delete({ where: { id: request.userId } });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.user!.sub,
          action: "ADMISSION_REJECTED",
          entity: "AdmissionRequest",
          entityId: request.id,
          meta: { reason: body.reason ?? null },
        },
      });
    });

    res.json({ ok: true });

    if (mailConfigured()) {
      const text =
        `Hi ${request.firstName},\n\n` +
        `Thank you for your interest in ${await tenantName(tenantId)}. ` +
        `Unfortunately we're unable to offer you admission at this time.` +
        (body.reason ? `\n\nReason: ${body.reason}` : "") +
        `\n\nYou're welcome to apply again in future.`;
      void sendMail({ to: request.email, subject: "Update on your admission request", text }).catch(
        () => {}
      );
    }
  } catch (err) {
    next(err);
  }
});

// --- helpers ---

async function tenantName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name ?? "Dev Hostel";
}

async function notifyOwners(tenantId: string, admissionId: string, applicantName: string) {
  // The PG's owner may be signed into a different PG (multi-PG owners), so
  // match by ownership as well as by active tenant.
  const owners = await prisma.user.findMany({
    where: {
      role: "OWNER",
      isActive: true,
      OR: [{ ownedTenants: { some: { id: tenantId } } }, { tenantId }],
    },
    select: { id: true },
  });
  const title = "New admission request";
  const body = `${applicantName} has applied for admission`;
  if (owners.length) {
    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: { tenantId, title, body, audience: "OWNERS" },
      });
      await tx.notificationRecipient.createMany({
        data: owners.map((o) => ({ notificationId: created.id, userId: o.id })),
      });
      return created;
    });
    void sendPushToUsers(
      owners.map((o) => o.id),
      { title, body, data: { type: "admission", admissionId } }
    ).catch(() => {});
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { email: true },
  });
  if (mailConfigured() && tenant?.email) {
    void sendMail({
      to: tenant.email,
      subject: "New student admission request",
      text: `${applicantName} has applied for admission. Open Dev Hostel to review and allot a room.`,
    }).catch(() => {});
  }
}

async function notifyStudent(
  tenantId: string,
  userId: string,
  email: string,
  title: string,
  body: string,
  admissionId: string
) {
  await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: { tenantId, title, body, audience: "USER" },
    });
    await tx.notificationRecipient.create({
      data: { notificationId: created.id, userId },
    });
  });
  void sendPushToUsers([userId], { title, body, data: { type: "admission", admissionId } }).catch(
    () => {}
  );
  if (mailConfigured()) {
    void sendMail({ to: email, subject: title, text: body }).catch(() => {});
  }
}
