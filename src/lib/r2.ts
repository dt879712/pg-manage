import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, r2Configured } from "../env";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!r2Configured()) {
    throw new Error("R2 storage is not configured");
  }
  if (!client) {
    const endpoint =
      env.r2Endpoint || `https://${env.r2AccountId}.r2.cloudflarestorage.com`;
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return client;
}

export function storageConfigured(): boolean {
  return r2Configured();
}

/** Upload a buffer directly from the server. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, Body: body, ContentType: contentType })
  );
}

/** Presigned URL the client can PUT a file to directly. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.r2Bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

/** Presigned URL the client can GET (play/download) a file from. */
export async function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.r2Bucket, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.r2Bucket, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: env.r2Bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
