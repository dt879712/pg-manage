import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { signToken } from "../auth";
import {
  storeMaybeDataUrl,
  resolveOptionalUrl,
  resolveMediaUrl,
  storeMedia,
  deleteMedia,
} from "../lib/fileStore";

export const tenantRouter = Router();

// Every authenticated member may read their tenant's branding & details.
tenantRouter.use(requireAuth, requireTenant);

// ---------------------------------------------------------------------------
// Multi-PG: an owner may run several PGs (A1, A2, A3…). Every PG is a Tenant
// with ownerUserId set; User.tenantId is the *active* PG carried in the JWT.
// ---------------------------------------------------------------------------

/** An owner may run at most this many PGs (branches). */
export const MAX_PGS_PER_OWNER = 2;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "pg"
  );
}

/** All PGs owned by the signed-in owner, with the active one flagged. */
tenantRouter.get("/pgs", requireRole("OWNER"), async (req, res, next) => {
  try {
    const pgs = await prisma.tenant.findMany({
      where: { ownerUserId: req.user!.sub },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        logoUrl: true,
        primaryColor: true,
        status: true,
        _count: { select: { students: true, properties: true } },
      },
    });
    res.json({
      limit: MAX_PGS_PER_OWNER,
      pgs: await Promise.all(
        pgs.map(async (pg) => ({
          ...pg,
          logoUrl: await resolveOptionalUrl(pg.logoUrl),
          isActive: pg.id === req.user!.tenantId,
        }))
      ),
    });
  } catch (err) {
    next(err);
  }
});

/** Create another PG for the signed-in owner. */
tenantRouter.post("/pgs", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
      })
      .parse(req.body);

    const existing = await prisma.tenant.count({
      where: { ownerUserId: req.user!.sub, status: { not: "CLOSED" } },
    });
    if (existing >= MAX_PGS_PER_OWNER) {
      res.status(400).json({
        error: `You can run a maximum of ${MAX_PGS_PER_OWNER} branches. Delete one first.`,
      });
      return;
    }

    const baseSlug = slugify(body.name);
    let slug = baseSlug;
    let i = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${i++}`;
    }

    // Create the tenant and a default Property together. Rooms (and everything
    // that depends on rooms) require a propertyId, so every branch must have at
    // least one property from the moment it exists.
    const pg = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: body.name,
          slug,
          city: body.city,
          address: body.address,
          phone: body.phone,
          ownerUserId: req.user!.sub,
        },
        select: { id: true, name: true, slug: true, city: true, status: true },
      });
      await tx.property.create({
        data: { tenantId: created.id, name: created.name, type: "PG", city: body.city },
      });
      return created;
    });
    res.status(201).json({ pg });
  } catch (err) {
    next(err);
  }
});

/** Switch the owner's active PG. Returns a fresh JWT scoped to the new PG. */
tenantRouter.post("/pgs/:id/switch", requireRole("OWNER"), async (req, res, next) => {
  try {
    const pg = await prisma.tenant.findFirst({
      where: { id: req.params.id as string, ownerUserId: req.user!.sub },
      select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true },
    });
    if (!pg) {
      res.status(404).json({ error: "PG not found" });
      return;
    }
    // Persist the choice so the next login lands on the same PG.
    await prisma.user.update({ where: { id: req.user!.sub }, data: { tenantId: pg.id } });
    const token = signToken({ sub: req.user!.sub, tenantId: pg.id, role: "OWNER" });
    res.json({
      token,
      pg: { ...pg, logoUrl: await resolveOptionalUrl(pg.logoUrl) },
    });
  } catch (err) {
    next(err);
  }
});

const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  primaryColor: true,
  description: true,
  address: true,
  receiptFooter: true,
  rules: true,
  upiId: true,
  upiQrUrl: true,
  bankName: true,
  bankAccountName: true,
  bankAccountNumber: true,
  bankIfsc: true,
  city: true,
  phone: true,
  email: true,
  status: true,
  images: { orderBy: { order: "asc" as const } },
} as const;

tenantRouter.get("/", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId! },
      select: tenantSelect,
    });
    if (!tenant) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      tenant: {
        ...tenant,
        logoUrl: await resolveOptionalUrl(tenant.logoUrl),
        upiQrUrl: await resolveOptionalUrl(tenant.upiQrUrl),
        images: await Promise.all(
          tenant.images.map(async (img) => ({ ...img, imageUrl: await resolveMediaUrl(img.imageUrl) }))
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

tenantRouter.patch("/", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        receiptFooter: z.string().nullable().optional(),
        rules: z.string().nullable().optional(),
        upiId: z.string().nullable().optional(),
        upiQrUrl: z.string().nullable().optional(),
        bankName: z.string().nullable().optional(),
        bankAccountName: z.string().nullable().optional(),
        bankAccountNumber: z.string().nullable().optional(),
        bankIfsc: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        primaryColor: z
          .union([
            z.literal(""),
            z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour like #0ea5e9"),
          ])
          .nullable()
          .optional(),
        logoUrl: z.string().nullable().optional(),
      })
      .parse(req.body);

    const clean = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, v === "" ? null : v])
    );

    const tenantId = req.user!.tenantId!;
    if (typeof clean.logoUrl === "string" && clean.logoUrl.startsWith("data:")) {
      clean.logoUrl = (await storeMaybeDataUrl(tenantId, clean.logoUrl, {
        kind: "image",
        folder: "branding",
      })) as string;
    }
    if (typeof clean.upiQrUrl === "string" && clean.upiQrUrl.startsWith("data:")) {
      clean.upiQrUrl = (await storeMaybeDataUrl(tenantId, clean.upiQrUrl, {
        kind: "image",
        folder: "branding",
      })) as string;
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: clean,
      select: tenantSelect,
    });
    res.json({
      tenant: {
        ...tenant,
        logoUrl: await resolveOptionalUrl(tenant.logoUrl),
        upiQrUrl: await resolveOptionalUrl(tenant.upiQrUrl),
        images: await Promise.all(
          tenant.images.map(async (img) => ({ ...img, imageUrl: await resolveMediaUrl(img.imageUrl) }))
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

tenantRouter.post("/images", requireRole("OWNER"), async (req, res, next) => {
  try {
    const body = z
      .object({ dataUrl: z.string().min(1), caption: z.string().optional() })
      .parse(req.body);
    const tenantId = req.user!.tenantId!;
    const count = await prisma.tenantImage.count({ where: { tenantId } });
    const stored = await storeMedia(tenantId, body.dataUrl, undefined, {
      kind: "image",
      folder: "branding",
    });
    const image = await prisma.tenantImage.create({
      data: { tenantId, imageUrl: stored.fileUrl, caption: body.caption, order: count },
    });
    res.status(201).json({ image: { ...image, imageUrl: await resolveMediaUrl(image.imageUrl) } });
  } catch (err) {
    next(err);
  }
});

tenantRouter.delete("/images/:id", requireRole("OWNER"), async (req, res, next) => {
  try {
    const existing = await prisma.tenantImage.findFirst({
      where: { id: req.params.id as string, tenantId: req.user!.tenantId! },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.tenantImage.delete({ where: { id: existing.id } });
    await deleteMedia(existing.imageUrl);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
