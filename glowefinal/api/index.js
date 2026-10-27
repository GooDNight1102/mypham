'use strict';
// Đường dẫn: glowe/api/index.js
// API GATEWAY trên VERCEL (serverless). Mọi request /api/* được vercel.json chuyển về đây.
// Nạp cả 4 service vào cùng 1 hàm: gateway gọi service, service gọi nhau trực tiếp trong bộ nhớ (không qua mạng).
// Mỗi service vẫn tách code + schema CSDL riêng như khi chạy microservices trên máy.
const { registry, ROUTES, readBody } = require('../shared/lib');
const { explainDbError, hasUrl } = require('../shared/db');
const { setup } = require('../setup');
require('../services/user');
require('../services/product');
require('../services/order');
require('../services/payment');
require('../services/assistant');

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};

// Lần đầu hàm chạy: tự tạo bảng + dữ liệu mẫu nếu Supabase còn trống (không cần chạy npm run setup từ máy).
// Lỗi thì lần request sau thử lại.
let ready = null;
const ensureReady = () => (ready ??= setup({ quiet: true }).catch((e) => { ready = null; throw e; }));

module.exports = async (req, res) => {
  // vercel.json: /api/:path* -> /api/index?__p=:path*  (giữ nguyên các tham số query khác)
  const u = new URL(req.url, 'http://localhost');
  const p = u.searchParams.get('__p');
  u.searchParams.delete('__p');
  const pathname = p != null ? '/' + p.replace(/^\/+/, '') : u.pathname.replace(/^\/api/, '');
  const url = pathname + (u.search || '');
  const seg = pathname.split('/')[1];

  try {
    await ensureReady();
  } catch (e) {
    console.error('[api] không kết nối/khởi tạo được CSDL:', e);
    // /api/health luôn trả 200 để mở bằng trình duyệt đọc được hướng dẫn
    return send(res, seg === 'health' ? 200 : 503, {
      gateway: 'UP', database: 'ERROR', hasDatabaseUrl: hasUrl, ...explainDbError(e),
    });
  }

  if (seg === 'health') {
    return send(res, 200, { gateway: 'UP', database: 'UP', services: Object.fromEntries(Object.keys(registry).map((s) => [s, 'UP'])) });
  }
  const svc = ROUTES[seg];
  if (!svc) return send(res, 404, { error: 'Không tìm thấy API' });

  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    try {
      // Vercel thường đã đọc sẵn body JSON vào req.body; chạy nơi khác thì tự đọc
      body = req.body !== undefined ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) : await readBody(req);
    } catch {
      return send(res, 400, { error: 'JSON không hợp lệ' });
    }
  }
  const headers = { ...req.headers };
  delete headers['x-internal-key']; // client không được giả làm service nội bộ
  const out = await registry[svc]({ method: req.method, url, headers, body });
  send(res, out.status, out.data);
};
