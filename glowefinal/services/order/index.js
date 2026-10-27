'use strict';
// Đường dẫn: glowe/services/order/index.js
// ORDER SERVICE — tạo đơn (giữ hàng bên Product), xem/hủy đơn, admin xử lý trạng thái, thống kê, thông báo cho khách
const crypto = require('node:crypto');
const { noticeText } = require('./notices');
const { service, call, requireUser, requireAdmin, requireInternal, isInternal, HttpError, toInt, str, PHONE } = require('../../shared/lib');
const { sql, schemaOf, TZ } = require('../../shared/db');

const S = schemaOf('order');

const FREE_SHIP_FROM = 500000, SHIP_FEE = 30000;
const shippingFee = (subtotal) => (subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE);
const METHODS = ['cod', 'card', 'ewallet'];
const STATUSES = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'];
// Luồng trạng thái hợp lệ (admin)
const NEXT = { pending: ['confirmed', 'cancelled'], confirmed: ['shipping', 'cancelled'], shipping: ['completed'], completed: [], cancelled: [] };

const toOrder = (o) => ({
  id: o.id, code: o.code, userId: o.user_id, receiverName: o.receiver_name, phone: o.phone, address: o.address, note: o.note,
  subtotal: o.subtotal, shippingFee: o.shipping_fee, total: o.total, paymentMethod: o.payment_method,
  paymentStatus: o.payment_status, status: o.status, createdAt: o.created_at, updatedAt: o.updated_at,
});
const itemsOf = (id) => sql`SELECT product_id AS "productId", product_name AS name, price, quantity, line_total AS "lineTotal"
  FROM ${S}.order_items WHERE order_id = ${id} ORDER BY id`;

// Ghi 1 thông báo cho chủ đơn. o: dòng orders (cần user_id, id, code, total, payment_method). db: sql hoặc transaction
async function notify(o, type, extra, db = sql) {
  const { title, body } = noticeText(type, o, extra);
  await db`INSERT INTO ${S}.notifications (user_id, order_id, type, title, body) VALUES (${o.user_id}, ${o.id}, ${type}, ${title}, ${body})`;
}

// Chủ đơn, admin hoặc service nội bộ mới xem được
async function loadOrder(ctx) {
  const id = toInt(ctx.params.id);
  const [o] = id > 0 ? await sql`SELECT * FROM ${S}.orders WHERE id = ${id}` : [];
  if (isInternal(ctx.req)) { if (!o) throw new HttpError(404, 'Không tìm thấy đơn hàng'); return { o }; }
  const user = requireUser(ctx.req);
  if (!o || (o.user_id !== user.sub && user.role !== 'admin')) throw new HttpError(404, 'Không tìm thấy đơn hàng');
  return { o, user };
}

// Hủy: đổi trạng thái nguyên tử trước (chặn hủy 2 lần), rồi trả kho + hoàn tiền
async function cancelOrder(o, byAdmin = false) {
  const r = await sql`UPDATE ${S}.orders SET status = 'cancelled', updated_at = now()
                      WHERE id = ${o.id} AND status IN ('pending', 'confirmed')`;
  if (!r.count) throw new HttpError(409, 'Chỉ hủy được đơn chưa giao');
  const items = (await itemsOf(o.id)).map((i) => ({ productId: i.productId, quantity: i.quantity }));
  await call('product', 'POST', '/products/release', { body: { items }, internal: true })
    .catch((e) => console.error('[order] trả kho thất bại, cần xử lý tay:', o.code, e.message)); // ponytail: đồng bộ, dùng hàng đợi (outbox) nếu cần chắc chắn
  if (o.payment_status === 'paid') {
    await call('payment', 'POST', '/payments/record', { internal: true, body: {
      orderId: o.id, userId: o.user_id, method: o.payment_method, amount: o.total, status: 'refunded', message: 'Hoàn tiền do hủy đơn (giả lập)',
    } });
    await sql`UPDATE ${S}.orders SET payment_status = 'refunded', updated_at = now() WHERE id = ${o.id}`;
  }
  await notify(o, 'cancelled', { byAdmin, refunded: o.payment_status === 'paid' });
}

module.exports = service('order', [
  ['POST', '/orders', async (ctx) => {
    const user = requireUser(ctx.req);
    const b = ctx.body;
    const receiverName = str(b.receiverName, 100), phone = str(b.phone, 15), address = str(b.address, 255), note = str(b.note, 255);
    if (!receiverName || !address) throw new HttpError(400, 'Vui lòng nhập tên người nhận và địa chỉ');
    if (!PHONE.test(phone)) throw new HttpError(400, 'Số điện thoại gồm 10 số, bắt đầu bằng 0');
    if (!METHODS.includes(b.paymentMethod)) throw new HttpError(400, 'Phương thức thanh toán không hợp lệ');
    if (!(await call('user', 'GET', `/users/${user.sub}/status`, { internal: true })).isActive) throw new HttpError(403, 'Tài khoản đã bị khóa');

    // Product Service kiểm tra tồn kho + trả giá thật. Giá client gửi lên bị bỏ qua.
    const lines = await call('product', 'POST', '/products/reserve', { body: { items: b.items }, internal: true });
    try {
      const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
      const fee = shippingFee(subtotal);
      const code = 'GL' + Date.now().toString().slice(-8) + crypto.randomInt(100, 1000);
      const o = await sql.begin(async (tx) => {
        const [o] = await tx`INSERT INTO ${S}.orders (code, user_id, receiver_name, phone, address, note, subtotal, shipping_fee, total, payment_method)
          VALUES (${code}, ${user.sub}, ${receiverName}, ${phone}, ${address}, ${note || null}, ${subtotal}, ${fee}, ${subtotal + fee}, ${b.paymentMethod})
          RETURNING *`;
        await tx`INSERT INTO ${S}.order_items ${tx(lines.map((l) => ({
          order_id: o.id, product_id: l.productId, product_name: l.name, price: l.price, quantity: l.quantity, line_total: l.price * l.quantity,
        })))}`;
        await notify(o, 'placed', {}, tx);
        return o;
      });
      ctx.status = 201;
      return { id: o.id, code, total: o.total, paymentMethod: o.payment_method };
    } catch (e) {
      // Lưu đơn lỗi -> trả lại hàng đã giữ
      await call('product', 'POST', '/products/release', { body: { items: lines }, internal: true }).catch(() => {});
      throw e;
    }
  }],

  ['GET', '/orders', async (ctx) => {
    const user = requireUser(ctx.req);
    const rows = await sql`SELECT o.*, (SELECT SUM(quantity) FROM ${S}.order_items WHERE order_id = o.id) AS item_count
                           FROM ${S}.orders o WHERE user_id = ${user.sub} ORDER BY id DESC`;
    return rows.map((o) => ({ ...toOrder(o), itemCount: o.item_count }));
  }],

  // ---- Thông báo của khách (khai báo trước '/orders/:id') ----
  // ponytail: trả 100 thông báo gần nhất, thêm phân trang khi khách có rất nhiều đơn
  ['GET', '/orders/notifications', async (ctx) => {
    const user = requireUser(ctx.req);
    const items = await sql`SELECT n.id, n.order_id AS "orderId", o.code, o.status AS "orderStatus", n.type, n.title, n.body,
        n.is_read AS "isRead", n.created_at AS "createdAt"
      FROM ${S}.notifications n JOIN ${S}.orders o ON o.id = n.order_id
      WHERE n.user_id = ${user.sub} ORDER BY n.created_at DESC, n.id DESC LIMIT 100`;
    const [{ unread }] = await sql`SELECT COUNT(*) AS unread FROM ${S}.notifications WHERE user_id = ${user.sub} AND NOT is_read`;
    return { unread, items };
  }],

  // Số chưa đọc cho chuông trên header (nhẹ, gọi ở mọi trang)
  ['GET', '/orders/notifications/unread', async (ctx) =>
    (await sql`SELECT COUNT(*) AS unread FROM ${S}.notifications WHERE user_id = ${requireUser(ctx.req).sub} AND NOT is_read`)[0]],

  // Đánh dấu đã đọc: {ids: [..]} hoặc không gửi ids = tất cả
  ['POST', '/orders/notifications/read', async (ctx) => {
    const user = requireUser(ctx.req);
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(toInt).filter((n) => n > 0).slice(0, 200) : null;
    if (ids?.length) await sql`UPDATE ${S}.notifications SET is_read = TRUE WHERE user_id = ${user.sub} AND id IN ${sql(ids)}`;
    else if (!ids) await sql`UPDATE ${S}.notifications SET is_read = TRUE WHERE user_id = ${user.sub}`;
    return { ok: true };
  }],

  // ---- Quản trị (khai báo trước '/orders/:id') ----
  ['GET', '/orders/all', async (ctx) => {
    requireAdmin(ctx.req);
    const status = ctx.query.get('status');
    const rows = STATUSES.includes(status)
      ? await sql`SELECT * FROM ${S}.orders WHERE status = ${status} ORDER BY id DESC`
      : await sql`SELECT * FROM ${S}.orders ORDER BY id DESC`;
    return rows.map(toOrder);
  }],

  ['GET', '/orders/stats', async (ctx) => {
    requireAdmin(ctx.req);
    const [s] = await sql`SELECT COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid,
        COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0) AS revenue
      FROM ${S}.orders`;
    // Toàn bộ sản phẩm đã bán (Dashboard tự ghép danh mục từ Product Service)
    const products = await sql`SELECT oi.product_id AS "productId", MAX(oi.product_name) AS name, SUM(oi.quantity) AS sold, SUM(oi.line_total) AS revenue
      FROM ${S}.order_items oi JOIN ${S}.orders o ON o.id = oi.order_id WHERE o.status <> 'cancelled'
      GROUP BY oi.product_id ORDER BY sold DESC`;
    // 30 ngày gần nhất theo giờ Việt Nam: số đơn + doanh thu đã thu theo ngày đặt
    const byDay = await sql`SELECT to_char((created_at AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day, COUNT(*) AS orders,
        COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0) AS revenue
      FROM ${S}.orders WHERE (created_at AT TIME ZONE ${TZ})::date >= (now() AT TIME ZONE ${TZ})::date - 29
      GROUP BY 1 ORDER BY 1`;
    const byStatus = Object.fromEntries((await sql`SELECT status, COUNT(*) AS n FROM ${S}.orders GROUP BY status`).map((r) => [r.status, r.n]));
    const byMethod = await sql`SELECT payment_method AS method, COUNT(*) AS orders,
        COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0) AS revenue
      FROM ${S}.orders WHERE status <> 'cancelled' GROUP BY payment_method`;
    const recent = (await sql`SELECT * FROM ${S}.orders ORDER BY id DESC LIMIT 6`).map(toOrder);
    return { orders: s.orders, pending: s.pending, paid: s.paid, revenue: s.revenue, top: products.slice(0, 5), products, byDay, byStatus, byMethod, recent };
  }],

  ['GET', '/orders/:id', async (ctx) => {
    const { o } = await loadOrder(ctx);
    return { ...toOrder(o), items: await itemsOf(o.id) };
  }],

  ['POST', '/orders/:id/cancel', async (ctx) => {
    const { o } = await loadOrder(ctx);
    await cancelOrder(o);
    return { ok: true };
  }],

  ['PATCH', '/orders/:id/status', async (ctx) => {
    requireAdmin(ctx.req);
    const { o } = await loadOrder(ctx);
    const to = ctx.body.status;
    if (!NEXT[o.status].includes(to)) throw new HttpError(409, `Không thể chuyển từ "${o.status}" sang "${to}"`);
    if (to === 'confirmed' && o.payment_method !== 'cod' && o.payment_status !== 'paid')
      throw new HttpError(409, 'Đơn thanh toán online chưa được thanh toán');
    if (to === 'cancelled') { await cancelOrder(o, true); return { ok: true }; }
    const r = await sql`UPDATE ${S}.orders SET status = ${to}, updated_at = now() WHERE id = ${o.id} AND status = ${o.status}`;
    if (!r.count) throw new HttpError(409, 'Đơn vừa được cập nhật bởi người khác, hãy tải lại');
    if (to === 'completed' && o.payment_method === 'cod') { // giao xong = đã thu tiền COD
      await sql`UPDATE ${S}.orders SET payment_status = 'paid' WHERE id = ${o.id}`;
      await call('payment', 'POST', '/payments/record', { internal: true, body: {
        orderId: o.id, userId: o.user_id, method: 'cod', amount: o.total, status: 'success', message: 'Đã thu tiền khi giao hàng',
      } });
    }
    await notify(o, to);
    return { ok: true };
  }],

  // ---- Nội bộ: Payment Service báo kết quả thanh toán ----
  // Chỉ nhận khi đơn còn chờ thanh toán; trả 409 để Payment tự hoàn tiền nếu đơn vừa bị hủy
  ['POST', '/orders/:id/payment-result', async (ctx) => {
    requireInternal(ctx.req);
    const ok = !!ctx.body.ok, id = toInt(ctx.params.id);
    const [o] = await sql`UPDATE ${S}.orders SET payment_status = ${ok ? 'paid' : 'failed'},
        status = CASE WHEN ${ok} THEN 'confirmed' ELSE status END, updated_at = now()
      WHERE id = ${id} AND status = 'pending' AND payment_status IN ('unpaid', 'failed') RETURNING *`;
    if (!o) throw new HttpError(409, 'Đơn không còn ở trạng thái chờ thanh toán');
    if (ok) await notify(o, 'confirmed', { paid: true });
    else await notify(o, 'payment_failed', { reason: str(ctx.body.message, 120).replace(/\.$/, '') });
    return { ok: true };
  }],
], module);
