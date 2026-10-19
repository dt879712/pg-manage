import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function guardianEmailFor(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `guardian-${digits || "unknown"}@devhostel.local`;
}

/**
 * Ensures the student's guardian phone has a linked PARENT login that shares the
 * student's password. Returns the parent user id, or null when there is no
 * guardian phone on file.
 */
export async function ensureGuardianParent(
  tx: Tx,
  tenantId: string,
  student: {
    id: string;
    firstName: string;
    guardianName?: string | null;
    guardianPhone?: string | null;
  },
  passwordHash: string
): Promise<string | null> {
  const phone = student.guardianPhone?.trim();
  if (!phone) return null;

  const link = await tx.parentStudent.findFirst({
    where: { studentId: student.id },
    orderBy: { createdAt: "asc" },
  });
  if (link) {
    await tx.user.update({ where: { id: link.parentUserId }, data: { passwordHash, phone } });
    return link.parentUserId;
  }

  const email = guardianEmailFor(phone);
  let parent = await tx.user.findFirst({
    where: { tenantId, role: "PARENT", OR: [{ phone }, { email }] },
    orderBy: { createdAt: "asc" },
  });
  if (parent) {
    parent = await tx.user.update({ where: { id: parent.id }, data: { passwordHash, phone } });
  } else {
    parent = await tx.user.create({
      data: {
        name: student.guardianName?.trim() || `Guardian of ${student.firstName}`,
        email,
        phone,
        passwordHash,
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

/** Copies a student's new password hash onto every linked parent login. */
export async function syncStudentPasswordToParents(
  tx: Tx,
  studentId: string,
  passwordHash: string
): Promise<void> {
  const links = await tx.parentStudent.findMany({
    where: { studentId },
    select: { parentUserId: true },
  });
  if (!links.length) return;
  await tx.user.updateMany({
    where: { id: { in: links.map((l) => l.parentUserId) } },
    data: { passwordHash },
  });
}
