import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";

export const propertiesRouter = Router();

propertiesRouter.use(requireAuth, requireTenant, requireRole("OWNER"));

propertiesRouter.get("/", async (req, res, next) => {
  try {
    const properties = await prisma.property.findMany({
      where: { tenantId: req.user!.tenantId! },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { rooms: true, students: true } } },
    });
    res.json({ properties });
  } catch (err) {
    next(err);
  }
});

propertiesRouter.post("/", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(["PG", "HOSTEL", "FLAT"]).optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      })
      .parse(req.body);
    const property = await prisma.property.create({
      data: { ...body, tenantId: req.user!.tenantId! },
    });
    res.status(201).json({ property });
  } catch (err) {
    next(err);
  }
});

propertiesRouter.get("/:id", async (req, res, next) => {
  try {
    const property = await prisma.property.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
      include: { rooms: { include: { beds: true }, orderBy: { roomNumber: "asc" } } },
    });
    if (!property) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ property });
  } catch (err) {
    next(err);
  }
});

propertiesRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        type: z.enum(["PG", "HOSTEL", "FLAT"]).optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
      })
      .parse(req.body);
    const existing = await prisma.property.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const property = await prisma.property.update({ where: { id: existing.id }, data: body });
    res.json({ property });
  } catch (err) {
    next(err);
  }
});

propertiesRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.property.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.property.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
