import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";

export const roomsRouter = Router();

roomsRouter.use(requireAuth, requireTenant);

const roomLabel = z.string().trim().min(1, "Enter a room number").max(60);
const bedLabel = z.string().trim().min(1, "Enter a bed label").max(60);
const bedStatus = z.enum(["VACANT", "MAINTENANCE"]);

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function uniqueLabels(labels: string[]): { ok: true; labels: string[] } | { ok: false; label: string } {
  const seen = new Set<string>();
  for (const label of labels) {
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) return { ok: false, label };
    seen.add(key);
  }
  return { ok: true, labels };
}

function nextBedLabels(usedLabels: string[], count: number): string[] {
  const used = new Set(usedLabels.map((l) => l.toLocaleLowerCase()));
  const out: string[] = [];
  let n = 1;
  while (out.length < count) {
    const label = `B${n++}`;
    if (!used.has(label.toLocaleLowerCase())) {
      used.add(label.toLocaleLowerCase());
      out.push(label);
    }
  }
  return out;
}

function isUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

async function syncCapacity(roomId: string) {
  const beds = await prisma.bed.count({ where: { roomId } });
  await prisma.room.update({ where: { id: roomId }, data: { capacity: beds } });
}

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
      include: {
        beds: {
          include: {
            // Occupancy is derived from the students actually assigned, so the
            // bed list can never disagree with who is really in the room.
            students: {
              where: { status: "ACTIVE" },
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        _count: { select: { students: true } },
      },
    });

    // Reconcile the stored bed status with real occupancy so a bed freed by a
    // student leaving is immediately re-allottable, and a bed with an active
    // student can't be handed to someone else.
    const fixes: { id: string; status: "OCCUPIED" | "VACANT" }[] = [];
    const shaped = rooms.map((room) => {
      const beds = [...room.beds]
        .sort((a, b) => naturalCompare(a.label, b.label))
        .map((bed) => {
          const occupied = bed.students[0];
          const status = occupied
            ? "OCCUPIED"
            : bed.status === "MAINTENANCE"
              ? "MAINTENANCE"
              : "VACANT";
          if (status !== bed.status && bed.status !== "MAINTENANCE") {
            fixes.push({ id: bed.id, status: status as "OCCUPIED" | "VACANT" });
          }
          const { students, ...rest } = bed;
          return {
            ...rest,
            status,
            occupiedBy: occupied
              ? { id: occupied.id, name: [occupied.firstName, occupied.lastName].filter(Boolean).join(" ") }
              : null,
          };
        });
      return { ...room, beds, capacity: beds.length };
    });
    if (fixes.length) {
      await prisma.$transaction(
        fixes.map((f) => prisma.bed.update({ where: { id: f.id }, data: { status: f.status } }))
      );
    }

    res.json({ rooms: shaped });
  } catch (err) {
    next(err);
  }
});

roomsRouter.post("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId!;
    const body = z
      .object({
        propertyId: z.string().min(1),
        roomNumber: roomLabel,
        floor: z.number().int().nullable().optional(),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
        rentAmount: z.number().int().nonnegative().nullable().optional(),
        status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
        // Capacity creates beds B1…Bn automatically. Owners may also supply
        // their own labels instead (used by the bed manager).
        capacity: z.number().int().positive().optional(),
        beds: z.array(bedLabel).optional(),
      })
      .parse(req.body);

    const property = await prisma.property.findFirst({
      where: { id: body.propertyId, tenantId },
    });
    if (!property) {
      res.status(400).json({ error: "Invalid property" });
      return;
    }

    const duplicateRoom = await prisma.room.findFirst({
      where: {
        propertyId: property.id,
        roomNumber: { equals: body.roomNumber, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicateRoom) {
      res.status(409).json({ error: `Room ${body.roomNumber} already exists.` });
      return;
    }

    const labelCheck = uniqueLabels(body.beds ?? []);
    if (!labelCheck.ok) {
      res.status(400).json({ error: `Bed label "${labelCheck.label}" is used twice in this room.` });
      return;
    }

    const { beds, capacity: requestedCapacity, ...roomData } = body;
    const labels = beds ?? nextBedLabels([], requestedCapacity ?? 0);
    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: {
          ...roomData,
          tenantId,
          capacity: labels.length,
        },
      });
      if (labels.length > 0) {
        await tx.bed.createMany({
          data: labels.map((label) => ({ roomId: created.id, tenantId, label })),
        });
      }
      return tx.room.findUniqueOrThrow({
        where: { id: created.id },
        include: { beds: { orderBy: { label: "asc" } } },
      });
    });
    res.status(201).json({ room });
  } catch (err) {
    if (isUniqueError(err)) {
      res.status(409).json({ error: "That room or bed label already exists." });
      return;
    }
    next(err);
  }
});

roomsRouter.post("/:id/beds", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z.object({ label: bedLabel }).parse(req.body);
    const room = await prisma.room.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!room) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const duplicate = await prisma.bed.findFirst({
      where: { roomId: room.id, label: { equals: body.label, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) {
      res.status(409).json({ error: `Bed "${body.label}" already exists in this room.` });
      return;
    }
    const bed = await prisma.bed.create({
      data: { roomId: room.id, tenantId: req.user!.tenantId!, label: body.label },
    });
    await syncCapacity(room.id);
    res.status(201).json({ bed });
  } catch (err) {
    if (isUniqueError(err)) {
      res.status(409).json({ error: "That bed label already exists in this room." });
      return;
    }
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
        roomNumber: roomLabel.optional(),
        floor: z.number().int().nullable().optional(),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
        status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
        rentAmount: z.number().int().nonnegative().nullable().optional(),
        capacity: z.number().int().positive().optional(),
      })
      .parse(req.body);

    if (body.roomNumber) {
      const duplicate = await prisma.room.findFirst({
        where: {
          propertyId: existing.propertyId,
          roomNumber: { equals: body.roomNumber, mode: "insensitive" },
          id: { not: existing.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        res.status(409).json({ error: `Room ${body.roomNumber} already exists.` });
        return;
      }
    }

    if (body.status && body.status !== "ACTIVE") {
      const occupied = await prisma.student.count({
        where: { roomId: existing.id, tenantId: existing.tenantId, status: "ACTIVE" },
      });
      if (occupied > 0) {
        res.status(400).json({
          error: `Room ${existing.roomNumber} still has ${occupied} student(s). Move them out first.`,
        });
        return;
      }
    }

    // Capacity is the number of beds. Adding capacity creates B1…Bn; reducing
    // it removes the vacant beds at the end and is refused if any of them are
    // occupied.
    if (body.capacity != null) {
      const beds = (await prisma.bed.findMany({
        where: { roomId: existing.id },
        include: { students: { where: { status: "ACTIVE" }, select: { id: true } } },
      })).sort((a, b) => naturalCompare(a.label, b.label));

      const target = body.capacity;
      if (target > beds.length) {
        const labels = nextBedLabels(
          beds.map((b) => b.label),
          target - beds.length
        );
        await prisma.bed.createMany({
          data: labels.map((label) => ({ roomId: existing.id, tenantId: existing.tenantId, label })),
        });
      } else if (target < beds.length) {
        const extra = beds.slice(target);
        if (extra.some((b) => b.students.length > 0)) {
          res.status(400).json({
            error: "Those extra beds are occupied. Move the students out before reducing capacity.",
          });
          return;
        }
        await prisma.bed.deleteMany({ where: { id: { in: extra.map((b) => b.id) } } });
      }
    }

    const room = await prisma.room.update({ where: { id: existing.id }, data: body });
    res.json({ room });
  } catch (err) {
    if (isUniqueError(err)) {
      res.status(409).json({ error: "That room number already exists." });
      return;
    }
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
    const occupied = await prisma.student.count({
      where: { roomId: existing.id, tenantId: existing.tenantId, status: "ACTIVE" },
    });
    if (occupied > 0) {
      res.status(400).json({
        error: `Room ${existing.roomNumber} still has ${occupied} student(s). Move them out before deleting it.`,
      });
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
      .object({ roomId: z.string().min(1), label: bedLabel })
      .parse(req.body);
    const room = await prisma.room.findFirst({
      where: { id: body.roomId, tenantId: req.user!.tenantId! },
    });
    if (!room) {
      res.status(400).json({ error: "Invalid room" });
      return;
    }
    const duplicate = await prisma.bed.findFirst({
      where: { roomId: room.id, label: { equals: body.label, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) {
      res.status(409).json({ error: `Bed "${body.label}" already exists in this room.` });
      return;
    }
    const bed = await prisma.bed.create({
      data: { roomId: room.id, tenantId: req.user!.tenantId!, label: body.label },
    });
    await syncCapacity(room.id);
    res.status(201).json({ bed });
  } catch (err) {
    if (isUniqueError(err)) {
      res.status(409).json({ error: "That bed label already exists in this room." });
      return;
    }
    next(err);
  }
});

bedsRouter.patch("/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z
      .object({
        label: bedLabel.optional(),
        status: bedStatus.optional(),
      })
      .parse(req.body);
    const existing = await prisma.bed.findFirst({
      where: { id: (req.params.id as string), tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const occupant = await prisma.student.findFirst({
      where: { bedId: existing.id, tenantId: existing.tenantId, status: "ACTIVE" },
      select: { firstName: true, lastName: true },
    });
    const occupantName = occupant
      ? [occupant.firstName, occupant.lastName].filter(Boolean).join(" ")
      : "";
    if (body.label && body.label.toLocaleLowerCase() !== existing.label.toLocaleLowerCase()) {
      const duplicate = await prisma.bed.findFirst({
        where: {
          roomId: existing.roomId,
          label: { equals: body.label, mode: "insensitive" },
          id: { not: existing.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        res.status(409).json({ error: `Bed "${body.label}" already exists in this room.` });
        return;
      }
    }
    // A bed's occupancy comes from the student assigned to it, never from a
    // manual status change. Block changes that would contradict that.
    if (body.status && occupant) {
      res.status(400).json({
        error: `Bed ${existing.label} is occupied${occupantName ? ` by ${occupantName}` : ""}. Move the student out first.`,
      });
      return;
    }
    const bed = await prisma.bed.update({ where: { id: existing.id }, data: body });
    res.json({ bed });
  } catch (err) {
    if (isUniqueError(err)) {
      res.status(409).json({ error: "That bed label already exists in this room." });
      return;
    }
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
    const occupant = await prisma.student.findFirst({
      where: { bedId: existing.id, tenantId: existing.tenantId, status: "ACTIVE" },
      select: { firstName: true, lastName: true },
    });
    if (occupant) {
      const name = [occupant.firstName, occupant.lastName].filter(Boolean).join(" ");
      res.status(400).json({
        error: `Bed ${existing.label} is occupied${name ? ` by ${name}` : ""}. Move the student out first.`,
      });
      return;
    }
    await prisma.bed.delete({ where: { id: existing.id } });
    await syncCapacity(existing.roomId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
