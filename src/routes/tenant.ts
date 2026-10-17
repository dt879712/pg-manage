import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
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
        primaryColor: z.string().nullable().optional(),
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
