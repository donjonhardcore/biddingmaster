# 📊 Bidding Master — Telemetry Backend

This Node.js server acts as the central "God-Mode" dashboard for the bidding ecosystem. It is designed to run on **Render.com** and provide a real-time feed of all extension activity.

## 📁 Key Files
- **`index.js`**: The main server logic. Handles:
    - Log ingestion from multiple extension clients.
    - Real-time dashboard rendering.
    - Endpoint: `POST /log` (Ingests JSON logs).
    - Endpoint: `GET /` (Displays the dashboard).
    - Endpoint: `GET /logs` (Returns raw JSON logs for analysis).
- **`package.json`**: Project dependencies (Primary: `express`, `ejs`, `body-parser`).

## 📡 Features
1. **Real-time Log Aggregation**: Collects detections, network timing, and selective clicks from all connected clients.
2. **Timing Analysis**: Automatically compares the time an API response was received vs. when the DOM was actually updated.
3. **Connectivity Tracking**: Monitors heartbeat "pings" from extensions to ensure the bot is alive and connected before a bid starts.
4. **Persistent History**: Keeps a rolling buffer of logs to allow for "post-mortem" analysis after a bidding session ends.

## ☁️ Deployment (Render.com)
1. Hosted at: `https://biddingmaster.onrender.com`
2. Environment: Node.js (Web Service).
3. Build Command: `npm install`
4. Start Command: `node index.js`

## 🛡 Security
- No user credentials (passwords/tokens) are ever sent to this server.
- The server only tracks **public page events** and **telemetry timing**.

---
**Note:** To clear historical logs for a new session, you can restart the Render service or use the `/clear` development endpoint (if enabled).
