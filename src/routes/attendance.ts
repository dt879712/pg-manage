import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma, type Attendance } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { parsePagination } from "../lib/pagination";
import { getStudentForUser, getParentStudentIds } from "../lib/scope";

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth, requireTenant);

async function resolveTarget(
  req: Request
): Promise<{ studentId: string | null; method: "BUTTON" | "STAFF_MANUAL" }> {
  if (req.user!.role === "STUDENT") {
    const student = await getStudentForUser(req.user!.sub);
    return { studentId: student?.id ?? null, method: "BUTTON" };
  }
  const body = z
    .object({ studentId: z.string().min(1), method: z.enum(["BUTTON", "STAFF_MANUAL"]).optional() })
    .parse(req.body);
  const method = body.method ?? (req.user!.role === "STAFF" || req.user!.role === "GUARD" ? "STAFF_MANUAL" : "BUTTON");
  return { studentId: body.studentId, method };
}

async function record(
  req: Request,
  type: "CHECK_IN" | "CHECK_OUT"
): Promise<{ ok: true; attendance: Attendance } | { ok: false; error: string }> {
  const tenantId = req.user!.tenantId!;
  const { studentId, method } = await resolveTarget(req);
  if (!studentId) return { ok: false, error: "Student not found" };

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId },
    select: { id: true, status: true },
  });
  if (!student || student.status !== "ACTIVE") {
    return { ok: false, error: "Student not found" };
  }

  const last = await prisma.attendance.findFirst({
    where: { studentId: student.id },
    orderBy: { at: "desc" },
    select: { type: true },
  });
  const state = last?.type ?? "NONE";
  const wrong =
    type === "CHECK_IN" ? state === "CHECK_IN" : state !== "CHECK_IN";
  if (wrong) {
    return {
      ok: false,
      error: type === "CHECK_IN" ? "Already checked in" : "Already checked out",
    };
  }

  const attendance = await prisma.attendance.create({
    data: {
      tenantId,
      studentId: student.id,
      type,
      method,
      recordedById: req.user!.role === "STUDENT" ? null : req.user!.sub,
    },
  });
  return { ok: true, attendance };
}

for (const [path, type] of [
  ["/check-in", "CHECK_IN"],
  ["/check-out", "CHECK_OUT"],
] as const) {
  attendanceRouter.post(
    path,
    requireRole("OWNER", "STAFF", "GUARD", "STUDENT"),
    async (req, res, next) => {
      try {
        const result = await record(req, type);
        if (!result.ok) {
          res.status(404).json({ error: result.error });
          return;
        }
        res.status(201).json({ attendance: result.attendance });
      } catch (err) {
        next(err);
      }
    }
  );
}

// Minimal active-student roster for check-in/out. No personal data (PII).
attendanceRouter.get(
  "/roster",
  requireRole("OWNER", "STAFF", "GUARD"),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const students = await prisma.student.findMany({
        where: { tenantId, status: "ACTIVE" },
        orderBy: { firstName: "asc" },
        select: { id: true, firstName: true, room: { select: { roomNumber: true } } },
      });
      const ids = students.map((s) => s.id);
      const latest = await prisma.attendance.findMany({
        where: { tenantId, studentId: { in: ids } },
        orderBy: { at: "desc" },
        distinct: ["studentId"],
        select: { studentId: true, type: true },
      });
      const statusMap = new Map(latest.map((l) => [l.studentId, l.type]));
      res.json({
        students: students.map((s) => ({
          ...s,
          currentStatus: statusMap.get(s.id) ?? "NONE",
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

attendanceRouter.get(
  "/",
  requireRole("OWNER", "STAFF", "GUARD", "STUDENT", "PARENT"),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId!;
      const role = req.user!.role;
      const { take, skip, page } = parsePagination(req);

      let scopedStudentIds: string[] | null = null;
      if (role === "STUDENT") {
        const s = await getStudentForUser(req.user!.sub);
        scopedStudentIds = s ? [s.id] : [];
      } else if (role === "PARENT") {
        scopedStudentIds = await getParentStudentIds(req.user!.sub);
      }

      const type = z.enum(["CHECK_IN", "CHECK_OUT"]).optional().parse(req.query.type);
      const studentId = (req.query.studentId as string | undefined) || undefined;

      const where: Prisma.AttendanceWhereInput = {
        tenantId,
        ...(scopedStudentIds ? { studentId: { in: scopedStudentIds } } : {}),
        ...(!scopedStudentIds && studentId ? { studentId } : {}),
        ...(type ? { type } : {}),
      };

      // Staff see only a minimal identity (first name + room), never full details.
      const include =
        role === "STAFF" || role === "GUARD"
          ? {
              student: {
                select: { id: true, firstName: true, room: { select: { roomNumber: true } } },
              },
            }
          : {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  room: { select: { roomNumber: true } },
                },
              },
            };

      const [total, records] = await Promise.all([
        prisma.attendance.count({ where }),
        prisma.attendance.findMany({ where, take, skip, orderBy: { at: "desc" }, include }),
      ]);

      res.json({ records, page, total });
    } catch (err) {
      next(err);
    }
  }
);
