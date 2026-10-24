import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "./env";

export type TokenPayload = {
  sub: string;
  tenantId: string | null;
  role: Role;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "365d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
