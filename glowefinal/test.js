'use strict';
// Kiểm thử end-to-end qua Gateway, trên schema riêng glowe_test_* (không đụng dữ liệu thật):
//   npm test                    -> chạy kiểu microservices (5 tiến trình, như npm start)
//   npm test -- --serverless    -> chạy kiểu Vercel (api/index.js, 4 service trong 1 hàm)
// Lưu ý: tắt `npm start` trước khi chạy vì dùng chung cổng 3000.
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const { simulatePayment } = require('./services/payment/simulate');

process.env.DB_PREFIX = 'glowe_test';
delete process.env.ANTHROPIC_API_KEY; // test trợ lý ở chế độ bộ luật (không gọi AI ngoài)
process.env.NO_SEED = '1'; // test cần dữ liệu sạch: chỉ có admin + khach mẫu
const SERVERLESS = process.argv.includes('--serverless');
const BASE = 'http://localhost:3000/api';

// Tạo lại schema test từ đầu
const r = spawnSync(process.execPath, ['--no-warnings', path.join(__dirname, 'setup.js'), '--reset'], { stdio: 'inherit', env: process.env });
if (r.status !== 0) process.exit(1);
const { sql, schemaName } = require('./shared/db');

let sys, server;
if (SERVERLESS) {
  // Giả lập Vercel: rewrite /api/:path* -> /api/index?__p=:path*
  const handler = require('./api/index.js');
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (!u.pathname.startsWith('/api/')) { res.statusCode = 404; return res.end(); }
    u.searchParams.set('__p', u.pathname.slice(5));
    req.url = '/api/index?' + u.searchParams;
    handler(req, res);
  }).listen(3000);
} else {
  sys = spawn(process.execPath, ['--no-warnings', path.join(__dirname, 'start.js')], { stdio: 'ignore', env: process.env });
}

async function cleanup() {
  sys?.kill();
  server?.close();
  for (const svc of ['user', 'product', 'order', 'payment']) await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName(svc)}" CASCADE`);
  await sql.end();
  process.exit(process.exitCode || 0);
}

async function api(p, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(BASE + p, {
    method, body: body && JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
  });
  return { status: res.status, data: await res.json() };
}

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { if ((await api('/health')).status === 200) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Hệ thống không khởi động được');
}

const ok = (name) => console.log('  ✔', name);
const card = (n, o = {}) => ({ cardNumber: n, holder: 'NGUYEN THU HA', expiry: '12/30', cvv: '123', ...o });

(async () => {
  // 1. Logic thanh toán giả lập (không cần server)
  const now = new Date(2026, 9, 20);
  assert.ok(simulatePayment('card', card('4111 1111 1111 1111'), now).ok);
  assert.equal(simulatePayment('card', card('4111111111111111'), now).last4, '1111');
  assert.match(simulatePayment('card', card('4000000000000002'), now).message, /từ chối/);
  assert.match(simulatePayment('card', card('4000000000009995'), now).message, /không đủ/);
  assert.match(simulatePayment('card', card('4111111111111111', { expiry: '09/26' }), now).message, /hết hạn/);
  assert.ok(simulatePayment('card', card('4111111111111111', { expiry: '10/26' }), now).ok);
  assert.match(simulatePayment('card', card('4111111111111112'), now).message, /không hợp lệ/);
  assert.ok(simulatePayment('ewallet', { walletPhone: '0912345678' }).ok);
  assert.equal(simulatePayment('ewallet', { walletPhone: '0912340000' }).ok, false);
  ok('Thanh toán giả lập: Luhn, thẻ test, hạn dùng, ví');

  await waitUp();
  ok(SERVERLESS ? 'Chế độ Vercel: 4 service chạy trong 1 hàm (api/index.js)' : '6 tiến trình chạy (gateway + user, product, order, payment, assistant)');

  // 2. Người dùng
  const reg = await api('/users/register', { method: 'POST', body: { fullName: 'Lê Mai', email: 'mai@test.vn', phone: '0987654321', password: '123456' } });
  assert.equal(reg.status, 201);
  const T = reg.data.token;
  assert.equal((await api('/users/register', { method: 'POST', body: { fullName: 'X Y', email: 'MAI@test.vn', phone: '0987654321', password: '123456' } })).status, 409);
  assert.equal((await api('/users/login', { method: 'POST', body: { email: 'mai@test.vn', password: 'sai' } })).status, 401);
  assert.equal((await api('/users/me', { token: 'gia.mao' })).status, 401);
  const A = (await api('/users/login', { method: 'POST', body: { email: 'admin@glowe.vn', password: 'Admin@123' } })).data.token;
  assert.equal((await api('/users', { token: T })).status, 403);
  ok('Đăng ký, trùng email, sai mật khẩu, token giả, phân quyền');

  // 3. Mỹ phẩm
  const all = (await api('/products')).data;
  assert.equal(all.length, 17);
  assert.ok((await api('/products?q=kem chong nang')).data.some((p) => p.name.includes('chống nắng')));
  assert.equal((await api('/products?category=nuoc-hoa')).data.length, 2);
  assert.equal((await api('/products?all=1')).status, 401);
  ok('Danh sách, tìm không dấu, lọc danh mục');

  // 4. Đơn hàng + thanh toán thẻ
  const stockBefore = (await api('/products/1')).data.stock;
  const order = { receiverName: 'Mai', phone: '0987654321', address: 'Hà Nội', paymentMethod: 'card' };
  const o1 = await api('/orders', { method: 'POST', token: T, body: { ...order, items: [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 1, price: 1 }] } });
  assert.equal(o1.status, 201);
  assert.equal(o1.data.total, 289000 * 3); // giá thật, gộp dòng trùng, miễn ship ≥ 500k
  assert.equal((await api('/products/1')).data.stock, stockBefore - 3);
  assert.equal((await api('/orders', { method: 'POST', token: T, body: { ...order, items: [{ productId: 9, quantity: 50 }] } })).status, 409);
  assert.equal((await api('/orders', { method: 'POST', body: { ...order, items: [{ productId: 1, quantity: 1 }] } })).status, 401);
  ok('Tạo đơn: giá từ Product Service, giữ kho, hết hàng, chưa đăng nhập');

  const id1 = o1.data.id;
  assert.equal((await api('/payments', { method: 'POST', token: T, body: { orderId: id1, ...card('4000000000000002') } })).status, 402);
  assert.equal((await api(`/orders/${id1}`, { token: T })).data.paymentStatus, 'failed');
  const paid = await api('/payments', { method: 'POST', token: T, body: { orderId: id1, ...card('4111111111111111') } });
  assert.equal(paid.status, 200);
  assert.equal((await api('/payments', { method: 'POST', token: T, body: { orderId: id1, ...card('4111111111111111') } })).status, 409);
  let o = (await api(`/orders/${id1}`, { token: T })).data;
  assert.deepEqual([o.status, o.paymentStatus], ['confirmed', 'paid']);
  assert.equal((await api(`/payments?orderId=${id1}`, { token: T })).data.length, 2);
  ok('Thẻ bị từ chối → thanh toán lại thành công → chặn trả 2 lần');

  // 5. Bảo mật: không giả được lời gọi nội bộ, không xem đơn người khác
  assert.equal((await api(`/orders/${id1}/payment-result`, { method: 'POST', body: { ok: true }, headers: { 'X-Internal-Key': 'doi-chuoi-nay-khi-trien-khai-that' } })).status, 403);
  const K = (await api('/users/login', { method: 'POST', body: { email: 'khach@glowe.vn', password: 'Khach@123' } })).data.token;
  assert.equal((await api(`/orders/${id1}`, { token: K })).status, 404);
  assert.equal((await api(`/payments?orderId=${id1}`, { token: K })).data.length, 0);
  ok('Gateway chặn header nội bộ, khách khác không xem được đơn');

  // 6. Hủy đơn đã trả tiền → hoàn kho + hoàn tiền
  assert.equal((await api(`/orders/${id1}/cancel`, { method: 'POST', token: T })).status, 200);
  o = (await api(`/orders/${id1}`, { token: T })).data;
  assert.deepEqual([o.status, o.paymentStatus], ['cancelled', 'refunded']);
  assert.equal((await api('/products/1')).data.stock, stockBefore);
  assert.equal((await api(`/orders/${id1}/cancel`, { method: 'POST', token: T })).status, 409);
  ok('Hủy đơn: hoàn kho, hoàn tiền, không hủy 2 lần');

  // 7. COD + admin xử lý
  const o2 = (await api('/orders', { method: 'POST', token: T, body: { ...order, paymentMethod: 'cod', items: [{ productId: 3, quantity: 1 }] } })).data;
  assert.equal(o2.total, 199000 + 30000);
  assert.equal((await api(`/orders/${o2.id}/status`, { method: 'PATCH', token: T, body: { status: 'confirmed' } })).status, 403);
  assert.equal((await api(`/orders/${o2.id}/status`, { method: 'PATCH', token: A, body: { status: 'completed' } })).status, 409);
  for (const s of ['confirmed', 'shipping', 'completed'])
    assert.equal((await api(`/orders/${o2.id}/status`, { method: 'PATCH', token: A, body: { status: s } })).status, 200);
  assert.equal((await api(`/orders/${o2.id}`, { token: T })).data.paymentStatus, 'paid');
  const stats = (await api('/orders/stats', { token: A })).data;
  assert.equal(stats.revenue, 229000);
  assert.equal(stats.paid, 1);
  assert.equal(stats.byStatus.completed, 1);
  assert.equal(stats.byDay.at(-1).revenue, 229000);
  assert.equal(stats.top[0].sold, 1);
  ok('COD: admin duyệt theo luồng, giao xong = đã thu tiền, số liệu Dashboard');

  // 7b. Thông báo cho khách: mọi sự kiện của đơn đều được ghi, đúng thứ tự, đếm chưa đọc, đánh dấu đã đọc
  let nt = (await api('/orders/notifications', { token: T })).data;
  const typesOf = (oid) => nt.items.filter((n) => n.orderId === oid).map((n) => n.type).reverse();
  assert.deepEqual(typesOf(id1), ['placed', 'payment_failed', 'confirmed', 'cancelled']);
  assert.deepEqual(typesOf(o2.id), ['placed', 'confirmed', 'shipping', 'completed']);
  assert.match(nt.items.find((n) => n.orderId === id1 && n.type === 'cancelled').body, /hoàn lại/);
  assert.match(nt.items.find((n) => n.orderId === id1 && n.type === 'payment_failed').body, /từ chối/);
  assert.equal(nt.unread, 8);
  assert.equal((await api('/orders/notifications/unread', { token: T })).data.unread, 8);
  assert.equal((await api('/orders/notifications', { token: K })).data.items.length, 0); // khách khác không thấy
  assert.equal((await api('/orders/notifications')).status, 401);
  const firstId = nt.items[0].id;
  await api('/orders/notifications/read', { method: 'POST', token: K, body: { ids: [firstId] } }); // không đánh dấu được của người khác
  assert.equal((await api('/orders/notifications/unread', { token: T })).data.unread, 8);
  await api('/orders/notifications/read', { method: 'POST', token: T, body: { ids: [firstId] } });
  assert.equal((await api('/orders/notifications/unread', { token: T })).data.unread, 7);
  await api('/orders/notifications/read', { method: 'POST', token: T, body: {} });
  assert.equal((await api('/orders/notifications/unread', { token: T })).data.unread, 0);
  ok('Thông báo: đặt → thanh toán lỗi → xác nhận → giao → nhận / hủy, đếm và đánh dấu đã đọc');

  // 7b. Trợ lý Glowie (chế độ bộ luật)
  const chat = (message, token, lang) => api('/assistant/chat', { method: 'POST', token, body: { message, lang } });
  let c = await chat('Gợi ý kem chống nắng dưới 300k');
  assert.equal(c.status, 200);
  assert.ok(c.data.products.length > 0 && c.data.products.every((p) => p.price <= 300000 && /chống nắng/i.test(p.name)));
  c = await chat('da mình dầu và hay bị mụn');
  assert.ok(c.data.products.some((p) => /Niacinamide/.test(p.name)));
  assert.ok((await chat('sản phẩm đang sale')).data.products.every((p) => p.oldPrice > p.price));
  assert.match((await chat('đơn hàng của tôi')).data.links[0].href, /^dangnhap/);
  c = await chat('kiểm tra đơn hàng', T);
  assert.match(c.data.reply, /GL\d+|không có đơn/); // đã đăng nhập: trả lời từ đơn thật, không đòi đăng nhập
  assert.ok(c.data.links.every((l) => /^(donhang\.html\?id=\d+|taikhoan\.html)$/.test(l.href)));
  assert.match((await chat('phí ship bao nhiêu?')).data.reply, /500\.000₫/);
  assert.match((await chat('shipping fee?', null, 'en')).data.reply, /^Shipping/);
  assert.match((await chat('mặt bị dị ứng nổi mẩn đỏ')).data.reply, /bác sĩ/);
  assert.equal((await chat('  ')).status, 400);
  ok('Trợ lý Glowie: gợi ý theo nhu cầu & ngân sách, sale, tra đơn cần đăng nhập, chính sách, tiếng Anh');

  // 8. Admin: sản phẩm + khóa tài khoản
  const np = await api('/products', { method: 'POST', token: A, body: { name: 'Son thử', brand: 'Test', categoryId: 2, price: 100000, stock: 5 } });
  assert.equal(np.status, 201);
  assert.equal((await api('/products', { method: 'POST', token: A, body: { name: 'X', brand: 'Y', categoryId: 2, price: 100000, oldPrice: 90000, stock: 1 } })).status, 400);
  assert.equal((await api(`/products/${np.data.id}`, { method: 'DELETE', token: A })).status, 200);
  assert.equal((await api(`/products/${np.data.id}`)).status, 404);
  const maiId = reg.data.user.id;
  assert.equal((await api(`/users/${maiId}`, { method: 'PATCH', token: A, body: { isActive: false } })).status, 200);
  assert.equal((await api('/users/me', { token: T })).status, 401);
  assert.equal((await api('/orders', { method: 'POST', token: T, body: { ...order, items: [{ productId: 3, quantity: 1 }] } })).status, 403);
  ok('Admin: thêm/ngừng bán mỹ phẩm, khóa tài khoản có hiệu lực ngay');

  console.log('\nTất cả kiểm thử đều đạt ✅');
})().catch((e) => { console.error('\n✘', e); process.exitCode = 1; }).finally(cleanup);
