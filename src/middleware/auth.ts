import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { verifyToken, type TokenPayload } from "../auth";
import { prisma } from "../prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let payload: TokenPayload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true },
    });
    if (!account?.isActive) {
      res.status(401).json({ error: "This account has been deleted or disabled" });
      return;
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
