# CrowdShield Windows Local Setup and Test Guide

This guide covers cloning CrowdShield from GitHub, restoring ignored/local files, installing dependencies, configuring services, running the FastAPI backend, dashboard, citizen PWA, and testing CV, risk, GenAI, voice, database, and notification paths on Windows 10/11.

## 1. Architecture and ports

| Component | Directory | Local endpoint |
| --- | --- | --- |
| Computer vision | ai_core/cv_pipeline | Video to phase-1 metrics |
| Risk engine | ai_core/risk_engine | Phase-1 metrics to risk and alerts |
| GenAI and voice | ai_core/genai_pipeline | Recommendations, translation, TTS, voice |
| FastAPI backend | backend | http://localhost:8000 |
| React dashboard | dashboard | http://localhost:3000 |
| Citizen PWA | citizen-pwa | http://localhost:5174 |

The root package.json is not an application package. Install Node dependencies inside dashboard and citizen-pwa.

## 2. Install prerequisites

Run PowerShell. If your organization restricts installation, an administrator can perform:

~~~powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.12 -e
winget install --id OpenJS.NodeJS.LTS -e
~~~

Close and reopen PowerShell and verify:

~~~powershell
git --version
py -3.12 --version
python --version
node --version
npm.cmd --version
~~~

Python 3.10 or newer is required by pyproject.toml; Python 3.12 is recommended. If winget is unavailable, install Git for Windows, Python from the official installer (enable Add python.exe to PATH and pip), and Node.js LTS manually.

If PowerShell blocks npm.ps1, use npm.cmd as this guide does, or set the user policy:

~~~powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
~~~

## 3. Clone the repository

~~~powershell
New-Item -ItemType Directory -Force C:\src | Out-Null
Set-Location C:\src
git clone https://github.com/byaqutabidheya-afk/CrowdShield.git
Set-Location .\CrowdShield
git status
Get-ChildItem
Test-Path .\backend
Test-Path .\dashboard
Test-Path .\citizen-pwa
Test-Path .\ai_core
~~~

For a private GitHub repository, authenticate Git manually or use an approved SSH/token setup. Never put credentials in this guide or commit them.

## 4. Files Git intentionally does not provide

The root .gitignore excludes .env, .env.local, virtual environments, node_modules, build output, CV model files under ai_core/cv_pipeline/models, MP4 files in normal demo/sample locations, generated audio, and the Firebase service-account JSON.

A fresh clone therefore needs local restoration: copy/create environment files; download YOLO weights; install Python and Node dependencies; obtain demo media if the clone does not contain it; generate TTS audio at runtime; and download Firebase credentials only if push is being tested.

Check media:

~~~powershell
Get-ChildItem .\backend\demo\videos\uploads -File -ErrorAction SilentlyContinue
Get-ChildItem .\ai_core\cv_pipeline\sample_videos -File -ErrorAction SilentlyContinue
~~~

Dashboard presets include surge.mp4, baseline.mp4, static_crowd.mp4, directional_flow.mp4, anomaly.mp4, sparse_walking.mp4, and empty_room.mp4. If one is absent, use dashboard upload or obtain approved media from the project owner. Do not commit sensitive footage.

## 5. Install the shared Python environment

Run from the repository root. The project expects one shared root .venv; setup_python_env.sh is Bash-oriented and is not the Windows setup path.

~~~powershell
Set-Location C:\src\CrowdShield
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
.\.venv\Scripts\python.exe -m pip install ultralytics opencv-python numpy pandas pytest python-socketio requests
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -c "import cv2, fastapi, numpy, ultralytics; print('Python dependencies OK')"
~~~

Ultralytics can install PyTorch and several hundred MB of packages. CPU inference is supported but can be slow.

Download the ignored model:

~~~powershell
.\.venv\Scripts\python.exe -m ai_core.cv_pipeline.models.download_weights
Test-Path .\ai_core\cv_pipeline\models\yolov8n.pt
~~~

## 6. Create and configure environment files

~~~powershell
Copy-Item .\.env.example .\.env
Copy-Item .\backend\.env.example .\backend\.env
Copy-Item .\dashboard\.env.example .\dashboard\.env
notepad .\.env
notepad .\backend\.env
notepad .\dashboard\.env
~~~

For a basic same-machine run, ensure:

~~~text
# root .env or backend/.env
BACKEND_HTTP_URL=http://localhost:8000
BACKEND_WS_URL=ws://localhost:8000/ws/live

# dashboard/.env
VITE_BACKEND_HTTP_URL=http://localhost:8000/api
VITE_BACKEND_WS_URL=ws://localhost:8000/ws/live

# backend/.env
CORS_ORIGINS=http://localhost:3000,http://localhost:5174
~~~

The backend loads root .env and backend/.env; avoid conflicting duplicate values. Keep all real secrets local.

### Manual external-service setup

These actions require account access, browser consoles, or secret downloads:

1. Groq: create a key at https://console.groq.com/keys, set GROQ_API_KEY, and keep GROQ_MODEL=openai/gpt-oss-120b. This is the LLM provider used by the code.
2. Supabase: create a project; copy URL/keys to .env; run backend/app/models/schema.sql in SQL Editor; enable Realtime for crowd_metrics and risk_alerts. Without this, local mock fallback can work but persistence/history is not representative.
3. OpenWeatherMap: create a key and set OPENWEATHERMAP_API_KEY if weather-aware processing is required.
4. Firebase: create a project and Web app, enable Cloud Messaging, generate a Web Push/VAPID key, and download a backend service-account JSON only if FCM delivery is required. The JSON is ignored and must not be committed.

The PWA has no committed env template. Create citizen-pwa/.env.local:

~~~powershell
notepad .\citizen-pwa\.env.local
~~~

Use:

~~~text
VITE_BACKEND_HTTP_URL=http://localhost:8000/api
VITE_BACKEND_WS_URL=ws://localhost:8000/ws/live
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
~~~

Firebase is optional for viewing core PWA screens; push requires valid values, permission, and a secure context.

## 7. Install/build the web clients

~~~powershell
Push-Location .\dashboard
npm.cmd ci
npm.cmd run lint
npm.cmd run build
Pop-Location

Push-Location .\citizen-pwa
npm.cmd ci
npm.cmd run build
Pop-Location
~~~

Use npm.cmd ci inside each app, not at the repository root. Build output and node_modules are ignored.

## 8. Start all services

Use three PowerShell windows. Start the backend from backend; its relative video resolver depends on that working directory.

Window 1 — backend:

~~~powershell
Set-Location C:\src\CrowdShield\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
~~~

Window 2 — dashboard:

~~~powershell
Set-Location C:\src\CrowdShield\dashboard
npm.cmd run dev -- --host 0.0.0.0
~~~

Open http://localhost:3000.

Window 3 — citizen PWA:

~~~powershell
Set-Location C:\src\CrowdShield\citizen-pwa
npm.cmd run dev -- --host 0.0.0.0
~~~

Open http://localhost:5174.

Production-like PWA check:

~~~powershell
Set-Location C:\src\CrowdShield\citizen-pwa
npm.cmd run build
npm.cmd run preview -- --host 0.0.0.0
~~~

Same-machine localhost is normally a secure context. A phone or another PC using LAN HTTP generally needs HTTPS for service workers, geolocation, microphone, and push. Use an approved HTTPS tunnel/certificate manually, add its origin to CORS_ORIGINS, and restart the backend.

## 9. Verify the backend

~~~powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8000/openapi.json | Out-Null
Invoke-RestMethod http://localhost:8000/api/zones
Get-NetTCPConnection -LocalPort 8000,3000,5174 -ErrorAction SilentlyContinue
~~~

Fix /health before investigating a frontend problem.

## 10. Run the pipelines directly

~~~powershell
New-Item -ItemType Directory -Force .\test_results | Out-Null
$video = Resolve-Path .\backend\demo\videos\uploads\empty_room.mp4 -ErrorAction SilentlyContinue
$video
~~~

Run CV then risk:

~~~powershell
.\.venv\Scripts\python.exe .\ai_core\cv_pipeline\scripts\pipeline.py --video $video --zones 2x2 --output .\test_results\local_phase1.json --sample-every-n-frames 3 --mode batch
.\.venv\Scripts\python.exe .\ai_core\risk_engine\scripts\pipeline.py --input .\test_results\local_phase1.json --output .\test_results\local_phase2.json
~~~

Inspect outputs:

~~~powershell
Get-Content .\test_results\local_phase1.json | ConvertFrom-Json | ConvertTo-Json -Depth 8
Get-Content .\test_results\local_phase2.json | ConvertFrom-Json | ConvertTo-Json -Depth 8
~~~

If $video is empty, supply an absolute MP4 path or upload through dashboard. Do not assume ignored sample video exists.

Run GenAI/voice:

~~~powershell
.\.venv\Scripts\python.exe .\ai_core\genai_pipeline\scripts\pipeline.py recommend --input .\ai_core\genai_pipeline\fixtures\phase2_sample_output.json
.\.venv\Scripts\python.exe .\ai_core\genai_pipeline\scripts\pipeline.py summarize --input .\ai_core\genai_pipeline\fixtures\phase2_sample_output.json --zone-id zone_A1
.\.venv\Scripts\python.exe .\ai_core\genai_pipeline\scripts\pipeline.py sentiment
.\.venv\Scripts\python.exe .\ai_core\genai_pipeline\scripts\pipeline.py voice --text "show me zone A1"
.\.venv\Scripts\python.exe .\ai_core\genai_pipeline\scripts\pipeline.py announce --message "Please proceed calmly to Exit B." --langs hi ta te bn mr
~~~

The original five languages are Hindi (hi), Tamil (ta), Telugu (te), Bengali (bn), and Marathi (mr). TTS needs outbound network access; real LLM translations need Groq. Audio is generated into ignored audio_output folders.

## 11. Dashboard end-to-end test

1. Open http://localhost:3000 with the backend running.
2. Grant microphone access for operator voice controls. Also check Windows Settings > Privacy & security > Microphone.
3. Load a preset or upload an MP4. If a preset is missing, use upload or place approved media in backend/demo/videos/uploads.
4. Start Feed Video to AI Backend and verify live metrics, zones, risk state, alerts, and WebSocket updates.
5. Say “navigate to zone A1” or “show zone A1”; confirm the dashboard scrolls to and reveals the requested zone.
6. Enter written public-announcement text in each of the five languages, generate/play audio, and verify the generated file and backend logs. If silent, check TTS network, audio_output, Windows volume, and browser output device.
7. Exercise incident reporting, interventions/signage, analytics, and the 3D view where demo data supports them.

## 12. Citizen PWA test

1. Open http://localhost:5174.
2. Test live alerts, safe-route/map view, reporting, settings, and connection state.
3. Grant location only when appropriate.
4. For push, configure Firebase, use localhost/HTTPS, grant notification permission, and inspect DevTools > Application > Service Workers.
5. For phone testing, use the PC LAN IP through HTTPS/tunneling and add that origin to backend CORS. On a phone, localhost refers to the phone itself.

## 13. Automated tests

~~~powershell
Set-Location C:\src\CrowdShield
.\.venv\Scripts\python.exe -m pytest .\ai_core\genai_pipeline\tests .\ai_core\risk_engine\tests .\backend\tests -q
Push-Location .\dashboard; npm.cmd run lint; npm.cmd run build; Pop-Location
Push-Location .\citizen-pwa; npm.cmd run build; Pop-Location
~~~

Some tests/TTS paths need model files or internet access. Read the first traceback to distinguish a missing prerequisite from an application failure.

## 14. Troubleshooting

| Problem | Resolution |
| --- | --- |
| Python opens Store/wrong version | Use py -3.12 and .venv\\Scripts\\python.exe; disable App execution aliases if needed |
| npm PowerShell policy error | Use npm.cmd or set the user policy in section 2 |
| ModuleNotFoundError: app | Run Uvicorn after changing directory to backend |
| Missing ultralytics/cv2 | Re-run the venv install commands |
| Missing YOLO model | Run the model download command from repo root |
| Video cannot open | Check ignored media, use an absolute path, or upload via dashboard |
| No dashboard live data | Check backend health, CORS, VITE URLs, browser console, and WebSocket |
| PWA permission/service-worker failure | Use localhost or HTTPS; configure Firebase and browser permission |
| Supabase warnings | Fill keys, run schema SQL, and enable the two Realtime tables |
| GenAI fallback | Set Groq key and allow outbound HTTPS |
| Play button but no audio | Inspect generated audio/backend logs, TTS network, and Windows/browser output device |

## 15. Stop and clean

Press Ctrl+C in each service window. Only remove generated directories when you understand they must be recreated:

~~~powershell
Remove-Item -LiteralPath .\.venv -Recurse -Force
Remove-Item -LiteralPath .\dashboard\node_modules -Recurse -Force
Remove-Item -LiteralPath .\citizen-pwa\node_modules -Recurse -Force
~~~

Do not delete local .env files, Firebase keys, or demo media unless backed up; ignored files cannot be recovered from Git.

## 16. Official prerequisite links

* Git for Windows: https://git-scm.com/install/windows
* Python Windows downloads: https://www.python.org/downloads/windows/
* Node.js LTS downloads: https://nodejs.org/en/download

