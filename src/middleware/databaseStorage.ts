import type { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma";

// For a 500 MB database quota, pause new writes at 450 MB to leave room for
// concurrent requests, indexes, and normal PostgreSQL overhead.
export const DATABASE_LIMIT_BYTES = 500_000_000;
export const DATABASE_WRITE_STOP_BYTES = 450_000_000;

export async function getDatabaseSizeBytes(): Promise<bigint> {
  const rows = await prisma.$queryRaw<Array<{ sizeBytes: bigint }>>`
    SELECT pg_database_size(current_database()) AS "sizeBytes"
  `;
  if (!rows[0] || rows[0].sizeBytes == null) {
    throw new Error("The database did not return its current size.");
  }
  return BigInt(rows[0].sizeBytes);
}

const publicWritePaths = new Set([
  "/auth/register-owner",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/admissions",
  "/media/admission/sign",
  "/media/admission/confirm",
]);

export async function databaseStorageGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    next();
    return;
  }

  // Login and admission-status lookups do not create records. Let normal auth
  // middleware handle anonymous or malformed tokens without a database-size query.
  if (req.path === "/auth/login" || req.path === "/admissions/status") {
    next();
    return;
  }
  const hasBearerToken = req.headers.authorization?.startsWith("Bearer ") ?? false;
  if (!hasBearerToken && !publicWritePaths.has(req.path)) {
    next();
    return;
  }

  try {
    const sizeBytes = await getDatabaseSizeBytes();
    if (sizeBytes >= BigInt(DATABASE_WRITE_STOP_BYTES)) {
      res.status(507).json({
        code: "DATABASE_STORAGE_LIMIT",
        error:
          "Database writes are paused at the 450 MB safety limit to protect the 500 MB database cap. Move media to Cloudinary or increase database capacity.",
      });
      return;
    }
    next();
  } catch (error) {
    console.error("[database-storage] Could not verify database size", error);
    res.status(503).json({
      code: "DATABASE_STORAGE_CHECK_FAILED",
      error: "Writes are paused because the database storage limit could not be checked.",
    });
  }
}
