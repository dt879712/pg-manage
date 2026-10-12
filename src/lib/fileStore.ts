import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  isCloudinaryConfigured,
  uploadBuffer,
  signedUrl,
  destroyAsset,
  type CloudResourceType,
} from "./cloudinary";

/** Max stored image size per upload (0.6 MB), after compression. */
export const MAX_IMAGE_BYTES = Math.floor(0.6 * 1024 * 1024);
/** Max stored video size per upload (25 MB). */
export const MAX_VIDEO_BYTES = Math.floor(25 * 1024 * 1024);

const CLD_PREFIX = "cld:";

export type MediaKind = "image" | "video";

export function mediaStorageConfigured(): boolean {
  return isCloudinaryConfigured();
}

function isCloudinaryRef(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(CLD_PREFIX);
}

function parseCloudinaryRef(ref: string): { resourceType: CloudResourceType; publicId: string } {
  const rest = ref.slice(CLD_PREFIX.length);
  const idx = rest.indexOf(":");
  const resourceType = (idx === -1 ? "image" : rest.slice(0, idx)) as CloudResourceType;
  const publicId = idx === -1 ? rest : rest.slice(idx + 1);
  return { resourceType, publicId };
}

export interface DataUrlParts {
  mimeType: string;
  buffer: Buffer;
}

/** Parse a "data:<mime>;base64,<data>" URL into its mime + bytes. */
export function parseDataUrl(dataUrl: string): DataUrlParts {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Invalid data URL");
  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const payload = match[3] ?? "";
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { mimeType, buffer };
}

async function compressToLimit(buffer: Buffer, capBytes: number): Promise<Buffer> {
  const attempts: { width: number; quality: number }[] = [
    { width: 1600, quality: 72 },
    { width: 1600, quality: 58 },
    { width: 1280, quality: 52 },
    { width: 1024, quality: 46 },
    { width: 864, quality: 40 },
    { width: 720, quality: 36 },
    { width: 600, quality: 32 },
    { width: 480, quality: 30 },
  ];
  let best = buffer;
  for (const a of attempts) {
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: a.width, withoutEnlargement: true })
      .jpeg({ quality: a.quality, mozjpeg: true })
      .toBuffer();
    best = out;
    if (out.length <= capBytes) return out;
  }
  return best;
}

export interface StoreResult {
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  stored: "cloud" | "inline";
}

interface StoreOptions {
  kind: MediaKind;
  /** Folder namespace, e.g. "documents" or "status-videos". */
  folder: string;
}

/**
 * Store an uploaded file. When Cloudinary is configured the (compressed) bytes
 * are uploaded as an authenticated asset and a portable "cld:<type>:<publicId>"
 * reference is returned — the database keeps the reference, not the payload.
 * When storage is not configured it falls back to the legacy inline base64 data
 * URL so nothing breaks.
 */
export async function storeMedia(
  tenantId: string,
  dataUrl: string,
  providedMimeType: string | undefined,
  options: StoreOptions
): Promise<StoreResult> {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  let effectiveMime = providedMimeType || mimeType;
  let bytes = buffer;

  const cap = options.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (bytes.length > cap && effectiveMime.startsWith("image/")) {
    bytes = await compressToLimit(bytes, cap);
    effectiveMime = "image/jpeg";
  }

  if (bytes.length > cap) {
    const mb = (cap / (1024 * 1024)).toFixed(1);
    throw Object.assign(new Error(`File exceeds the ${mb} MB limit`), { status: 413 });
  }

  if (!mediaStorageConfigured()) {
    return {
      fileUrl: `data:${effectiveMime};base64,${bytes.toString("base64")}`,
      mimeType: effectiveMime,
      sizeBytes: bytes.length,
      stored: "inline",
    };
  }

  const uploaded = await uploadBuffer(bytes, {
    resourceType: options.kind,
    folder: `${options.folder}/${tenantId}`,
    publicId: randomUUID(),
  });

  return {
    fileUrl: `${CLD_PREFIX}${uploaded.resourceType}:${uploaded.publicId}`,
    mimeType: effectiveMime,
    sizeBytes: uploaded.bytes,
    stored: "cloud",
  };
}

/** Convert a stored reference into a URL the client can load. */
export async function resolveMediaUrl(fileUrl: string): Promise<string> {
  if (!isCloudinaryRef(fileUrl)) return fileUrl;
  const { resourceType, publicId } = parseCloudinaryRef(fileUrl);
  try {
    return signedUrl(publicId, resourceType);
  } catch {
    return fileUrl;
  }
}

/** Resolve an optional reference; passes non-references (or null/undefined) through. */
export async function resolveOptionalUrl(
  value: string | null | undefined
): Promise<string | null | undefined> {
  if (!value) return value;
  return resolveMediaUrl(value);
}

/**
 * Store a value to Cloudinary only when it is a "data:" URL; otherwise return
 * the value unchanged (already a reference or an external URL).
 */
export async function storeMaybeDataUrl(
  tenantId: string,
  value: string | null | undefined,
  options: StoreOptions
): Promise<string | null | undefined> {
  if (!value || !value.startsWith("data:")) return value;
  const result = await storeMedia(tenantId, value, undefined, options);
  return result.fileUrl;
}

export async function deleteMedia(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl || !isCloudinaryRef(fileUrl)) return;
  const { resourceType, publicId } = parseCloudinaryRef(fileUrl);
  try {
    await destroyAsset(publicId, resourceType);
  } catch {
    // ignore storage errors; row removal still proceeds
  }
}
