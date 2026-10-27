'use strict';
// Đường dẫn: glowe/gateway/index.js
// API GATEWAY (chạy trên máy) — cổng vào duy nhất: phục vụ giao diện web + định tuyến /api/* tới từng service.
// Trên Vercel, vai trò này do api/index.js đảm nhận.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { config, ROUTES } = require('../shared/lib');

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

async function health(res) {
  const checks = await Promise.all(Object.keys(config.services).filter((s) => s !== 'gateway').map(async (s) => {
    try {
      const r = await fetch(`http://127.0.0.1:${config.services[s]}/health`, { signal: AbortSignal.timeout(1500) });
      return [s, r.ok ? 'UP' : 'DOWN'];
    } catch { return [s, 'DOWN']; }
  }));
  const services = Object.fromEntries(checks);
  json(res, Object.values(services).every((v) => v === 'UP') ? 200 : 503, { gateway: 'UP', services });
}

function proxy(req, res, service) {
  const headers = { ...req.headers };
  delete headers['x-internal-key']; // client không được giả làm service nội bộ
  delete headers.host;
  const upstream = http.request(
    { host: '127.0.0.1', port: config.services[service], method: req.method, path: req.url.slice(4), headers },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
  );
  upstream.on('error', () => { if (!res.headersSent) json(res, 503, { error: `Dịch vụ ${service} tạm thời không phản hồi` }); });
  req.pipe(upstream);
}

function serveStatic(req, res, pathname) {
  let file;
  try { file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : decodeURIComponent(pathname))); }
  catch { return json(res, 400, { error: 'URL không hợp lệ' }); }
  if (!file.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Không được phép' });
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Không tìm thấy' });
    res.writeHead(200, { 'Content-Type': `${MIME[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    res.end(data);
  });
}

const port = config.services.gateway;
http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
  const seg = pathname.split('/')[2];
  if (seg === 'health') return health(res);
  const service = ROUTES[seg];
  if (!service) return json(res, 404, { error: 'Không tìm thấy API' });
  proxy(req, res, service);
}).listen(port, () => {
  console.log(`[gateway] mở trình duyệt: http://localhost:${port}`);
  // Địa chỉ cho điện thoại cùng Wi-Fi
  for (const ifs of Object.values(os.networkInterfaces()))
    for (const i of ifs ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`[gateway] trong mạng LAN: http://${i.address}:${port}`);
});
