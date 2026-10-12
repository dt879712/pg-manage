import type { Request } from "express";

export function parsePagination(req: Request): { take: number; skip: number; page: number } {
  const limitRaw = Number(req.query.limit ?? 20);
  const pageRaw = Number(req.query.page ?? 1);
  const take = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 100);
  const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);
  return { take, skip: (page - 1) * take, page };
}
