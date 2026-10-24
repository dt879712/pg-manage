import { prisma } from "../prisma";
import { deleteMedia } from "./fileStore";

/** Permanently remove an account and its account-owned data. */
export async function permanentlyDeleteUserAccount(
  userId: string,
  tenantId: string,
  inactiveOnly = false
): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: { id: userId, tenantId, ...(inactiveOnly ? { isActive: false } : {}) },
    select: { id: true, role: true, photoUrl: true },
  });
  if (!existing || existing.role === "OWNER") return false;

  const student = await prisma.student.findFirst({
    where: { userId, tenantId },
    select: {
      id: true,
      photoUrl: true,
      documents: { select: { fileUrl: true } },
      statusVideos: { select: { objectKey: true } },
    },
  });
  const admissionRequests = await prisma.admissionRequest.findMany({
    where: { userId, tenantId },
    select: { documents: { select: { fileUrl: true } } },
  });
  const userDocuments = await prisma.document.findMany({
    where: { tenantId, userId },
    select: { fileUrl: true },
  });
  const mediaToDelete = [
    existing.photoUrl,
    student?.photoUrl,
    ...(student?.documents.map((document) => document.fileUrl) ?? []),
    ...(student?.statusVideos.map((video) => video.objectKey) ?? []),
    ...admissionRequests.flatMap((request) => request.documents.map((document) => document.fileUrl)),
    ...userDocuments.map((document) => document.fileUrl),
  ];

  const deleted = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id: userId, tenantId, ...(inactiveOnly ? { isActive: false } : {}) },
      select: { id: true },
    });
    if (!current) return false;

    const linkedStudent = await tx.student.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (linkedStudent) await tx.student.delete({ where: { id: linkedStudent.id } });
    await tx.admissionRequest.deleteMany({ where: { userId, tenantId } });
    await tx.user.delete({ where: { id: userId } });
    return true;
  });

  if (deleted) await Promise.all(mediaToDelete.map((media) => deleteMedia(media)));
  return deleted;
}

/**
 * Old versions sometimes left a disabled account behind after the owner
 * thought it had been deleted. An owner reusing those identifiers can safely
 * purge only disabled accounts in their own PG before the uniqueness checks.
 */
export async function purgeDisabledAccountsForIdentifiers(
  tenantId: string,
  identifiers: { emails?: string[]; phones?: string[] }
): Promise<void> {
  const emails = [...new Set((identifiers.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const phones = [...new Set((identifiers.phones ?? []).map((phone) => phone.trim()).filter(Boolean))];
  const OR = [
    ...(emails.length ? [{ email: { in: emails } }] : []),
    ...(phones.length ? [{ phone: { in: phones } }] : []),
  ];
  if (!OR.length) return;

  const staleAccounts = await prisma.user.findMany({
    where: { tenantId, isActive: false, OR },
    select: { id: true },
  });
  for (const account of staleAccounts) {
    await permanentlyDeleteUserAccount(account.id, tenantId, true);
  }
}
