import { hashPassword } from "../auth";
import { generateTempPassword } from "./password";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function guardianEmailFor(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `guardian-${digits || "unknown"}@devhostel.local`;
}

/** Stable placeholder email for a login identified only by mobile number. */
export function accountEmailFor(email?: string | null, phone?: string | null): string {
  if (email?.trim()) return email.trim().toLowerCase();
  const digits = (phone ?? "").replace(/\D/g, "");
  return `user-${digits || "unknown"}@devhostel.local`;
}

/**
 * Ensures the student's guardian has a linked PARENT login with its own unique
 * phone number and its own password (independent from the student's). Returns
 * the parent user id, or null when there is no guardian phone or email on file.
 */
export async function ensureGuardianParent(
  tx: Tx,
  tenantId: string,
  student: {
    id: string;
    firstName: string;
    guardianName?: string | null;
    guardianPhone?: string | null;
    guardianEmail?: string | null;
  },
  passwordHash?: string | null
): Promise<string | null> {
  const phone = student.guardianPhone?.trim();
  const emailInput = student.guardianEmail?.trim().toLowerCase();
  if (!phone && !emailInput) return null;

  const link = await tx.parentStudent.findFirst({
    where: { studentId: student.id },
    orderBy: { createdAt: "asc" },
  });
  if (link) {
    // A guardian login already exists for this student — leave its own phone
    // and password alone, just refresh the contact details on file.
    await tx.user.update({
      where: { id: link.parentUserId },
      data: { ...(phone ? { phone } : {}), ...(emailInput ? { email: emailInput } : {}) },
    });
    return link.parentUserId;
  }

  const email = emailInput ?? (phone ? guardianEmailFor(phone) : undefined);
  let parent = await tx.user.findFirst({
    where: {
      tenantId,
      role: "PARENT",
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!parent) {
    // Use the password chosen for the guardian when supplied (owner-created or
    // self-set on the application); otherwise fall back to a random one.
    parent = await tx.user.create({
      data: {
        name: student.guardianName?.trim() || `Guardian of ${student.firstName}`,
        email: email ?? guardianEmailFor(phone ?? student.id),
        phone,
        passwordHash: passwordHash ?? (await hashPassword(generateTempPassword())),
        role: "PARENT",
        tenantId,
      },
    });
  }

  await tx.parentStudent.create({
    data: { tenantId, parentUserId: parent.id, studentId: student.id, relation: "Guardian" },
  });
  return parent.id;
}
