'use strict';
// Đường dẫn: glowe/shared/lib.js
// Thư viện dùng chung cho mọi service: router, token, gọi service khác.
// Mỗi service khai báo routes 1 lần, chạy được theo 2 cách:
//   - Trên máy (npm start): mỗi service là 1 tiến trình HTTP riêng (microservices thật)
//   - Trên Vercel (serverless): api/index.js nạp cả 4 service vào 1 hàm, gọi nhau trực tiếp trong bộ nhớ
const http = require('node:http');
const crypto = require('node:crypto');
const config = require('../config.json');

const SECRET = process.env.APP_SECRET || config.secret;
const TOKEN_TTL = 7 * 24 * 3600; // 7 ngày (giây)

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Mật khẩu: scrypt "salt:hash" — dùng chung cho User Service và seed.js
const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  return !!hash && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(pw, salt, 64));
}

// ---------- Token ký HMAC (cấu trúc giống JWT, gọn hơn) ----------
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const safeEqual = (a, b) =>
  typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL })).toString('base64url');
  return `${body}.${hmac(body)}`;
}

function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !safeEqual(sig, hmac(body))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() / 1000 ? p : null;
}

// Trả về { sub, name, role } từ token
function requireUser(req) {
  const user = verifyToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!user) throw new HttpError(401, 'Bạn cần đăng nhập');
  return user;
}

function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== 'admin') throw new HttpError(403, 'Chỉ quản trị viên được thực hiện');
  return user;
}

// Lời gọi nội bộ giữa các service. Gateway luôn xoá header này khỏi request từ bên ngoài.
const isInternal = (req) => safeEqual(req.headers['x-internal-key'], SECRET);
function requireInternal(req) {
  if (!isInternal(req)) throw new HttpError(403, 'Chỉ dành cho service nội bộ');
}

// ---------- Router: dùng chung cho HTTP server (local) và gọi trực tiếp (Vercel) ----------
const registry = {}; // tên service -> hàm xử lý (chỉ chứa service nạp trong cùng tiến trình)

// routes: [[METHOD, '/path/:param', handler(ctx)]]; handler trả về dữ liệu JSON, có thể đặt ctx.status
// Route khớp theo thứ tự khai báo -> đặt '/orders/all' trước '/orders/:id'
function makeRouter(name, routes) {
  const table = [['GET', '/health', () => ({ service: name, status: 'UP' })], ...routes].map(([method, pattern, handler]) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    return { method, re, keys, handler };
  });
  // { method, url: '/path?query', headers, body } -> { status, data }
  return async ({ method, url, headers, body }) => {
    const u = new URL(url, 'http://localhost');
    const ctx = { req: { headers }, query: u.searchParams, params: {}, body: body ?? {}, status: 200 };
    try {
      const route = table.find((r) => r.method === method && r.re.test(u.pathname));
      if (!route) throw new HttpError(404, 'Không tìm thấy API');
      const m = u.pathname.match(route.re);
      route.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
      const data = await route.handler(ctx);
      return { status: ctx.status, data: data ?? {} };
    } catch (e) {
      if (!e.status) console.error(`[${name}]`, e);
      return { status: e.status || 500, data: { error: e.status ? e.message : 'Lỗi hệ thống' } };
    }
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) { reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new HttpError(400, 'JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

// Khai báo service. mod = `module` của file service: chạy trực tiếp (node services/x) thì mở cổng HTTP riêng.
function service(name, routes, mod) {
  const handle = registry[name] = makeRouter(name, routes);
  if (require.main !== mod) return handle;
  const port = config.services[name];
  http.createServer(async (req, res) => {
    const t0 = Date.now();
    let out;
    try {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      out = await handle({ method: req.method, url: req.url, headers: req.headers, body });
    } catch (e) {
      out = { status: e.status || 400, data: { error: e.message } };
    }
    res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(out.data));
    console.log(`[${name}] ${req.method} ${req.url.split('?')[0]} ${out.status} ${Date.now() - t0}ms`);
  }).listen(port, '127.0.0.1', () => console.log(`[${name}] chạy tại http://127.0.0.1:${port}`));
  return handle;
}

// Gọi service khác. Cùng tiến trình (Vercel) -> gọi thẳng; khác tiến trình (local) -> HTTP.
// Lỗi của service đích được chuyển tiếp nguyên mã.
async function call(svc, method, pathname, { body, token, internal } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (internal) headers['x-internal-key'] = SECRET;
  let status, data;
  if (registry[svc]) {
    ({ status, data } = await registry[svc]({ method, url: pathname, headers, body: body && JSON.parse(JSON.stringify(body)) }));
  } else {
    let res;
    try {
      res = await fetch(`http://127.0.0.1:${config.services[svc]}${pathname}`, {
        method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new HttpError(503, `Dịch vụ ${svc} tạm thời không phản hồi`);
    }
    status = res.status;
    data = await res.json().catch(() => ({}));
  }
  if (status >= 400) throw new HttpError(status, data.error || `Lỗi từ dịch vụ ${svc}`);
  return data;
}

// Gateway: phần đầu của /api/<phần>/... -> service phụ trách (dùng ở gateway/index.js và api/index.js)
const ROUTES = { users: 'user', products: 'product', categories: 'product', brands: 'product', orders: 'order', vouchers: 'order', payments: 'payment', assistant: 'assistant' };

const toInt = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const PHONE = /^0\d{9}$/;

module.exports = {
  config, HttpError, hashPassword, checkPassword, signToken, requireUser, requireAdmin,
  isInternal, requireInternal, service, call, readBody, registry, ROUTES, toInt, str, PHONE,
};
