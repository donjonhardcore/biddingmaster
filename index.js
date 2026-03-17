const http = require('http');

// Render sets the PORT dynamically via environment variables
const PORT = process.env.PORT || 3000;
let logs = [];
const activeClients = new Map(); // Stores { clientId: { ip, lastSeen, logs } }

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

  // Health check route for Render
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200);
    res.end('OK');
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const logEntry = JSON.parse(body);
        logEntry.serverTime = new Date().toISOString();
        logEntry.clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';
        
        // Track the active client
        if (logEntry.clientId) {
          activeClients.set(logEntry.clientId, {
            ip: logEntry.clientIp,
            lastSeen: Date.now()
          });
        }

        // Only add to main logs if it's not just a background "PING"
        if (logEntry.type !== 'PING') {
          logs.push(logEntry);
          if (logs.length > 1000) logs.shift();
          console.log(`[${logEntry.serverTime}] [${logEntry.type || 'INFO'}] Client ID: ${logEntry.clientId || 'Unknown'} - ${logEntry.message}`);
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      } catch (e) {
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
  } 
  else if (req.method === 'GET' && req.url === '/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logs, null, 2));
  }
  else if (req.method === 'GET' && (req.url === '/' || req.url === '/dashboard')) {
    // Clean up inactive clients (not seen in 30 seconds)
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
    .meta { color: #8b949e; font-size: 0.85em; margin-bottom: 8px; display: flex; gap: 15px; }
    pre { margin: 8px 0 0; color: #a5d6ff; background: #010409; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.9em; overflow-x: auto; }
    .btn { padding: 8px 16px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; }
    .btn:hover { background: #2ea043; }
    
    .clients-panel { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 15px; margin-bottom: 25px; }
    .clients-panel h3 { margin: 0 0 10px 0; color: #7ee787; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .client-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .client-badge { background: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 8px 12px; font-size: 13px; }
    .client-badge .id { font-weight: bold; color: #c9d1d9; }
    .client-badge .ip { color: #8b949e; font-size: 11px; margin-top: 3px; }
    .dot { display: inline-block; width: 8px; height: 8px; background: #3fb950; border-radius: 50%; box-shadow: 0 0 8px #3fb950; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1>Bidding Master Dashboard</h1>
      <div style="color: #8b949e; font-size: 14px;">Log Receiver Port: ${PORT}</div>
    </div>
    <button class="btn" onclick="location.reload()">Refresh Dashboard</button>
  </div>
  
  <div class="clients-panel">
    <h3><span class="dot"></span> Active Extensions (${activeClients.size})</h3>
    ${activeClients.size === 0 
      ? '<div style="color: #8b949e; font-size: 14px;">No extensions connected right now. Ensure they are running on the portal.</div>'
      : `<div class="client-list">
          ${Array.from(activeClients.entries()).map(([id, data]) => `
            <div class="client-badge">
              <div class="id">🖥️ ${id}</div>
              <div class="ip">${data.ip}</div>
            </div>
          `).join('')}
         </div>`
    }
  </div>
  
  <h3 style="color: #c9d1d9; margin-bottom: 15px;">Recent Event Logs</h3>
  <div id="logs-container">
    ${logs.length === 0 ? '<p style="color:#8b949e; font-style: italic;">Awaiting detection events...</p>' : ''}
    ${logs.slice().reverse().map(l => `
      <div class="log-entry ${l.type ? l.type.toLowerCase() : ''}">
        <div class="meta">
          <span>🕒 ${new Date(l.serverTime).toLocaleTimeString()}</span>
          <span>🖥️ ${l.clientId || 'Unknown'}</span>
          <span>🏷️ ${l.type || 'INFO'}</span>
        </div>
        <div style="font-weight:600; font-size:15px; color: ${l.type === 'DETECT' ? '#ff7b72' : '#c9d1d9'}">${l.message}</div>
        ${l.data ? `<pre>${JSON.stringify(l.data, null, 2)}</pre>` : ''}
      </div>
    `).join('')}
  </div>
  <script>setInterval(() => location.reload(), 5000);</script>
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
  console.log(`Backend Server running on port ${PORT}`);
});
