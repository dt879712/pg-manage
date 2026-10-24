import { prisma } from "./prisma";
import { mediaStorageConfigured, storeMedia, type MediaKind } from "./lib/fileStore";

const batchSize = 25;

const mediaFields: Array<{
  model: string;
  field: string;
  tenantField: string;
  kind: MediaKind;
  folder: string;
}> = [
  { model: "student", field: "photoUrl", tenantField: "tenantId", kind: "image", folder: "students" },
  { model: "user", field: "photoUrl", tenantField: "tenantId", kind: "image", folder: "users" },
  { model: "tenant", field: "logoUrl", tenantField: "id", kind: "image", folder: "branding" },
  { model: "tenant", field: "upiQrUrl", tenantField: "id", kind: "image", folder: "branding" },
  { model: "tenantImage", field: "imageUrl", tenantField: "tenantId", kind: "image", folder: "branding/gallery" },
  { model: "document", field: "fileUrl", tenantField: "tenantId", kind: "image", folder: "documents" },
  { model: "studentStatusVideo", field: "objectKey", tenantField: "tenantId", kind: "video", folder: "status-videos" },
];

async function migrateInlineMedia(): Promise<number> {
  if (!mediaStorageConfigured()) {
    throw new Error("Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET first.");
  }

  let migrated = 0;
  for (const target of mediaFields) {
    const delegate = (prisma as any)[target.model];
    while (true) {
      const rows = await delegate.findMany({
        where: { [target.field]: { startsWith: "data:" } },
        take: batchSize,
        select: {
          id: true,
          [target.tenantField]: true,
          [target.field]: true,
          ...(target.model === "document"
            ? { studentId: true, userId: true, admissionRequestId: true }
            : target.model === "studentStatusVideo"
              ? { studentId: true }
              : {}),
        },
        orderBy: { id: "asc" },
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        const dataUrl = row[target.field] as string;
        const folder = target.model === "document"
          ? row.admissionRequestId
            ? "admissions"
            : row.studentId
              ? `documents/student/${row.studentId}`
              : row.userId
                ? `documents/user/${row.userId}`
                : "documents"
          : target.model === "studentStatusVideo"
            ? `status-videos/${row.studentId}`
            : target.folder;
        const result = await storeMedia(
          String(row[target.tenantField] || "global"),
          dataUrl,
          undefined,
          { kind: target.kind, folder }
        );
        await delegate.update({
          where: { id: row.id },
          data: { [target.field]: result.fileUrl },
        });
        migrated += 1;
        console.log(`Moved ${target.model}.${target.field} record ${row.id} to Cloudinary`);
      }
    }
  }
  return migrated;
}

void migrateInlineMedia()
  .then((count) => console.log(`Finished. Migrated ${count} inline media record(s).`))
  .catch((error) => {
    console.error("Inline media migration stopped. Existing database values were left intact unless already migrated.", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
