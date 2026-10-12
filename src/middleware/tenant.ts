import type { Request, Response, NextFunction } from "express";

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.tenantId) {
    res.status(400).json({ error: "No tenant context" });
    return;
  }
  next();
}
