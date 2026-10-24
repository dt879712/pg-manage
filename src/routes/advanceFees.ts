import { Router, type Request } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { parsePagination } from "../lib/pagination";
import { getParentStudentIds, getStudentForUser } from "../lib/scope";

export const advanceFeesRouter = Router();
advanceFeesRouter.use(requireAuth, requireTenant);

async function scopedStudentIds(user: Request["user"]): Promise<string[] | null> {
  if (!user) return [];
  if (user.role === "STUDENT") {
    const student = await getStudentForUser(user.sub);
    return student ? [student.id] : [];
  }
  if (user.role === "PARENT") return getParentStudentIds(user.sub);
  return null;
}

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

advanceFeesRouter.get(
  "/",
  requireRole("OWNER", "STUDENT", "PARENT"),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const { take, skip, page } = parsePagination(req);
      const scoped = await scopedStudentIds(req.user);
      const studentId = (req.query.studentId as string | undefined) || undefined;
      const where: Prisma.AdvanceFeeWhereInput = {
        tenantId,
        ...(scoped ? { studentId: { in: scoped } } : {}),
        ...(!scoped && studentId ? { studentId } : {}),
      };

      const [total, records] = await Promise.all([
        prisma.advanceFee.count({ where }),
        prisma.advanceFee.findMany({
          where,
          take,
          skip,
          orderBy: [{ paidThrough: "desc" }, { paidAt: "desc" }],
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                room: { select: { roomNumber: true } },
                ...(req.user!.role === "OWNER"
                  ? {
                      parents: {
                        select: {
                          parent: { select: { id: true, name: true, isSuperParent: true } },
                        },
                      },
                    }
                  : {}),
              },
            },
          },
        }),
      ]);

      let superParents: { id: string; name: string; email: string; phone: string | null }[] = [];
      if (req.user!.role === "OWNER") {
        const today = dateOnly(new Date());
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth() + 1;
        const parents = await prisma.user.findMany({
          where: { tenantId, role: "PARENT", isActive: true },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isSuperParent: true,
            parentLinks: {
              select: {
                student: {
                  select: {
                    invoices: {
                      where: {
                        status: "PAID",
                        periodYear: { not: null },
                        OR: [
                          { periodYear: { gt: year } },
                          { periodYear: year, periodMonth: { gt: month } },
                        ],
                      },
                      select: { id: true },
                    },
                    advanceFees: { where: { paidThrough: { gte: today } }, select: { id: true } },
                  },
                },
              },
            },
          },
        });
        superParents = parents
          .filter(
            (parent) =>
              parent.isSuperParent === true ||
              (parent.isSuperParent === null &&
                parent.parentLinks.some(
                  (link) => link.student.invoices.length > 0 || link.student.advanceFees.length > 0
                ))
          )
          .map(({ id, name, email, phone }) => ({ id, name, email, phone }));
      }

      res.json({ advanceFees: records, superParents, page, total });
    } catch (err) {
      next(err);
    }
  }
);

advanceFeesRouter.post("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        studentId: z.string().min(1),
        amount: z.number().int().positive(),
        method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]).default("CASH"),
        paidAt: z.coerce.date(),
        paidThrough: z.coerce.date(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    if (dateOnly(body.paidThrough) < dateOnly(body.paidAt)) {
      res.status(400).json({ error: "Paid-through date must be on or after the payment date." });
      return;
    }
    const student = await prisma.student.findFirst({
      where: { id: body.studentId, tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!student) {
      res.status(400).json({ error: "Choose an active student." });
      return;
    }

    const advanceFee = await prisma.advanceFee.create({
      data: {
        ...body,
        paidAt: dateOnly(body.paidAt),
        paidThrough: dateOnly(body.paidThrough),
        tenantId,
        recordedById: req.user!.sub,
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, room: { select: { roomNumber: true } } },
        },
      },
    });
    res.status(201).json({ advanceFee });
  } catch (err) {
    next(err);
  }
});
