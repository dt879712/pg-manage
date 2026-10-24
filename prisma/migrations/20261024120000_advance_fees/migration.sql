CREATE TABLE "advance_fees" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidThrough" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "advance_fees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "advance_fees_tenantId_idx" ON "advance_fees"("tenantId");
CREATE INDEX "advance_fees_studentId_idx" ON "advance_fees"("studentId");
CREATE INDEX "advance_fees_paidThrough_idx" ON "advance_fees"("paidThrough");

ALTER TABLE "advance_fees"
  ADD CONSTRAINT "advance_fees_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advance_fees"
  ADD CONSTRAINT "advance_fees_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advance_fees"
  ADD CONSTRAINT "advance_fees_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
