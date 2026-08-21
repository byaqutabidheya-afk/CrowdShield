# CrowdShield: free deployment guide

**Prepared:** 20 August 2026  
**Repository inspected:** `D:\CrowdShield`  
**Target:** one hosted FastAPI backend, one hosted operator dashboard, one hosted citizen PWA, Supabase persistence, and optional Firebase Cloud Messaging (FCM).

This guide is specific to this repository. It uses Render for the backend and Vercel for the two Vite frontends. That split is intentional: Render supports a long-lived WebSocket endpoint, while Vercel is a good free static-hosting option for Vite builds. Firebase is used for browser push credentials and FCM delivery, not as the database in this codebase.

## 1. What is being deployed

| Component | Repository directory | Recommended service | Public result |
|---|---|---|---|
| FastAPI API + WebSocket server | `backend/` plus root `ai_core/` | Render Free Web Service | `https://crowdshield-api.onrender.com` |
| Operator dashboard | `dashboard/` | Vercel project | `https://crowdshield-dashboard.vercel.app` |
| Citizen PWA | `citizen-pwa/` | Vercel project | `https://crowdshield-pwa.vercel.app` |
| Database, REST persistence, device tokens | Supabase project | Supabase Free | Supabase project URL |
| Browser push notifications | Firebase project + FCM | Firebase free usage where applicable | No separate public server required |

The data flow is:

```text
Dashboard ──HTTPS REST──┐
Dashboard ──WSS─────────┤
                        ├── Render FastAPI ── Supabase
Citizen PWA ─HTTPS REST─┤                  └── Firebase Admin/FCM ── browser push
Citizen PWA ─WSS────────┘
```

The browser Firebase configuration (`VITE_FIREBASE_*`) is public client configuration. The Firebase Admin service-account private key is not public and belongs only on Render.

## 2. Important repository findings before deployment

Do these checks before creating services:

1. **The dashboard WebSocket hook currently ignores `VITE_BACKEND_WS_URL`.** `dashboard/src/hooks/useLiveWebSocket.ts` constructs `wss://<frontend-host>:8000/ws/live`. On Vercel that points to the wrong host. Either patch that hook to use `import.meta.env.VITE_BACKEND_WS_URL` first, or use the small patch below.

   ```ts
   const getWsUrl = useCallback(() => {
     if (import.meta.env.VITE_BACKEND_WS_URL) return import.meta.env.VITE_BACKEND_WS_URL;
     if (typeof window !== 'undefined') {
       const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
       return `${protocol}//${window.location.host}/ws/live`;
     }
     return 'ws://127.0.0.1:8000/ws/live';
   }, []);
   ```

   Commit this change before deploying the dashboard. The PWA already reads `VITE_BACKEND_WS_URL`.

2. **Use direct backend URLs in both Vercel projects.** Do not leave the production values as `/api` or `:8000`; Vercel will otherwise send API requests to the frontend host.

3. **The backend loads `FIREBASE_SERVICE_ACCOUNT_JSON`, but the examples also mention `FIREBASE_CONFIG_JSON`.** For Render, use the exact name the code reads: `FIREBASE_SERVICE_ACCOUNT_JSON`. `FIREBASE_CONFIG_JSON` is not sufficient for the current Admin SDK code.

4. **The backend imports the repository-level `ai_core` package.** Configure Render from the repository root and start Uvicorn from `backend`, rather than setting Render’s root directory to `backend`.

5. **The current backend requirements do not list the heavy CV runtime packages** (`opencv-python`, `numpy`, `torch`, `ultralytics`). The API may deploy without them, but `/processing/*` can fail when the CV pipeline is invoked. Add and test the required packages before enabling hosted video processing. A free Render instance is not a dependable place for continuous CPU-heavy YOLO processing; for a free demo, run the CV worker locally or use a separate worker later.

6. **Free services are not production safety infrastructure.** Render Free services sleep after 15 minutes without inbound traffic and wake on a later request; WebSockets are disconnected when the instance is replaced. Supabase Free projects can be paused after low activity over a seven-day period. These limits are acceptable for a demo, not a live public emergency service.

## 3. Prepare Git and secrets

1. Create or use a private GitHub repository and push this project. Do not commit `.env`, Firebase service-account JSON, Supabase secret/service-role keys, Groq keys, or any downloaded private credentials.
2. Check the repository before pushing:

   ```powershell
   git status
   git ls-files | Select-String -Pattern '(^|/)(\.env|.*service.*account.*json)$|\.pem$|\.key$'
   ```

3. If a secret was ever committed or shared, rotate it before deployment. Removing it from the current working tree does not remove it from Git history.
4. Copy `.env.example` only for local development. Vite variables are embedded into the browser bundle at build time, so anything named `VITE_*` must be considered visible to users.

## 4. Create the Supabase database first

1. Create a Supabase project at [supabase.com](https://supabase.com), select the Free plan, and choose a region close to your users/backend.
2. Open SQL Editor and run the repository schema from `backend/app/models/schema.sql`. Confirm the tables used by this code exist, especially `zones`, `venue_configs`, `crowd_metrics`, `risk_alerts`, `incident_reports`, `interventions`, and `devices`.
3. Seed at least one venue and its zones using the project’s existing seed scripts or the dashboard’s zone flow. Test the schema locally first.
4. In Supabase Settings → API Keys, use the current **publishable** key for browser-side access if a browser client ever talks directly to Supabase. This repository’s frontends currently call the FastAPI API instead, so they do not need Supabase keys.
5. On Render, use the current **secret** key where available, or the legacy `service_role` key required by this code. Never put that value in either Vercel project. The backend’s `supabase_client.py` currently prefers `SUPABASE_SERVICE_ROLE_KEY` and falls back to `SUPABASE_ANON_KEY`.
6. Enable Row Level Security and write least-privilege policies before exposing Supabase directly. The backend service key bypasses RLS by design, so protect the FastAPI routes with authentication before treating this as production.
7. Remember that Free Supabase projects may pause after seven days of low activity. Visit the project or send legitimate test traffic before a demo, and keep an export/seed script because Free backups are limited.

## 5. Create and configure Firebase for the PWA

### 5.1 Browser app configuration

1. In Firebase Console, create/select the project that should receive CrowdShield push notifications.
2. Add a **Web app**. Copy its configuration into the PWA’s Vercel environment variables:

   ```text
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_VAPID_KEY=...
   ```

3. In Firebase Settings → Cloud Messaging, generate a Web Push certificate/key pair and use the public key as `VITE_FIREBASE_VAPID_KEY`.
4. Add both deployed PWA domains to Firebase Authentication → Settings → Authorized domains if Auth is used later. The current code’s FCM browser setup requires HTTPS; Vercel’s default domain supplies that.
5. Test notification permission from a real HTTPS browser. Notification permission, service-worker registration, and browser support are separate failure points.

The PWA combines Workbox and Firebase in `citizen-pwa/src/sw.ts`. Ensure a production build succeeds and that the generated service worker is served at the site root. Do not add a second competing root service worker unless the PWA architecture is changed.

### 5.2 Admin credentials for the backend

1. Firebase Console → Project settings → Service accounts → Generate new private key.
2. Store the downloaded JSON privately. Do not commit it or put it in Vercel.
3. On Render, paste the complete JSON as one environment variable named `FIREBASE_SERVICE_ACCOUNT_JSON`. Keep valid JSON with escaped/newline characters intact; Render’s environment-variable editor accepts the value as text.
4. Leave `FIREBASE_SERVICE_ACCOUNT_PATH` empty on Render unless you deliberately mount/provision a file. The current code supports either a file path or inline JSON, but inline JSON is the practical Render option.
5. If the JSON key was exposed, delete/revoke that service-account key in Google Cloud IAM and generate a replacement. Firebase browser API keys are different: they identify the Firebase project and are public by design, but should still have API restrictions.

## 6. Deploy the FastAPI backend to Render

Render’s current FastAPI flow is a **Web Service**, not a static site. Connect the GitHub repository and use these settings:

| Render field | Value |
|---|---|
| Runtime | Python 3 |
| Root Directory | leave empty (repository root) |
| Build Command | `pip install -r backend/requirements.txt` |
| Start Command | `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Instance type | Free |
| Health Check Path | `/health` |

If the repository needs the package installed explicitly, use this build command instead:

```text
pip install -r backend/requirements.txt && pip install -e .
```

Add these Render environment variables. Use the production values, not localhost values:

```text
BACKEND_HOST=0.0.0.0
BACKEND_PORT=10000
CORS_ORIGINS=https://YOUR-DASHBOARD.vercel.app,https://YOUR-PWA.vercel.app
CITIZEN_PWA_ORIGIN=https://YOUR-PWA.vercel.app
BACKEND_HTTP_URL=https://YOUR-BACKEND.onrender.com
BACKEND_WS_URL=wss://YOUR-BACKEND.onrender.com/ws/live

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY

GROQ_API_KEY=YOUR_KEY
GROQ_MODEL=openai/gpt-oss-120b
OPENWEATHERMAP_API_KEY=YOUR_KEY
VENUE_LAT=20.34472597223267
VENUE_LON=85.80678043814832
WEATHER_POLL_INTERVAL_SECONDS=600

FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

`PORT` is supplied by Render; the Uvicorn command must use `$PORT`. `BACKEND_PORT` is not what binds the deployed service.

After the first deploy:

```powershell
Invoke-RestMethod https://YOUR-BACKEND.onrender.com/health
Invoke-RestMethod https://YOUR-BACKEND.onrender.com/openapi.json
```

Confirm the response is JSON and inspect Render logs for import errors, missing environment variables, and Supabase connection warnings. Open a WebSocket test from a browser console or a small local client against `wss://YOUR-BACKEND.onrender.com/ws/live`.

### Video/AI runtime decision

For the first free deployment, deploy the API, simulations, database, weather, and WebSocket plumbing, then run the CV video worker locally during the demo. If hosted processing is required, add the missing CV dependencies, confirm the Render image has enough memory/disk, and test a small upload. Do not upload the repository’s large demo-video collection to a stateless free web service and assume files persist after restart.

## 7. Deploy the dashboard to Vercel

Create a new Vercel project from the same repository:

| Vercel field | Value |
|---|---|
| Root Directory | `dashboard` |
| Framework preset | Vite (or Other) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm ci` |

Set the following for **Production** and, if desired, Preview:

```text
VITE_BACKEND_HTTP_URL=https://YOUR-BACKEND.onrender.com/api
VITE_BACKEND_WS_URL=wss://YOUR-BACKEND.onrender.com/ws/live
```

Deploy, then add the final Vercel dashboard URL to Render’s `CORS_ORIGINS`. Trigger a new Render deploy after changing CORS. Vercel environment-variable changes apply to new deployments, so redeploy after editing them.

The dashboard is a Vite SPA. If the app later gains client-side routes, add `dashboard/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Do not try to use Vercel rewrites as a long-lived WebSocket proxy; connect the browser directly to Render over `wss://`.

## 8. Deploy the citizen PWA to Vercel

Create a second Vercel project from the same repository:

| Vercel field | Value |
|---|---|
| Root Directory | `citizen-pwa` |
| Framework preset | Vite (or Other) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm ci` |

Set:

```text
VITE_BACKEND_HTTP_URL=https://YOUR-BACKEND.onrender.com/api
VITE_BACKEND_WS_URL=wss://YOUR-BACKEND.onrender.com/ws/live
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

Deploy and open the site over HTTPS. Install it as a PWA on a phone, grant notifications, call the app’s `registerForPush()` flow, and confirm that `/api/devices/register` returns HTTP 204. Then create a test alert from the backend/dashboard and verify foreground and background delivery.

Add the final PWA URL to `CORS_ORIGINS` and `CITIZEN_PWA_ORIGIN` on Render. If Vercel preview URLs are used, add those exact origins too; do not use `*` with credentials.

## 9. Firebase API-key cleanup: what to do with unused keys

First classify each value:

| Value | Where it may go | Action |
|---|---|---|
| Firebase Web `apiKey` | PWA `VITE_FIREBASE_API_KEY` | Safe to expose when restricted to Firebase APIs; keep one active key per app/environment. |
| Firebase Web config (`projectId`, `appId`, sender ID, etc.) | PWA Vercel variables | Public client configuration; do not confuse it with Admin credentials. |
| Web Push VAPID public key | PWA `VITE_FIREBASE_VAPID_KEY` | Public; use the key pair belonging to the same Firebase project. |
| Service-account JSON/private key | Render only as `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret; revoke and replace if exposed. |
| Google Maps/Places/Gemini/other Google Cloud key | Only the specific client/server that uses that API | Do not reuse a Firebase browser key; create a separate API-restricted key. |

For the “bunch of unused Firebase API keys”:

1. In Google Cloud Console → APIs & Services → Credentials, record which Firebase project and app each key belongs to.
2. Keep only the key used by this PWA, unless separate staging and production Firebase projects are intentionally maintained.
3. For retained browser keys, set application restrictions to the deployed web origins where supported and API restrictions to Firebase-related APIs only. Never add Gemini, Places, Maps, or unrelated APIs to a public Firebase key.
4. Delete unused keys after confirming no other app, script, or staging deployment uses them. If uncertain, disable one at a time and monitor errors before permanent deletion.
5. Deleting/restricting a browser Firebase key does not replace the need for Firebase Security Rules/App Check. Those controls protect data and abuse; obscuring the key does not.
6. Audit browser bundles and Git history for any service-account JSON, private key, `SUPABASE_SERVICE_ROLE_KEY`, or non-Firebase Google API key. Rotate any exposed secret immediately.

## 10. End-to-end verification checklist

Run these in order:

1. `GET https://YOUR-BACKEND.onrender.com/health` returns `status: ok`.
2. `GET https://YOUR-BACKEND.onrender.com/api/zones` returns data or a controlled empty response.
3. From the dashboard, verify browser Network requests go to `https://YOUR-BACKEND.onrender.com/api/...`, not the Vercel host.
4. In the dashboard console, verify the WebSocket URL is `wss://YOUR-BACKEND.onrender.com/ws/live` and status becomes connected.
5. Repeat steps 3–4 in the PWA.
6. Submit a PWA incident report and confirm it appears in the dashboard/Supabase.
7. Register a device token and confirm the `devices` row is present.
8. Trigger a test high-risk alert and verify WebSocket update, dashboard alert, and FCM notification.
9. Wait for a Render sleep/wake cycle and confirm the client reconnect backoff eventually reconnects.
10. Test a Vercel preview separately; preview frontend origins must also be added to Render CORS if they call the backend.

Useful browser checks:

```js
fetch('https://YOUR-BACKEND.onrender.com/health').then(r => r.json())
new WebSocket('wss://YOUR-BACKEND.onrender.com/ws/live')
```

## 11. Free-tier operating rules

- Wake the Render backend before a presentation by calling `/health`; expect the first request after sleep to be slow.
- Keep a local fallback: run the backend and CV pipeline locally if the free instance is cold, out of memory, or has hit a quota.
- Do not rely on local uploaded video/audio files surviving a Render restart. Use object storage or a database-backed workflow for persistent assets.
- Keep Supabase tables protected with RLS and avoid exposing the service key to either frontend.
- Pin/test Python and Node dependencies periodically; free hosting does not remove dependency or browser compatibility risks.
- For a real safety-critical production deployment, use paid always-on compute, managed secrets, authentication/authorization, monitoring, backups, a queue/worker for CV processing, and a documented incident-response plan.

## Official documentation used

- [Render: deploy a FastAPI app](https://render.com/docs/deploy-fastapi)
- [Render: free services and limitations](https://render.com/docs/free)
- [Render: WebSockets](https://render.com/docs/websocket)
- [Vercel: Vite deployment and SPA rewrites](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel: environment variables](https://vercel.com/docs/environment-variables)
- [Firebase: web API-key management](https://firebase.google.com/docs/projects/api-keys)
- [Firebase: FCM for web](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- [Firebase: Admin SDK setup](https://firebase.google.com/docs/admin/setup)
- [Supabase: API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase: securing data](https://supabase.com/docs/guides/database/secure-data)
- [Supabase: Free Plan project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

These links and the plan caveats were checked against the providers’ current documentation on 20 August 2026.
