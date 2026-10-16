# Going live

One codebase ships to Android, iOS, Windows and macOS. This is the release runbook.

## Already in the repo
- **Backend**: `Dockerfile` (applies migrations on start), `render.yaml`, `.gcloudignore`,
  health check at `/health`, configurable `CORS_ORIGINS`, baseline Prisma migration in
  `prisma/migrations/`.
- **Mobile**: EAS profiles in `mobile/eas.json` (production Android = `.aab`).
- **Desktop**: Tauri project in `mobile/src-tauri/`, built by `.github/workflows/desktop-build.yml`.

## 1. Host the backend (do this first)
The apps currently point at your PC on the LAN. They need a public HTTPS URL.
Recommended: **Google Cloud Run** under your existing project `dev-hostel-d7b4e`.

### Option A — Google Cloud Run (recommended)
1. In the Google Cloud console, select project **dev-hostel-d7b4e** and **enable billing**
   (required for Cloud Run; you can set a budget alert to cap spend).
2. Enable these APIs once: **Cloud Run**, **Cloud Build**, **Artifact Registry**.
3. Install the `gcloud` CLI, then deploy:
   ```bash
   gcloud auth login
   gcloud config set project dev-hostel-d7b4e
   gcloud run deploy dev-hostel-api \
     --source . \
     --region asia-south1 \
     --allow-unauthenticated \
     --set-env-vars CORS_ORIGINS=*,RESET_URL_BASE=https://app.example.com \
     --set-env-vars DATABASE_URL="<supabase-url>",JWT_SECRET="<random>"
   ```
   `--source .` builds your `Dockerfile` in the cloud (no local Docker needed) and returns an
   HTTPS URL like `https://dev-hostel-api-xxxxx.a.run.app`. Put secrets in Secret Manager and use
   `--set-secrets` for the sensitive ones. If Supabase, use its **connection-pooler** URL.
4. **One-time baseline** for the existing database (run once with the production `DATABASE_URL`):
   ```bash
   npx prisma migrate resolve --applied 20260101000000_init
   ```
   (A brand-new database: skip — `migrate deploy` builds everything.)
5. (Optional) Map a custom domain like `api.yourdomain.com` in Cloud Run → Manage custom domains.

### Option B — Render
1. Create a Render account → **New → Blueprint** → pick this repo. It reads `render.yaml`.
2. Set the secret env vars in the dashboard; `JWT_SECRET` is auto-generated.
3. Do the same one-time `prisma migrate resolve` (step 4 above).
4. Copy the service URL, or attach a custom domain.

## 2. Point the apps at the API
- Set the production URL in `mobile/eas.json` → `build.production.env.EXPO_PUBLIC_API_URL`
  (currently `https://YOUR-API-DOMAIN`) and rebuild.
- Users can also change it at runtime: **Profile → Server**.

## 3. Android → Google Play
- Google Play Console account (one-time **$25**); create the app id `com.devhostel.app`.
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
| Google Cloud billing on `dev-hostel-d7b4e` | backend (Cloud Run) | ~$0–5/mo |
| Domain (optional) | `api.yourdomain.com` | ~$10/yr |
| Google Play Console | Android store | $25 once |
| Apple Developer Program | iOS + Mac notarize | $99/yr |
| Firebase (FCM) + APNs key | push notifications | free |

## 7. After launch
- **OTA updates**: add `expo-updates` so JS fixes ship without a store re-release.
- **Migrations going forward**: change `prisma/schema.prisma` → `npx prisma migrate dev --name <change>`
  → commit; the deploy runs `prisma migrate deploy` automatically.
- **Monitoring**: Cloud Run logs / metrics, and the `/health` endpoint.
