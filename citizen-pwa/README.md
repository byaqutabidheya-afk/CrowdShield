# CrowdShield Citizen PWA

The CrowdShield Citizen PWA is a standalone, mobile-first web application designed for on-the-ground attendees. It provides real-time safety alerts, multilingual broadcasting, standalone foreground geofencing, dynamic evasion routing, and media-rich incident reporting. 

It is completely decoupled from the Phase 5 Command Dashboard but seamlessly integrates via WebSocket and HTTP APIs.

## Running Locally

To run the PWA in your local development environment:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
The app will be available at `http://localhost:5174` (or `5173` depending on port availability).

## Environment Variables

Before running or building the app, you must configure the environment. Create a `.env` file in the root of the `citizen-pwa` directory. 

Please reference the **Phase 6 Environment Variables** section of the CrowdShield guide for the exact keys required. You will need:
- Backend connection URLs (`VITE_BACKEND_HTTP_URL` and `VITE_BACKEND_WS_URL`)
- Firebase configuration variables (`VITE_FIREBASE_API_KEY`, etc.) for background push notifications

## Building for Production

To create an optimized, minified production build with service workers and precaching enabled:

```bash
npm run build
```

This will run TypeScript type-checking and bundle the application into the `dist/` folder. The `vite-plugin-pwa` will automatically inject the manifest and precache logic into the custom service worker.

## Deployment

Because this is an offline-capable Progressive Web App with Firebase background push notifications, **it MUST be served over HTTPS** to function correctly (browsers aggressively block Service Workers, Geolocation APIs, and Web Push on unencrypted HTTP connections).

### Deploying to Vercel or Netlify
Vercel and Netlify both provide automatic HTTPS out of the box.

1. **Connect Repository:** Import your repository to Vercel or Netlify.
2. **Set Build Settings:**
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. **Configure Environment Variables:** Add all the required `VITE_*` environment variables in the Vercel/Netlify dashboard settings before triggering the first build.
4. **Deploy:** Trigger the deployment. Your app will automatically receive an SSL certificate.

### Updating CORS (If deploying)
If you deploy this PWA to a public URL (e.g., `https://my-citizen-app.vercel.app`), you **must** add that exact domain to the backend's `CORS_ORIGINS` environment variable or the `allowed_origins` list in `backend/app/main.py`.
