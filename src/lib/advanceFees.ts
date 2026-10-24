import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";

/** Apply the student's advance deposits to the oldest outstanding invoices. */
export async function reconcileAdvanceFees(
  tx: PrismaTypes.TransactionClient,
  tenantId: string,
  studentId: string
): Promise<void> {
  // Lock this student's row so concurrent invoices/deposits cannot spend the
  // same advance balance twice.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "students" WHERE "id" = ${studentId} FOR UPDATE`);

  const [advanceTotal, invoices] = await Promise.all([
    tx.advanceFee.aggregate({
      where: { tenantId, studentId },
      _sum: { amount: true },
    }),
    tx.invoice.findMany({
      where: { tenantId, studentId },
      orderBy: [
        { periodYear: "asc" },
        { periodMonth: "asc" },
        { dueDate: "asc" },
        { createdAt: "asc" },
      ],
      include: { payments: { select: { amount: true } } },
    }),
  ]);

  let available = advanceTotal._sum.amount ?? 0;
  for (const invoice of invoices) {
    const cashPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const advanceApplied = invoice.status === "CANCELLED"
      ? 0
      : Math.min(available, Math.max(invoice.amount - cashPaid, 0));
    available -= advanceApplied;

    const totalPaid = cashPaid + advanceApplied;
    const status = invoice.status === "CANCELLED"
      ? "CANCELLED"
      : totalPaid >= invoice.amount
        ? "PAID"
        : totalPaid > 0
          ? "PARTIAL"
          : "PENDING";

    if (invoice.advanceApplied !== advanceApplied || invoice.status !== status) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { advanceApplied, status },
      });
    }
  }
}
