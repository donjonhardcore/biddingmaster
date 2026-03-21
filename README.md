# 📊 Bidding Master — Telemetry Backend (v2.1)

Central monitoring dashboard and log receiver for the Bidding Master extension ecosystem. Deployed on **Render.com**.

## 📁 Key Files
- **`index.js`**: Server logic (pure Node.js `http` module, no frameworks). Handles:
    - Log ingestion from multiple extension clients
    - XSS-safe real-time dashboard rendering
    - File-based persistent logging with daily rotation
    - Active client tracking with 30s heartbeat timeout
- **`package.json`**: Project config (zero external dependencies).
- **`data/`**: Log storage directory (auto-created, git-ignored).

## 📡 API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/log` | Ingest a JSON log entry from an extension |
| `GET` | `/` or `/dashboard` | HTML dashboard with stats, date picker, logs |
| `GET` | `/dashboard?date=YYYY-MM-DD` | View historical logs for a specific date |
| `GET` | `/logs` | Today's raw JSON logs |
| `GET` | `/logs/YYYY-MM-DD` | Historical logs for a specific date (JSON) |
| `GET` | `/dates` | List of all dates with stored logs |
| `GET` | `/clear` | Clear today's logs |
| `GET` | `/healthz` | Health check for Render uptime |

## 🔒 Security
- **XSS Protection**: All user-controlled fields (clientId, message, data) are HTML-escaped before rendering on the dashboard.
- **No credentials logged**: Only tracks page events, timing, and telemetry.
- **Client IP**: Reads `X-Forwarded-For` header for real client IP behind Render's proxy.

## 💾 Persistence
- Logs saved to `data/logs-YYYY-MM-DD.json` daily files.
- Loaded from disk on server startup — survives restarts and sleep.
- ⚠️ Files are wiped on **new deploys** (Render free tier has ephemeral disk).

## ☁️ Deployment (Render.com)
- **URL**: https://biddingmaster.onrender.com
- **Repo**: https://github.com/donjonhardcore/biddingmaster
- **Build Command**: `npm install`
- **Start Command**: `node index.js`
- Auto-deploys on push to `main` branch.
