import { prisma } from "../prisma";

export async function getStudentForUser(userId: string) {
  return prisma.student.findUnique({ where: { userId } });
}

export async function getParentStudentIds(parentUserId: string): Promise<string[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentUserId },
    select: { studentId: true },
  });
  return links.map((l) => l.studentId);
}
