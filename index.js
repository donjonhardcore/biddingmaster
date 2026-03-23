const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Config ──
const PORT = process.env.PORT || 3000;
const LOG_DIR = path.join(__dirname, 'data');
const MAX_LOGS_PER_DAY = 5000;

// ── State ──
let logs = [];
const activeClients = new Map();

// ── HTML Escape (XSS prevention) ──
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ════════════════════════════════════════════════════════════
// FILE-BASED PERSISTENT LOGGING
// ════════════════════════════════════════════════════════════

function getDateStr(date) {
  return (date || new Date()).toISOString().split('T')[0]; // "2026-03-21"
}

function getLogFilePath(dateStr) {
  return path.join(LOG_DIR, `logs-${dateStr || getDateStr()}.json`);
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log(`📁 Created log directory: ${LOG_DIR}`);
  }
}

function loadLogsFromDisk() {
  ensureLogDir();
  const today = getDateStr();
  const filePath = getLogFilePath(today);
  
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      logs = JSON.parse(data);
      console.log(`📂 Loaded ${logs.length} logs from ${filePath}`);
    } catch (e) {
      console.error('⚠️ Could not parse log file, starting fresh:', e.message);
      logs = [];
    }
  } else {
    logs = [];
    console.log(`📝 No log file for today (${today}), starting fresh.`);
  }
}

function saveLogsToDisk() {
  ensureLogDir();
  const today = getDateStr();
  const filePath = getLogFilePath(today);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (e) {
    console.error('⚠️ Could not save logs to disk:', e.message);
  }
}

function loadLogsForDate(dateStr) {
  const filePath = getLogFilePath(dateStr);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function getAvailableLogDates() {
  ensureLogDir();
  try {
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('logs-') && f.endsWith('.json'))
      .map(f => f.replace('logs-', '').replace('.json', ''))
      .sort()
      .reverse();
  } catch (e) {
    return [];
  }
}

// ── Load existing logs on startup ──
loadLogsFromDisk();

// ════════════════════════════════════════════════════════════
// HTTP SERVER
// ════════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Bypass-Tunnel-Reminder');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200);
    res.end('OK');
    return;
  }

  // ── POST /log — Ingest a log entry ──
  if (req.method === 'POST' && req.url === '/log') {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== 'SUPER_SECRET_TOKEN_4829') {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const logEntry = JSON.parse(body);
        logEntry.serverTime = new Date().toISOString();
        logEntry.clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'Unknown';
        
        // Track active client
        if (logEntry.clientId) {
          activeClients.set(logEntry.clientId, {
            ip: logEntry.clientIp,
            lastSeen: Date.now()
          });
        }

        // Only add real events to logs (not PINGs)
        if (logEntry.type !== 'PING') {
          logs.push(logEntry);
          if (logs.length > MAX_LOGS_PER_DAY) logs.shift();
          
          // ★ PERSIST TO DISK ★
          saveLogsToDisk();
          
          console.log(`[${logEntry.serverTime}] [${logEntry.type || 'INFO'}] Client: ${logEntry.clientId || '?'} - ${logEntry.message}`);
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      } catch (e) {
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
  }

  // ── GET /config — Remote Configuration ──
  else if (req.method === 'GET' && req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      OPEN_INDENT_TABLE_SELECTORS: ['table.eloi-table', 'table.ethanol-cms-table', 'table[class*="eloi"]', 'table[class*="ethanol"]'],
      ROW_SELECTOR: 'tbody tr',
      CHECKBOX_SELECTOR: 'label.container-checkbox input[type="checkbox"], input[type="checkbox"]',
      SELECT_LINK_SELECTOR: 'td.iconContain a, td[class*="iconContain"] a',
      STATUS_AVAILABLE: ['available'],
      STATUS_SKIP: ['closed', 'expired', 'allocated', 'completed', 'unavailable', 'dispatched', 'in transit', 'delivered', 'cancelled', 'accepted', 'applied', 'rejected'],
      MODAL_SELECTORS: ['.modal', '[class*="modal"]', '[class*="Modal"]', '[role="dialog"]', '.modal-dialog', '.modal-content', '[class*="popup"]', '[class*="Popup"]'],
      PO_DROPDOWN_SELECTORS: ['select.select-input', 'select#terminal', 'select', '[class*="dropdown"]', '[class*="Dropdown"]', '[class*="select"]', '[class*="Select"]'],
      APPLY_BUTTON_KEYWORDS: ['apply', 'submit', 'confirm', 'save', 'ok']
    }));
  }

  // ── GET /logs — Today's logs as JSON ──
  else if (req.method === 'GET' && req.url === '/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logs, null, 2));
  }

  // ── GET /logs/YYYY-MM-DD — Historical logs for a specific date ──
  else if (req.method === 'GET' && req.url.match(/^\/logs\/\d{4}-\d{2}-\d{2}$/)) {
    const dateStr = req.url.split('/logs/')[1];
    const dateLogs = loadLogsForDate(dateStr);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dateLogs, null, 2));
  }

  // ── GET /dates — List available log dates ──
  else if (req.method === 'GET' && req.url === '/dates') {
    const dates = getAvailableLogDates();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dates));
  }

  // ── GET /clear — Clear today's logs ──
  else if (req.method === 'GET' && req.url === '/clear') {
    logs = [];
    saveLogsToDisk();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'cleared', date: getDateStr() }));
  }

  // ── GET / or /dashboard — Main dashboard ──
  else if (req.method === 'GET' && (req.url === '/' || req.url === '/dashboard' || req.url.startsWith('/dashboard?'))) {
    // Parse date query parameter
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const viewDate = urlObj.searchParams.get('date') || getDateStr();
    const viewLogs = viewDate === getDateStr() ? logs : loadLogsForDate(viewDate);
    const availableDates = getAvailableLogDates();

    // Clean up stale clients (not seen in 30s)
    const now = Date.now();
    for (const [id, data] of activeClients.entries()) {
      if (now - data.lastSeen > 30000) activeClients.delete(id);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bidding Master - Central Logs</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; line-height: 1.5; }
    h1 { color: #58a6ff; margin-bottom: 5px; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; padding-bottom: 15px; margin-bottom: 20px; }
    .log-entry { margin-bottom: 15px; padding: 12px; background: #161b22; border-left: 4px solid #58a6ff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    .log-entry.error, .log-entry.detect { border-left-color: #f85149; background: rgba(248,81,73,0.05); }
    .log-entry.warn { border-left-color: #d29922; }
    .meta { color: #8b949e; font-size: 0.85em; margin-bottom: 8px; display: flex; gap: 15px; flex-wrap: wrap; }
    pre { margin: 8px 0 0; color: #a5d6ff; background: #010409; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.9em; overflow-x: auto; }
    .btn { padding: 8px 16px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; text-decoration: none; display: inline-block; }
    .btn:hover { background: #2ea043; }
    .btn-sm { padding: 5px 12px; font-size: 12px; }
    .btn-outline { background: transparent; border: 1px solid #30363d; color: #c9d1d9; }
    .btn-outline:hover { background: #21262d; border-color: #8b949e; }
    .btn-outline.active { background: #1f6feb; border-color: #1f6feb; color: white; }
    .btn-danger { background: #da3633; }
    .btn-danger:hover { background: #f85149; }

    .clients-panel { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 15px; margin-bottom: 20px; }
    .clients-panel h3 { margin: 0 0 10px 0; color: #7ee787; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .client-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .client-badge { background: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 8px 12px; font-size: 13px; }
    .client-badge .id { font-weight: bold; color: #c9d1d9; }
    .client-badge .ip { color: #8b949e; font-size: 11px; margin-top: 3px; }
    .dot { display: inline-block; width: 8px; height: 8px; background: #3fb950; border-radius: 50%; box-shadow: 0 0 8px #3fb950; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

    .date-panel { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 15px; margin-bottom: 20px; }
    .date-panel h3 { margin: 0 0 10px 0; color: #58a6ff; font-size: 16px; }
    .date-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .stats-row { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 18px; min-width: 120px; }
    .stat-card .val { font-size: 24px; font-weight: bold; color: #58a6ff; }
    .stat-card .lbl { font-size: 11px; color: #8b949e; text-transform: uppercase; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1>Bidding Master Dashboard</h1>
      <div style="color: #8b949e; font-size: 14px;">
        📅 Viewing: <strong style="color: #58a6ff;">${viewDate}</strong>
        ${viewDate === getDateStr() ? ' (Today — Live)' : ' (Historical)'}
        &nbsp;|&nbsp; Port: ${PORT}
      </div>
    </div>
    <div style="display: flex; gap: 8px;">
      <a href="/" class="btn btn-sm">🔄 Refresh</a>
      <a href="/clear" class="btn btn-sm btn-danger" onclick="return confirm('Clear all logs for today?')">🗑️ Clear Today</a>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="val">${viewLogs.length}</div>
      <div class="lbl">Log Entries</div>
    </div>
    <div class="stat-card">
      <div class="val">${viewLogs.filter(l => l.type === 'DETECT').length}</div>
      <div class="lbl">🚨 Detections</div>
    </div>
    <div class="stat-card">
      <div class="val">${activeClients.size}</div>
      <div class="lbl">🖥️ Active Now</div>
    </div>
    <div class="stat-card">
      <div class="val">${availableDates.length}</div>
      <div class="lbl">📁 Days Stored</div>
    </div>
  </div>

  <!-- Date Selector -->
  <div class="date-panel">
    <h3>📅 Log History</h3>
    <div class="date-links">
      ${availableDates.length === 0
        ? '<span style="color: #8b949e;">No historical logs yet. Logs will appear here after the first detection.</span>'
        : availableDates.map(d => `
          <a href="/dashboard?date=${d}" class="btn btn-sm btn-outline ${d === viewDate ? 'active' : ''}">${d}${d === getDateStr() ? ' (Today)' : ''}</a>
        `).join('')}
    </div>
  </div>

  <!-- Active Clients -->
  <div class="clients-panel">
    <h3><span class="dot"></span> Active Extensions (${activeClients.size})</h3>
    ${activeClients.size === 0
      ? '<div style="color: #8b949e; font-size: 14px;">No extensions connected. Ensure Bidding Master is running on the portal.</div>'
      : `<div class="client-list">
          ${Array.from(activeClients.entries()).map(([id, data]) => `
            <div class="client-badge">
              <div class="id">🖥️ ${escHtml(id)}</div>
              <div class="ip">${escHtml(data.ip)}</div>
            </div>
          `).join('')}
        </div>`}
  </div>

  <!-- Logs -->
  <h3 style="color: #c9d1d9; margin-bottom: 15px;">
    ${viewDate === getDateStr() ? '📡 Recent Event Logs' : '📜 Logs for ' + viewDate}
    <span style="color: #8b949e; font-size: 14px; font-weight: normal;"> (${viewLogs.length} entries)</span>
  </h3>
  <div id="logs-container">
    ${viewLogs.length === 0 ? '<p style="color:#8b949e; font-style: italic;">No logs for this date.</p>' : ''}
    ${viewLogs.slice().reverse().map(l => `
      <div class="log-entry ${escHtml(l.type ? l.type.toLowerCase() : '')}">
        <div class="meta">
          <span>🕒 ${l.serverTime ? new Date(l.serverTime).toLocaleTimeString() : '?'}</span>
          <span>🖥️ ${escHtml(l.clientId || 'Unknown')}</span>
          <span>🏷️ ${escHtml(l.type || 'INFO')}</span>
        </div>
        <div style="font-weight:600; font-size:15px; color: ${l.type === 'DETECT' ? '#ff7b72' : '#c9d1d9'}">${escHtml(l.message || '')}</div>
        ${l.data ? `<pre>${escHtml(JSON.stringify(l.data, null, 2))}</pre>` : ''}
      </div>
    `).join('')}
  </div>

  <script>
    // Auto-refresh only on today's view
    ${viewDate === getDateStr() ? 'setInterval(() => location.reload(), 5000);' : ''}
  </script>
</body>
</html>
    `);
  }
  else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log('======================================================');
  console.log('| 🚀 Bidding Master Backend v2.1 — Persistent Logs  |');
  console.log(`| 📡 Port: ${PORT}                                     |`);
  console.log(`| 📁 Log Dir: ${LOG_DIR}`);
  console.log(`| 📅 Today: ${getDateStr()}                            |`);
  console.log('| 📊 Dashboard: /                                    |');
  console.log('| 📜 API: /logs, /logs/YYYY-MM-DD, /dates, /clear   |');
  console.log('======================================================');
});
