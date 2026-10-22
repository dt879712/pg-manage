-- Add an explicit front/back side marker to documents (e.g. ID proof front/back).
ALTER TABLE "documents" ADD COLUMN "side" TEXT;
