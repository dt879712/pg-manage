import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  port: Number(process.env.PORT ?? 4000),
  // Free email service via SMTP (e.g. Gmail app password). If SMTP_USER/PASS are
  // empty, reset links are shown on screen / logged instead of emailed.
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN ?? "",
  webPushVapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
  webPushVapidPrivateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
  webPushVapidSubject: process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:no-reply@devhostel.app",
  // Firebase Cloud Messaging (HTTP v1). Either a raw/minified service-account
  // JSON string, or the same JSON base64-encoded. May also be stored in the
  // AppConfig table under the "fcm_service_account" key.
  fcmServiceAccount: process.env.FCM_SERVICE_ACCOUNT ?? "",
  mailFrom: process.env.MAIL_FROM ?? "Dev Hostel <no-reply@devhostel.app>",
  resetUrlBase: process.env.RESET_URL_BASE ?? "http://localhost:8083",
  // Comma-separated allowed browser origins, or "*" for all.
  corsOrigins: process.env.CORS_ORIGINS ?? "*",
  // Cloudinary storage for documents, photos and status videos.
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
};

export function cloudinaryConfigured(): boolean {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}
