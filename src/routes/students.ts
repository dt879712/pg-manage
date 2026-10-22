import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword } from "../auth";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { parsePagination } from "../lib/pagination";
import { storeMaybeDataUrl, resolveOptionalUrl, resolveMediaUrl } from "../lib/fileStore";
import { accountEmailFor } from "../lib/guardian";

export const studentsRouter = Router();

// Student personal data is Owner-only. Staff never sees it.
studentsRouter.use(requireAuth, requireTenant, requireRole("OWNER"));

const studentBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dob: z.coerce.date().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  photoUrl: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().optional(),
  monthlyFee: z.number().int().nonnegative().nullable().optional(),
  roomId: z.string().optional(),
  bedId: z.string().optional(),
  joinDate: z.coerce.date().optional(),
});

const studentCreateBody = studentBody.extend({
  paidForCurrentMonth: z.boolean().optional(),
  paidAmount: z.number().int().positive().optional(),
  // Optional logins created together with the student. When supplied, the
  // student and guardian accounts are created and linked in the same step.
  studentEmail: z.string().email().optional(),
  studentPhone: z.string().optional(),
  studentPassword: z.string().min(6).optional(),
  parentEmail: z.string().email().optional(),
  parentPhone: z.string().optional(),
  parentPassword: z.string().min(6).optional(),
});

async function resolvePlacement(
  tenantId: string,
  roomId: string | undefined,
  bedId: string | undefined,
  currentStudentId?: string
): Promise<{ roomId: string | null; bedId: string | null } | { error: string }> {
  if (bedId) {
    const bed = await prisma.bed.findFirst({ where: { id: bedId, tenantId } });
    if (!bed) return { error: "Invalid bed" };
    if (bed.status === "MAINTENANCE") return { error: "That bed is under maintenance" };
    const occupant = await prisma.student.findFirst({
      where: {
        bedId: bed.id,
        tenantId,
        status: "ACTIVE",
        ...(currentStudentId ? { id: { not: currentStudentId } } : {}),
      },
      select: { firstName: true, lastName: true },
    });
    if (occupant) {
      const name = [occupant.firstName, occupant.lastName].filter(Boolean).join(" ");
      return { error: `That bed is already occupied${name ? ` by ${name}` : ""}` };
    }
    return { roomId: bed.roomId, bedId: bed.id };
  }
  if (roomId) {
    const room = await prisma.room.findFirst({ where: { id: roomId, tenantId } });
    if (!room) return { error: "Invalid room" };
    return { roomId: room.id, bedId: null };
  }
  return { roomId: null, bedId: null };
}

studentsRouter.get("/", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const { take, skip, page } = parsePagination(req);
    const status = z.enum(["ACTIVE", "LEFT"]).optional().parse(req.query.status);
    const roomId = (req.query.roomId as string | undefined) || undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const where: Prisma.StudentWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(roomId ? { roomId } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          room: { select: { roomNumber: true } },
          bed: { select: { label: true } },
        },
      }),
    ]);
    res.json({ students, page, total });
  } catch (err) {
    next(err);
  }
});

studentsRouter.post("/", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = studentCreateBody.parse(req.body);

    // Login identifiers must be unique across all accounts (a mobile number or
    // email resolves to exactly one account). Reject clashes up front with a
    // clear message instead of surfacing a raw database error later.
    const studentId = body.studentPhone?.trim() || body.studentEmail?.trim().toLowerCase();
    const parentId = body.parentPhone?.trim() || body.parentEmail?.trim().toLowerCase();
    if (studentId && parentId && studentId === parentId) {
      res.status(400).json({ error: "The student and parent need different mobile numbers or emails." });
      return;
    }
    for (const id of [
      { label: "Student", email: body.studentEmail?.trim().toLowerCase(), phone: body.studentPhone?.trim() },
      { label: "Parent", email: body.parentEmail?.trim().toLowerCase(), phone: body.parentPhone?.trim() },
    ]) {
      const where = [
        ...(id.email ? [{ email: accountEmailFor(id.email, undefined) }] : []),
        ...(id.phone ? [{ phone: id.phone }] : []),
      ];
      if (where.length === 0) continue;
      const clash = await prisma.user.findFirst({ where: { OR: where } });
      if (clash) {
        const which = id.email ?? id.phone;
        res.status(409).json({
          error: `${id.label} login "${which}" is already used by another account. Every account needs its own mobile number or email.`,
        });
        return;
      }
    }

    const placement = await resolvePlacement(tenantId, body.roomId, body.bedId);
    if ("error" in placement) {
      res.status(400).json({ error: placement.error });
      return;
    }

    const photoUrl = await storeMaybeDataUrl(tenantId, body.photoUrl, {
      kind: "image",
      folder: "students",
    });

    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          gender: body.gender,
          dob: body.dob,
          phone: body.phone,
          email: body.email,
          address: body.address,
          photoUrl,
          guardianName: body.guardianName,
          guardianPhone: body.guardianPhone,
          guardianEmail: body.guardianEmail,
          monthlyFee: body.monthlyFee ?? undefined,
          joinDate: body.joinDate,
          tenantId,
          roomId: placement.roomId,
          bedId: placement.bedId,
          createdById: req.user!.sub,
        },
      });
      if (placement.bedId) {
        await tx.bed.update({ where: { id: placement.bedId }, data: { status: "OCCUPIED" } });
      }
      const amount = body.monthlyFee ?? 0;
      const now = new Date();
      if (amount > 0) {
        // First month's fee goes on the books straight away. Any amount
        // collected at admission is recorded as a payment; the invoice status
        // (PAID / PARTIAL / PENDING) is derived from it, so a part payment
        // shows the correct remaining balance on the due list.
        const paid = body.paidForCurrentMonth
          ? Math.min(Math.max(body.paidAmount ?? amount, 0), amount)
          : 0;
        const status = paid >= amount ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
        const invoice = await tx.invoice.create({
          data: {
            tenantId,
            studentId: created.id,
            title: `Monthly fee — ${now.toLocaleString("en-IN", { month: "long" })} ${now.getFullYear()}`,
            amount,
            periodMonth: now.getMonth() + 1,
            periodYear: now.getFullYear(),
            status,
            dueDate: body.joinDate ?? now,
          },
        });
        if (paid > 0) {
          await tx.payment.create({
            data: {
              tenantId,
              studentId: created.id,
              invoiceId: invoice.id,
              amount: paid,
              method: "CASH",
              note: paid >= amount ? "Paid on admission" : "Part payment on admission",
              recordedById: req.user!.sub,
            },
          });
        }
      }

      const fullName = [created.firstName, created.lastName].filter(Boolean).join(" ");
      const thePhone = body.studentPhone?.trim() || body.phone?.trim() || undefined;
      const theEmail = body.studentEmail?.trim() || body.email?.trim() || undefined;

      // Student login (optional): log in with the student's own mobile/email.
      if (body.studentPassword && (theEmail || thePhone)) {
        const studentUser = await tx.user.create({
          data: {
            name: fullName,
            email: accountEmailFor(theEmail, thePhone),
            phone: thePhone,
            passwordHash: await hashPassword(body.studentPassword),
            role: "STUDENT",
            tenantId,
          },
        });
        await tx.student.update({ where: { id: created.id }, data: { userId: studentUser.id } });
      }

      // Guardian login (optional), created and linked to the student in the
      // same step. Uses the guardian's own mobile/email and password.
      if (body.parentPassword && (body.parentEmail?.trim() || body.parentPhone?.trim())) {
        const parentPhone = body.parentPhone?.trim() || undefined;
        const parentEmail = body.parentEmail?.trim() || undefined;
        const parentUser = await tx.user.create({
          data: {
            name: body.guardianName?.trim() || `Guardian of ${created.firstName}`,
            email: accountEmailFor(parentEmail, parentPhone),
            phone: parentPhone,
            passwordHash: await hashPassword(body.parentPassword),
            role: "PARENT",
            tenantId,
          },
        });
        await tx.parentStudent.create({
          data: {
            tenantId,
            parentUserId: parentUser.id,
            studentId: created.id,
            relation: "Guardian",
          },
        });
      }

      return created;
    });

    res.status(201).json({ student });
  } catch (err) {
    next(err);
  }
});

studentsRouter.get("/:id", async (req, res, next) => {
  try {
    const student = await prisma.student.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
      include: {
        room: true,
        bed: true,
        parents: {
          include: {
            parent: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                photoUrl: true,
                isSuperParent: true,
                documents: { orderBy: { createdAt: "desc" } },
              },
            },
          },
        },
        documents: true,
        invoices: { orderBy: { createdAt: "desc" } },
        admissionRequest: { include: { documents: { orderBy: { createdAt: "asc" } } } },
      },
    });
    if (!student) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const withUrls = <T extends { fileUrl: string }>(docs: T[]) =>
      Promise.all(docs.map(async (d) => ({ ...d, fileUrl: await resolveMediaUrl(d.fileUrl) })));
    res.json({
      student: {
        ...student,
        photoUrl: await resolveOptionalUrl(student.photoUrl),
        documents: await withUrls(student.documents),
        admissionRequest: student.admissionRequest
          ? {
              ...student.admissionRequest,
              documents: await withUrls(student.admissionRequest.documents),
            }
          : null,
        parents: await Promise.all(
          student.parents.map(async (link) => ({
            ...link,
            parent: {
              ...link.parent,
              photoUrl: await resolveOptionalUrl(link.parent.photoUrl),
              documents: await withUrls(link.parent.documents),
            },
          }))
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

studentsRouter.patch("/:id", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const existing = await prisma.student.findFirst({
      where: { id: (req.params.id as string), tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const body = studentBody.partial().parse(req.body);
    // Only touch the placement when the caller actually sends room/bed fields;
    // otherwise keep the student where they are.
    const placement =
      body.roomId !== undefined || body.bedId !== undefined
        ? await resolvePlacement(tenantId, body.roomId, body.bedId, existing.id)
        : { roomId: existing.roomId, bedId: existing.bedId };
    if ("error" in placement) {
      res.status(400).json({ error: placement.error });
      return;
    }
    const photoUrl = await storeMaybeDataUrl(tenantId, body.photoUrl, {
      kind: "image",
      folder: "students",
    });

    const student = await prisma.$transaction(async (tx) => {
      if (placement.bedId !== existing.bedId) {
        if (existing.bedId) {
          await tx.bed.update({ where: { id: existing.bedId }, data: { status: "VACANT" } });
        }
        if (placement.bedId) {
          await tx.bed.update({ where: { id: placement.bedId }, data: { status: "OCCUPIED" } });
        }
      }
      return tx.student.update({
        where: { id: existing.id },
        data: {
          roomId: placement.roomId,
          bedId: placement.bedId,
          firstName: body.firstName,
          lastName: body.lastName,
          gender: body.gender,
          dob: body.dob,
          phone: body.phone,
          email: body.email,
          address: body.address,
          photoUrl,
          guardianName: body.guardianName,
          guardianPhone: body.guardianPhone,
          guardianEmail: body.guardianEmail,
          monthlyFee: body.monthlyFee,
          joinDate: body.joinDate,
        },
      });
    });

    res.json({ student });
  } catch (err) {
    next(err);
  }
});

// Permanent delete (the chosen "exit" behaviour): removes the student and all
// related records, and frees the bed.
studentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const existing = await prisma.student.findFirst({
      where: { id: (req.params.id as string), tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.$transaction(async (tx) => {
      if (existing.bedId) {
        await tx.bed.update({ where: { id: existing.bedId }, data: { status: "VACANT" } });
      }
      await tx.student.delete({ where: { id: existing.id } });
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

studentsRouter.post("/:id/exit", async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const existing = await prisma.student.findFirst({
      where: { id: (req.params.id as string), tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.$transaction(async (tx) => {
      if (existing.bedId) {
        await tx.bed.update({ where: { id: existing.bedId }, data: { status: "VACANT" } });
      }
      await tx.student.delete({ where: { id: existing.id } });
    });
    res.json({ ok: true, exited: true });
  } catch (err) {
    next(err);
  }
});

// Shift a student to another PG owned by the same owner. Historical invoices
// and payments stay attached to the PG where they were billed; only the
// student (and their login + parent links) move.
studentsRouter.post("/:id/transfer", async (req, res, next) => {
  try {
    const sourceTenantId = req.user!.tenantId!;
    const body = z
      .object({
        tenantId: z.string().min(1),
        roomId: z.string().optional(),
        bedId: z.string().optional(),
      })
      .parse(req.body);

    if (body.tenantId === sourceTenantId) {
      res.status(400).json({ error: "This student is already in that PG" });
      return;
    }

    const existing = await prisma.student.findFirst({
      where: { id: (req.params.id as string), tenantId: sourceTenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const target = await prisma.tenant.findFirst({
      where: { id: body.tenantId, ownerUserId: req.user!.sub },
      select: { id: true, name: true },
    });
    if (!target) {
      res.status(403).json({ error: "You cannot move a student into that PG" });
      return;
    }

    const placement = await resolvePlacement(target.id, body.roomId, body.bedId, existing.id);
    if ("error" in placement) {
      res.status(400).json({ error: placement.error });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (existing.bedId) {
        await tx.bed.update({ where: { id: existing.bedId }, data: { status: "VACANT" } });
      }
      if (placement.bedId) {
        await tx.bed.update({ where: { id: placement.bedId }, data: { status: "OCCUPIED" } });
      }
      await tx.student.update({
        where: { id: existing.id },
        data: {
          tenantId: target.id,
          roomId: placement.roomId,
          bedId: placement.bedId,
        },
      });
      if (existing.userId) {
        await tx.user.update({ where: { id: existing.userId }, data: { tenantId: target.id } });
      }
      await tx.parentStudent.updateMany({
        where: { studentId: existing.id },
        data: { tenantId: target.id },
      });
      await tx.auditLog.create({
        data: {
          tenantId: target.id,
          actorId: req.user!.sub,
          action: "STUDENT_TRANSFERRED",
          entity: "Student",
          entityId: existing.id,
          meta: {
            fromTenantId: sourceTenantId,
            toTenantId: target.id,
            roomId: placement.roomId,
            bedId: placement.bedId,
          },
        },
      });
    });

    res.json({ ok: true, studentId: existing.id, pg: target });
  } catch (err) {
    next(err);
  }
});
