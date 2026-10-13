# Going live

One codebase ships to Android, iOS, Windows and macOS. This is the release runbook.

## Already in the repo
- **Backend**: `Dockerfile` (applies migrations on start), `render.yaml`, health check at `/health`,
  configurable `CORS_ORIGINS`, baseline Prisma migration in `prisma/migrations/`.
- **Mobile**: EAS profiles in `mobile/eas.json` (production Android = `.aab`).
- **Desktop**: Tauri project in `mobile/src-tauri/`, built by `.github/workflows/desktop-build.yml`.

## 1. Host the backend (do this first)
The apps currently point at your PC on the LAN. They need a public HTTPS URL.

1. Create a **Render** account → **New → Blueprint** → pick this repo. It reads `render.yaml`.
   (Any Docker host works: Railway, Fly.io, a VPS.)
2. In the Render dashboard set the secret env vars (the blueprint marks them `sync: false`):
   `DATABASE_URL`, `RESET_URL_BASE`, `MAIL_FROM`, SMTP/Brevo, `EXPO_ACCESS_TOKEN`,
   `CLOUDINARY_*`. `JWT_SECRET` is auto-generated.
3. **One-time baseline** so migrations don't try to recreate your existing tables. Run once with the
   production `DATABASE_URL`:
   ```bash
   npx prisma migrate resolve --applied 20260101000000_init
   ```
   (A brand-new database: skip this — `migrate deploy` builds everything.)
4. Copy the service URL (e.g. `https://dev-hostel-api.onrender.com`), or attach a custom domain
   like `https://api.yourdomain.com`.

## 2. Point the apps at the API
- Set the production URL in `mobile/eas.json` → `build.production.env.EXPO_PUBLIC_API_URL`
  (currently `https://YOUR-API-DOMAIN`) and rebuild.
- Users can also change it at runtime: **Profile → Server**.

## 3. Android → Google Play
- Google Play Console account (one-time **$25**); create the app id `com.pgmanage.app`.
- Build + submit:
  ```bash
  cd mobile
  npx eas-cli login
  npx eas-cli build  -p android --profile production
  npx eas-cli submit -p android --profile production
  ```
- Listing needs: title, short/full description, 2–8 phone screenshots, 1024×500 feature graphic,
  a privacy policy URL, and the Data safety form.

## 4. iOS → App Store
- Apple Developer Program (**$99/yr**).
  ```bash
  cd mobile
  npx eas-cli build  -p ios --profile production
  npx eas-cli submit -p ios --profile production
  ```
- App Store Connect: metadata, screenshots (6.7" + 6.5" iPhone, iPad if tablet support is on),
  privacy questionnaire.

## 5. Windows / macOS desktop
```bash
gh workflow run desktop-build.yml
gh run download <run-id> -n dev-hostel-windows   # .exe
gh run download <run-id> -n dev-hostel-macos     # .dmg (Apple Silicon)
```
- Signing/notarizing the macOS build (Apple Developer ID) removes the right-click-to-open step.
- An Intel-Mac build can be added to the workflow with `--target x86_64-apple-darwin`.

## 6. Accounts / credentials only you can provide
| Item | Needed for | Cost |
|---|---|---|
| Hosting account (Render/Railway/Fly) | backend online | free–$7/mo |
| Domain (optional) | `api.yourdomain.com` | ~$10/yr |
| Google Play Console | Android store | $25 once |
| Apple Developer Program | iOS + Mac notarize | $99/yr |
| Firebase (FCM) + APNs key | push notifications | free |

## 7. After launch
- **OTA updates**: add `expo-updates` so JS fixes ship without a store re-release.
- **Migrations going forward**: change `prisma/schema.prisma` → `npx prisma migrate dev --name <change>`
  → commit; the deploy runs `prisma migrate deploy` automatically.
- **Monitoring**: watch Render logs and the `/health` endpoint.
