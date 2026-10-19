import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";

export const roomsRouter = Router();

roomsRouter.use(requireAuth, requireTenant);

// Owners running multiple PGs may list rooms of any PG they own with
// ?tenantId=<pgId>. Everyone else is scoped to their own tenant.
async function resolveTenantId(
  userId: string,
  role: string,
  ownTenantId: string,
  requested?: string
): Promise<string | null> {
  if (!requested || requested === ownTenantId) return ownTenantId;
  if (role !== "OWNER") return null;
  const pg = await prisma.tenant.findFirst({
    where: { id: requested, ownerUserId: userId },
    select: { id: true },
  });
  return pg?.id ?? null;
}

roomsRouter.get("/", requireRole("OWNER", "STAFF"), async (req, res, next) => {
  try {
    const propertyId = req.query.propertyId as string | undefined;
    const tenantId = await resolveTenantId(
      req.user!.sub,
      req.user!.role,
      req.user!.tenantId!,
      req.query.tenantId as string | undefined
    );
    if (!tenantId) {
      res.status(403).json({ error: "You cannot view rooms for that PG" });
      return;
    }
    const rooms = await prisma.room.findMany({
      where: { tenantId, ...(propertyId ? { propertyId } : {}) },
      orderBy: { roomNumber: "asc" },
      include: { beds: { orderBy: { label: "asc" } }, _count: { select: { students: true } } },
    });
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
});

roomsRouter.post("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z
      .object({
        propertyId: z.string().min(1),
        roomNumber: z.string().min(1),
        floor: z.number().int().optional(),
        capacity: z.number().int().positive().optional(),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
        rentAmount: z.number().int().nonnegative().optional(),
        bedCount: z.number().int().nonnegative().optional(),
      })
      .parse(req.body);

    const property = await prisma.property.findFirst({
      where: { id: body.propertyId, tenantId: req.user!.tenantId! },
    });
    if (!property) {
      res.status(400).json({ error: "Invalid property" });
      return;
    }

    const { bedCount, ...roomData } = body;
    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: { ...roomData, tenantId: req.user!.tenantId! },
      });
      if (bedCount && bedCount > 0) {
        await tx.bed.createMany({
          data: Array.from({ length: bedCount }, (_, i) => ({
            roomId: created.id,
            tenantId: req.user!.tenantId!,
            label: `B${i + 1}`,
          })),
        });
      }
      return created;
    });
    res.status(201).json({ room });
  } catch (err) {
    next(err);
  }
});

roomsRouter.post("/:id/beds", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z.object({ label: z.string().min(1) }).parse(req.body);
    const room = await prisma.room.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!room) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const bed = await prisma.bed.create({
      data: { roomId: room.id, tenantId: req.user!.tenantId!, label: body.label },
    });
    res.status(201).json({ bed });
  } catch (err) {
    next(err);
  }
});

roomsRouter.patch("/:id", requireRole("OWNER", "STAFF"), async (req, res, next) => {
  try {
    const existing = await prisma.room.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Staff may only change room status.
    if (req.user!.role === "STAFF") {
      const body = z
        .object({ status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]) })
        .parse(req.body);
      const room = await prisma.room.update({ where: { id: existing.id }, data: body });
      res.json({ room });
      return;
    }

    const body = z
      .object({
        roomNumber: z.string().min(1).optional(),
        floor: z.number().int().nullable().optional(),
        capacity: z.number().int().positive().optional(),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
        status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
        rentAmount: z.number().int().nonnegative().nullable().optional(),
      })
      .parse(req.body);
    const room = await prisma.room.update({ where: { id: existing.id }, data: body });
    res.json({ room });
  } catch (err) {
    next(err);
  }
});

roomsRouter.delete("/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    const existing = await prisma.room.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.room.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// -- Beds --------------------------------------------------------------------

export const bedsRouter = Router();
bedsRouter.use(requireAuth, requireTenant);

bedsRouter.get("/", requireRole("OWNER", "STAFF"), async (req, res, next) => {
  try {
    const roomId = req.query.roomId as string | undefined;
    const beds = await prisma.bed.findMany({
      where: { tenantId: req.user!.tenantId!, ...(roomId ? { roomId } : {}) },
      orderBy: { label: "asc" },
    });
    res.json({ beds });
  } catch (err) {
    next(err);
  }
});

bedsRouter.post("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z
      .object({ roomId: z.string().min(1), label: z.string().min(1) })
      .parse(req.body);
    const room = await prisma.room.findFirst({
      where: { id: body.roomId, tenantId: req.user!.tenantId! },
    });
    if (!room) {
      res.status(400).json({ error: "Invalid room" });
      return;
    }
    const bed = await prisma.bed.create({
      data: { roomId: room.id, tenantId: req.user!.tenantId!, label: body.label },
    });
    res.status(201).json({ bed });
  } catch (err) {
    next(err);
  }
});

bedsRouter.patch("/:id", requireRole("OWNER", "STAFF"), async (req, res, next) => {
  try {
    const body = z
      .object({ status: z.enum(["VACANT", "OCCUPIED", "MAINTENANCE"]) })
      .parse(req.body);
    const existing = await prisma.bed.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const bed = await prisma.bed.update({ where: { id: existing.id }, data: body });
    res.json({ bed });
  } catch (err) {
    next(err);
  }
});

bedsRouter.delete("/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    const existing = await prisma.bed.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.bed.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
