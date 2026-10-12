import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import { env, cloudinaryConfigured } from "../env";

/** Cloudinary media kinds we use. */
export type CloudResourceType = "image" | "video";

let configured = false;

function ensureConfig(): void {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary storage is not configured");
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.cloudinaryCloudName,
      api_key: env.cloudinaryApiKey,
      api_secret: env.cloudinaryApiSecret,
      secure: true,
    });
    configured = true;
  }
}

export function isCloudinaryConfigured(): boolean {
  return cloudinaryConfigured();
}

export interface UploadResult {
  publicId: string;
  resourceType: CloudResourceType;
  type: string;
  bytes: number;
}

interface UploadOptions {
  resourceType: CloudResourceType;
  folder: string;
  publicId?: string;
}

/** Upload an in-memory buffer to Cloudinary as an authenticated asset. */
export function uploadBuffer(
  buffer: Buffer,
  options: UploadOptions
): Promise<UploadResult> {
  ensureConfig();
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: options.resourceType,
        type: "authenticated",
        folder: options.folder,
        public_id: options.publicId,
        overwrite: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({
          publicId: result.public_id,
          resourceType: (result.resource_type as CloudResourceType) ?? options.resourceType,
          type: result.type ?? "authenticated",
          bytes: Number(result.bytes ?? buffer.length),
        });
      }
    );
    Readable.from(buffer).pipe(upload);
  });
}

/** Build a signed delivery URL for an authenticated asset. */
export function signedUrl(
  publicId: string,
  resourceType: CloudResourceType,
  expiresInSeconds = 3600
): string {
  ensureConfig();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    secure: true,
    expires_at: expiresAt,
  });
}

export async function destroyAsset(
  publicId: string,
  resourceType: CloudResourceType
): Promise<void> {
  ensureConfig();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    invalidate: true,
  });
}
