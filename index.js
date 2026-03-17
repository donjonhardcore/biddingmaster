const http = require('http');

// Render sets the PORT dynamically via environment variables
const PORT = process.env.PORT || 3000;
let logs = [];

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
        logEntry.clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'];
        
        logs.push(logEntry);
        if (logs.length > 1000) logs.shift();

        console.log(`[${logEntry.serverTime}] [${logEntry.type || 'INFO'}] Client ID: ${logEntry.clientId || 'Unknown'} - ${logEntry.message}`);
        
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
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Bidding Master - Central Logs</title>
  <style>
    body { font-family: monospace; background: #121212; color: #e0e0e0; padding: 20px; }
    h1 { color: #58a6ff; }
    .log-entry { margin-bottom: 15px; padding: 10px; background: #1e1e1e; border-left: 4px solid #58a6ff; border-radius: 4px; }
    .log-entry.error, .log-entry.detect { border-left-color: #ff5252; }
    .log-entry.warn { border-left-color: #ffb74d; }
    .meta { color: #888; font-size: 0.9em; margin-bottom: 5px; }
    pre { margin: 5px 0 0; color: #a5d6ff; background: #000; padding: 8px; border-radius: 4px; }
    .btn { padding: 8px 16px; background: #238636; color: white; border: none; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <h1>Central Log Dashboard</h1>
    <button class="btn" onclick="location.reload()">Refresh Logs</button>
  </div>
  <p>Status: Listening for extension connections on port ${PORT}</p>
  <hr style="border-color:#333; margin: 20px 0;">
  
  <div id="logs-container">
    ${logs.length === 0 ? '<p style="color:#888;">No logs received yet. Waiting for extension...</p>' : ''}
    ${logs.slice().reverse().map(l => `
      <div class="log-entry ${l.type ? l.type.toLowerCase() : ''}">
        <div class="meta">[Server: ${new Date(l.serverTime).toLocaleTimeString()}] | Client IP: ${l.clientIp || 'Unknown'} | PC/Client ID: <b>${l.clientId || 'Unknown'}</b> | Type: ${l.type || 'INFO'}</div>
        <div style="font-weight:bold; font-size:1.1em;">${l.message}</div>
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
