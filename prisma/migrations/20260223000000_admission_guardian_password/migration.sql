-- Remember the guardian's chosen password on the application so the parent
-- login can be created with it when the admission is approved.
ALTER TABLE "admission_requests" ADD COLUMN "guardianPasswordHash" TEXT;
