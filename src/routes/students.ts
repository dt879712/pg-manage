import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { parsePagination } from "../lib/pagination";
import { storeMaybeDataUrl, resolveOptionalUrl, resolveMediaUrl } from "../lib/fileStore";

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
});

async function resolvePlacement(
  tenantId: string,
  roomId: string | undefined,
  bedId: string | undefined
): Promise<{ roomId: string | null; bedId: string | null } | { error: string }> {
  if (bedId) {
    const bed = await prisma.bed.findFirst({ where: { id: bedId, tenantId } });
    if (!bed) return { error: "Invalid bed" };
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
      const amount = body.paidAmount ?? body.monthlyFee ?? 0;
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
    const placement = await resolvePlacement(tenantId, body.roomId, body.bedId);
    const photoUrl = await storeMaybeDataUrl(tenantId, body.photoUrl, {
      kind: "image",
      folder: "students",
    });

    const student = await prisma.$transaction(async (tx) => {
      if (!("error" in placement) && placement.bedId !== existing.bedId) {
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
          ...("error" in placement ? {} : { roomId: placement.roomId, bedId: placement.bedId }),
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
