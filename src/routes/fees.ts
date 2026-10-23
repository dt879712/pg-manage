import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { parsePagination } from "../lib/pagination";
import { getStudentForUser, getParentStudentIds } from "../lib/scope";

async function scopedStudentIds(user: Request["user"]): Promise<string[] | null> {
  if (!user) return [];
  if (user.role === "STUDENT") {
    const s = await getStudentForUser(user.sub);
    return s ? [s.id] : [];
  }
  if (user.role === "PARENT") return getParentStudentIds(user.sub);
  return null;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireTenant);

invoicesRouter.get(
  "/",
  requireRole("OWNER", "STUDENT", "PARENT"),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const { take, skip, page } = parsePagination(req);
      const scoped = await scopedStudentIds(req.user);
      const studentId = (req.query.studentId as string | undefined) || undefined;
      const status = z
        .enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"])
        .optional()
        .parse(req.query.status);

      const where: Prisma.InvoiceWhereInput = {
        tenantId,
        ...(scoped ? { studentId: { in: scoped } } : {}),
        ...(!scoped && studentId ? { studentId } : {}),
        ...(status ? { status } : {}),
      };

      const [total, invoices] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
          where,
          take,
          skip,
          orderBy: { createdAt: "desc" },
          include: {
            payments: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                room: { select: { roomNumber: true } },
              },
            },
          },
        }),
      ]);
      res.json({ invoices, page, total });
    } catch (err) {
      next(err);
    }
  }
);

invoicesRouter.post("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        studentId: z.string().min(1),
        title: z.string().min(1),
        amount: z.number().int().positive(),
        periodMonth: z.number().int().min(1).max(12).optional(),
        periodYear: z.number().int().optional(),
        dueDate: z.coerce.date().optional(),
      })
      .parse(req.body);

    const student = await prisma.student.findFirst({
      where: { id: body.studentId, tenantId },
    });
    if (!student) {
      res.status(400).json({ error: "Invalid student" });
      return;
    }
    const invoice = await prisma.invoice.create({ data: { ...body, tenantId } });
    res.status(201).json({ invoice });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.patch("/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const existing = await prisma.invoice.findFirst({
      where: { id: (req.params.id as string), tenantId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = z
      .object({
        title: z.string().min(1).optional(),
        amount: z.number().int().positive().optional(),
        dueDate: z.coerce.date().nullable().optional(),
        status: z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]).optional(),
      })
      .parse(req.body);
    const invoice = await prisma.invoice.update({ where: { id: existing.id }, data: body });
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.delete("/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    const existing = await prisma.invoice.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.invoice.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

type InvoiceItem = { label: string; amount: number };

function readItems(value: Prisma.JsonValue | null | undefined): InvoiceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (i): i is { label: string; amount: number } =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as InvoiceItem).label === "string" &&
        typeof (i as InvoiceItem).amount === "number"
    )
    .map((i) => ({ label: i.label, amount: Math.round(i.amount) }));
}

// Add an extra charge (e.g. an electricity bill) to an existing invoice. The
// invoice total grows by the same amount so dues, payments and receipts stay
// consistent, and the charge prints as its own line on the receipt.
invoicesRouter.post("/:id/items", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        label: z.string().trim().min(1).max(80),
        amount: z.number().int().positive().max(100_000_000),
      })
      .parse(req.body);

    const existing = await prisma.invoice.findFirst({
      where: { id: (req.params.id as string), tenantId },
      include: { payments: { select: { amount: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.status === "CANCELLED") {
      res.status(400).json({ error: "This bill is cancelled" });
      return;
    }

    const items = [...readItems(existing.items), { label: body.label, amount: body.amount }];
    const amount = existing.amount + body.amount;
    const paid = existing.payments.reduce((sum, p) => sum + p.amount, 0);
    const status = paid >= amount ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: { items: items as Prisma.InputJsonValue, amount, status },
    });
    res.status(201).json({ invoice });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.delete("/:id/items/:index", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const index = Number.parseInt(req.params.index as string, 10);
    const existing = await prisma.invoice.findFirst({
      where: { id: (req.params.id as string), tenantId },
      include: { payments: { select: { amount: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const items = readItems(existing.items);
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      res.status(400).json({ error: "Invalid bill" });
      return;
    }
    const removed = items[index];
    const nextItems = items.filter((_, i) => i !== index);
    const amount = existing.amount - removed.amount;
    const paid = existing.payments.reduce((sum, p) => sum + p.amount, 0);
    if (paid > amount) {
      res.status(400).json({ error: "Payments already cover this bill — reverse the payment first" });
      return;
    }
    const status = paid >= amount ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        items: (nextItems.length ? nextItems : null) as Prisma.InputJsonValue,
        amount,
        status,
      },
    });
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireTenant);

paymentsRouter.get(
  "/",
  requireRole("OWNER", "STUDENT", "PARENT"),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const { take, skip, page } = parsePagination(req);
      const scoped = await scopedStudentIds(req.user);
      const studentId = (req.query.studentId as string | undefined) || undefined;

      const where: Prisma.PaymentWhereInput = {
        tenantId,
        ...(scoped ? { studentId: { in: scoped } } : {}),
        ...(!scoped && studentId ? { studentId } : {}),
      };

      const [total, payments] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({ where, take, skip, orderBy: { paidAt: "desc" } }),
      ]);
      res.json({ payments, page, total });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        studentId: z.string().min(1),
        invoiceId: z.string().optional(),
        amount: z.number().int().positive(),
        method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]).optional(),
        reference: z.string().optional(),
        note: z.string().optional(),
        paidAt: z.coerce.date().optional(),
      })
      .parse(req.body);

    const student = await prisma.student.findFirst({ where: { id: body.studentId, tenantId } });
    if (!student) {
      res.status(400).json({ error: "Invalid student" });
      return;
    }

    let invoice: { id: string; title: string; amount: number } | null = null;
    if (body.invoiceId) {
      const found = await prisma.invoice.findFirst({
        where: { id: body.invoiceId, tenantId },
      });
      if (!found) {
        res.status(400).json({ error: "Invalid invoice" });
        return;
      }
      const agg = await prisma.payment.aggregate({
        where: { invoiceId: found.id },
        _sum: { amount: true },
      });
      const outstanding = found.amount - (agg._sum.amount ?? 0);
      if (body.amount > outstanding) {
        res.status(400).json({
          error: `Amount exceeds the outstanding balance of ${outstanding}`,
        });
        return;
      }
      invoice = found;
    }

    // Record the payment and refresh the invoice status atomically.
    const { payment, invoiceStatus, totalPaid } = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: { ...body, tenantId, recordedById: req.user!.sub },
      });
      let status: "PAID" | "PARTIAL" | "PENDING" | null = null;
      let paid = 0;
      if (invoice) {
        const agg = await tx.payment.aggregate({
          where: { invoiceId: invoice.id },
          _sum: { amount: true },
        });
        paid = agg._sum.amount ?? 0;
        status = paid >= invoice.amount ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
        await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
      }
      return { payment: created, invoiceStatus: status, totalPaid: paid };
    });

    // Receipt line shared by the parent and student notifications. Full payments
    // and partial payments get wording that matches the remaining balance.
    const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ");
    const method = body.method ?? "CASH";
    const remaining = invoice ? Math.max(invoice.amount - totalPaid, 0) : 0;
    const amountText = body.amount.toLocaleString("en-IN");
    const receiptLine =
      `Fees paid for ${studentName}${invoice ? ` — ${invoice.title}` : ""}: ₹${amountText} received via ${method}. ` +
      (remaining > 0
        ? `₹${remaining.toLocaleString("en-IN")} is still due — you can download the slip from the Fees screen.`
        : "No dues remaining — you can download the slip from the Fees screen.");
    const receiptTitle = remaining > 0 ? "Fees partially paid" : "Fees paid in full";

    const notify = async (userIds: string[], audience: "PARENTS" | "STUDENTS") => {
      if (!userIds.length) return 0;
      await prisma.$transaction(async (tx) => {
        const created = await tx.notification.create({
          data: {
            tenantId,
            title: receiptTitle,
            body: receiptLine,
            audience,
            createdById: req.user!.sub,
          },
        });
        await tx.notificationRecipient.createMany({
          data: userIds.map((userId) => ({ notificationId: created.id, userId })),
          skipDuplicates: true,
        });
      });
      return userIds.length;
    };

    // Forward the receipt to the student's parents and to the student's own account.
    const parents = await prisma.parentStudent.findMany({
      where: { studentId: student.id },
      select: { parentUserId: true },
    });
    const parentNotified = await notify(
      parents.map((p) => p.parentUserId),
      "PARENTS"
    );
    const studentNotified = student.userId ? await notify([student.userId], "STUDENTS") : 0;

    res.status(201).json({
      payment,
      invoiceStatus,
      parentNotified,
      studentNotified,
      outstanding: remaining,
    });
  } catch (err) {
    next(err);
  }
});
