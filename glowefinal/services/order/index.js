'use strict';
// Đường dẫn: glowe/services/order/index.js
// ORDER SERVICE — tạo đơn (giữ hàng bên Product), voucher, xem/hủy đơn, admin xử lý trạng thái, thống kê, thông báo
const crypto = require('node:crypto');
const { noticeText } = require('./notices');
const { service, call, requireUser, requireAdmin, requireInternal, isInternal, HttpError, toInt, str, PHONE } = require('../../shared/lib');
const { sql, schemaOf, TZ } = require('../../shared/db');

const S = schemaOf('order');

const FREE_SHIP_FROM = 500000, SHIP_FEE = 30000;
const shippingFee = (subtotal) => (subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE);
const METHODS = ['cod', 'card', 'ewallet'];
const STATUSES = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'];
const NEXT = { pending: ['confirmed', 'cancelled'], confirmed: ['shipping', 'cancelled'], shipping: ['completed'], completed: [], cancelled: [] };

const toOrder = (o) => ({
  id: o.id, code: o.code, userId: o.user_id, receiverName: o.receiver_name, phone: o.phone, address: o.address, note: o.note,
  subtotal: o.subtotal, shippingFee: o.shipping_fee, discount: o.discount || 0, voucherCode: o.voucher_code || null,
  total: o.total, paymentMethod: o.payment_method,
  paymentStatus: o.payment_status, status: o.status, createdAt: o.created_at, updatedAt: o.updated_at,
});
const itemsOf = (id) => sql`SELECT product_id AS "productId", product_name AS name, price, quantity, line_total AS "lineTotal"
  FROM ${S}.order_items WHERE order_id = ${id} ORDER BY id`;

const toVoucher = (v) => ({
  id: v.id, code: v.code, description: v.description, type: v.type, value: v.value,
  minOrder: v.min_order, maxDiscount: v.max_discount, usageLimit: v.usage_limit,
  usedCount: v.used_count, perUserLimit: v.per_user_limit,
  startsAt: v.starts_at, endsAt: v.ends_at, isActive: v.is_active, createdAt: v.created_at,
});

// Tính số tiền giảm từ voucher + tạm tính đơn
function calcDiscount(v, subtotal) {
  let discount = 0;
  if (v.type === 'percent') {
    discount = Math.floor(subtotal * Number(v.value) / 100);
    if (v.max_discount != null && discount > Number(v.max_discount)) discount = Number(v.max_discount);
  } else {
    discount = Number(v.value);
  }
  if (discount > subtotal) discount = subtotal;
  if (discount < 0) discount = 0;
  return discount;
}

// Kiểm tra voucher có dùng được không (trả về { v, discount } hoặc ném lỗi)
async function validateVoucher(code, subtotal, userId, db = sql) {
  const c = str(code, 40).toUpperCase().replace(/\s+/g, '');
  if (!c) throw new HttpError(400, 'Vui lòng nhập mã voucher');
  const [v] = await db`SELECT * FROM ${S}.vouchers WHERE code = ${c}`;
  if (!v) throw new HttpError(404, 'Mã voucher không tồn tại');
  if (!v.is_active) throw new HttpError(400, 'Voucher đã bị khóa');
  const now = new Date();
  if (v.starts_at && new Date(v.starts_at) > now) throw new HttpError(400, 'Voucher chưa đến thời gian sử dụng');
  if (v.ends_at && new Date(v.ends_at) < now) throw new HttpError(400, 'Voucher đã hết hạn');
  if (v.usage_limit != null && v.used_count >= v.usage_limit) throw new HttpError(400, 'Voucher đã hết lượt sử dụng');
  if (Number(v.min_order) > 0 && subtotal < Number(v.min_order))
    throw new HttpError(400, `Đơn tối thiểu ${Number(v.min_order).toLocaleString('vi-VN')}₫ để dùng voucher này`);
  if (userId) {
    const [{ n }] = await db`SELECT COUNT(*)::int AS n FROM ${S}.voucher_usages WHERE voucher_id = ${v.id} AND user_id = ${userId}`;
    if (n >= (v.per_user_limit || 1)) throw new HttpError(400, 'Bạn đã dùng hết số lần cho phép của voucher này');
  }
  const discount = calcDiscount(v, subtotal);
  if (discount <= 0) throw new HttpError(400, 'Voucher không áp dụng được cho đơn này');
  return { v, discount };
}

async function notify(o, type, extra, db = sql) {
  const { title, body } = noticeText(type, o, extra);
  await db`INSERT INTO ${S}.notifications (user_id, order_id, type, title, body) VALUES (${o.user_id}, ${o.id}, ${type}, ${title}, ${body})`;
}

async function loadOrder(ctx) {
  const id = toInt(ctx.params.id);
  const [o] = id > 0 ? await sql`SELECT * FROM ${S}.orders WHERE id = ${id}` : [];
  if (isInternal(ctx.req)) { if (!o) throw new HttpError(404, 'Không tìm thấy đơn hàng'); return { o }; }
  const user = requireUser(ctx.req);
  if (!o || (o.user_id !== user.sub && user.role !== 'admin')) throw new HttpError(404, 'Không tìm thấy đơn hàng');
  return { o, user };
}

async function cancelOrder(o, byAdmin = false) {
  const r = await sql`UPDATE ${S}.orders SET status = 'cancelled', updated_at = now()
                      WHERE id = ${o.id} AND status IN ('pending', 'confirmed')`;
  if (!r.count) throw new HttpError(409, 'Chỉ hủy được đơn chưa giao');
  const items = (await itemsOf(o.id)).map((i) => ({ productId: i.productId, quantity: i.quantity }));
  await call('product', 'POST', '/products/release', { body: { items }, internal: true })
    .catch((e) => console.error('[order] trả kho thất bại, cần xử lý tay:', o.code, e.message));
  if (o.payment_status === 'paid') {
    await call('payment', 'POST', '/payments/record', { internal: true, body: {
      orderId: o.id, userId: o.user_id, method: o.payment_method, amount: o.total, status: 'refunded', message: 'Hoàn tiền do hủy đơn (giả lập)',
    } });
    await sql`UPDATE ${S}.orders SET payment_status = 'refunded', updated_at = now() WHERE id = ${o.id}`;
  }
  // Trả lại lượt voucher nếu đã dùng
  if (o.voucher_code) {
    await sql.begin(async (tx) => {
      const [u] = await tx`DELETE FROM ${S}.voucher_usages WHERE order_id = ${o.id} RETURNING voucher_id`;
      if (u) await tx`UPDATE ${S}.vouchers SET used_count = GREATEST(used_count - 1, 0) WHERE id = ${u.voucher_id}`;
    }).catch((e) => console.error('[order] hoàn voucher thất bại:', o.code, e.message));
  }
  await notify(o, 'cancelled', { byAdmin, refunded: o.payment_status === 'paid' });
}

module.exports = service('order', [
  // ---- Voucher: kiểm tra mã (khách) ----
  ['POST', '/vouchers/validate', async (ctx) => {
    const user = requireUser(ctx.req);
    const subtotal = toInt(ctx.body.subtotal);
    if (subtotal < 0) throw new HttpError(400, 'Tạm tính không hợp lệ');
    const { v, discount } = await validateVoucher(ctx.body.code, subtotal, user.sub);
    return {
      code: v.code, description: v.description, type: v.type, value: v.value,
      discount, minOrder: v.min_order, maxDiscount: v.max_discount,
    };
  }],

  // Kho voucher khả dụng cho khách (đang mở, còn hạn, còn lượt)
  ['GET', '/vouchers/available', async (ctx) => {
    const user = requireUser(ctx.req);
    const subtotal = Math.max(0, toInt(ctx.query.get('subtotal')) || 0);
    const rows = await sql`
      SELECT v.*,
        (SELECT COUNT(*)::int FROM ${S}.voucher_usages u WHERE u.voucher_id = v.id AND u.user_id = ${user.sub}) AS my_used
      FROM ${S}.vouchers v
      WHERE v.is_active = TRUE
        AND (v.starts_at IS NULL OR v.starts_at <= now())
        AND (v.ends_at IS NULL OR v.ends_at >= now())
        AND (v.usage_limit IS NULL OR v.used_count < v.usage_limit)
      ORDER BY v.min_order ASC, v.id DESC`;
    return rows.map((v) => {
      const myUsed = v.my_used || 0;
      const perUserOk = myUsed < (v.per_user_limit || 1);
      const minOk = subtotal >= Number(v.min_order || 0);
      const discount = minOk && perUserOk ? calcDiscount(v, subtotal) : 0;
      const label = v.type === 'percent'
        ? `Giảm ${v.value}%${v.max_discount ? ` tối đa ${Number(v.max_discount).toLocaleString('vi-VN')}₫` : ''}`
        : `Giảm ${Number(v.value).toLocaleString('vi-VN')}₫`;
      const minLabel = Number(v.min_order) > 0
        ? ` cho đơn từ ${Number(v.min_order).toLocaleString('vi-VN')}₫`
        : '';
      return {
        code: v.code,
        description: v.description || (label + minLabel),
        type: v.type,
        value: v.value,
        minOrder: v.min_order,
        maxDiscount: v.max_discount,
        discount,
        usable: perUserOk && minOk && discount > 0,
        reason: !perUserOk ? 'Đã dùng hết lượt' : (!minOk ? `Đơn tối thiểu ${Number(v.min_order).toLocaleString('vi-VN')}₫` : null),
        endsAt: v.ends_at,
      };
    });
  }],

  // ---- Voucher: kho (admin) ----
  ['GET', '/vouchers', async (ctx) => {
    requireAdmin(ctx.req);
    const rows = await sql`SELECT * FROM ${S}.vouchers ORDER BY id DESC`;
    return rows.map(toVoucher);
  }],

  ['POST', '/vouchers', async (ctx) => {
    requireAdmin(ctx.req);
    const b = ctx.body;
    const code = str(b.code, 40).toUpperCase().replace(/\s+/g, '');
    if (!code || !/^[A-Z0-9_-]{3,40}$/.test(code)) throw new HttpError(400, 'Mã voucher 3–40 ký tự (chữ, số, _ -)');
    const type = b.type === 'percent' ? 'percent' : (b.type === 'fixed' ? 'fixed' : null);
    if (!type) throw new HttpError(400, 'Loại voucher phải là percent hoặc fixed');
    const value = toInt(b.value);
    if (value <= 0) throw new HttpError(400, 'Giá trị voucher phải > 0');
    if (type === 'percent' && value > 100) throw new HttpError(400, 'Phần trăm giảm tối đa 100%');
    const minOrder = Math.max(0, toInt(b.minOrder) || 0);
    const maxDiscount = b.maxDiscount != null && b.maxDiscount !== '' ? toInt(b.maxDiscount) : null;
    if (type === 'percent' && maxDiscount != null && maxDiscount <= 0) throw new HttpError(400, 'Trần giảm phải > 0');
    const usageLimit = b.usageLimit != null && b.usageLimit !== '' ? toInt(b.usageLimit) : null;
    if (usageLimit != null && usageLimit <= 0) throw new HttpError(400, 'Giới hạn lượt dùng phải > 0');
    const perUserLimit = Math.max(1, toInt(b.perUserLimit) || 1);
    const description = str(b.description, 255) || null;
    const startsAt = b.startsAt ? new Date(b.startsAt) : new Date();
    const endsAt = b.endsAt ? new Date(b.endsAt) : null;
    if (endsAt && endsAt < startsAt) throw new HttpError(400, 'Ngày hết hạn phải sau ngày bắt đầu');
    try {
      const [v] = await sql`INSERT INTO ${S}.vouchers
        (code, description, type, value, min_order, max_discount, usage_limit, per_user_limit, starts_at, ends_at, is_active)
        VALUES (${code}, ${description}, ${type}, ${value}, ${minOrder}, ${maxDiscount}, ${usageLimit}, ${perUserLimit},
          ${startsAt.toISOString()}, ${endsAt ? endsAt.toISOString() : null}, ${b.isActive !== false})
        RETURNING *`;
      ctx.status = 201;
      return toVoucher(v);
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Mã voucher đã tồn tại');
      throw e;
    }
  }],

  ['PATCH', '/vouchers/:id', async (ctx) => {
    requireAdmin(ctx.req);
    const id = toInt(ctx.params.id);
    const [cur] = id > 0 ? await sql`SELECT * FROM ${S}.vouchers WHERE id = ${id}` : [];
    if (!cur) throw new HttpError(404, 'Không tìm thấy voucher');
    const b = ctx.body;
    const description = b.description !== undefined ? (str(b.description, 255) || null) : cur.description;
    const isActive = b.isActive !== undefined ? !!b.isActive : cur.is_active;
    let usageLimit = cur.usage_limit;
    if (b.usageLimit !== undefined) {
      usageLimit = b.usageLimit === null || b.usageLimit === '' ? null : toInt(b.usageLimit);
      if (usageLimit != null && usageLimit < cur.used_count) throw new HttpError(400, 'Giới hạn lượt không được nhỏ hơn số đã dùng');
    }
    let endsAt = cur.ends_at;
    if (b.endsAt !== undefined) endsAt = b.endsAt ? new Date(b.endsAt).toISOString() : null;
    const [v] = await sql`UPDATE ${S}.vouchers SET
      description = ${description}, is_active = ${isActive}, usage_limit = ${usageLimit}, ends_at = ${endsAt}
      WHERE id = ${id} RETURNING *`;
    return toVoucher(v);
  }],

  // ---- Tạo đơn (có hỗ trợ voucher) ----
  ['POST', '/orders', async (ctx) => {
    const user = requireUser(ctx.req);
    const b = ctx.body;
    const receiverName = str(b.receiverName, 100), phone = str(b.phone, 15), address = str(b.address, 255), note = str(b.note, 255);
    if (!receiverName || !address) throw new HttpError(400, 'Vui lòng nhập tên người nhận và địa chỉ');
    if (!PHONE.test(phone)) throw new HttpError(400, 'Số điện thoại gồm 10 số, bắt đầu bằng 0');
    if (!METHODS.includes(b.paymentMethod)) throw new HttpError(400, 'Phương thức thanh toán không hợp lệ');
    if (!(await call('user', 'GET', `/users/${user.sub}/status`, { internal: true })).isActive) throw new HttpError(403, 'Tài khoản đã bị khóa');

    const lines = await call('product', 'POST', '/products/reserve', { body: { items: b.items }, internal: true });
    try {
      const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
      const fee = shippingFee(subtotal);
      let discount = 0, voucherCode = null, voucherId = null;
      if (b.voucherCode) {
        const { v, discount: d } = await validateVoucher(b.voucherCode, subtotal, user.sub);
        discount = d;
        voucherCode = v.code;
        voucherId = v.id;
      }
      const total = Math.max(0, subtotal + fee - discount);
      const code = 'GL' + Date.now().toString().slice(-8) + crypto.randomInt(100, 1000);
      const o = await sql.begin(async (tx) => {
        // Khóa voucher để tránh vượt usage_limit khi đặt đồng thời
        if (voucherId) {
          const [locked] = await tx`SELECT * FROM ${S}.vouchers WHERE id = ${voucherId} FOR UPDATE`;
          if (!locked || !locked.is_active) throw new HttpError(400, 'Voucher không còn hiệu lực');
          if (locked.usage_limit != null && locked.used_count >= locked.usage_limit)
            throw new HttpError(400, 'Voucher đã hết lượt sử dụng');
          const [{ n }] = await tx`SELECT COUNT(*)::int AS n FROM ${S}.voucher_usages WHERE voucher_id = ${voucherId} AND user_id = ${user.sub}`;
          if (n >= (locked.per_user_limit || 1)) throw new HttpError(400, 'Bạn đã dùng hết số lần cho phép của voucher này');
        }
        const [o] = await tx`INSERT INTO ${S}.orders
          (code, user_id, receiver_name, phone, address, note, subtotal, shipping_fee, discount, voucher_code, total, payment_method)
          VALUES (${code}, ${user.sub}, ${receiverName}, ${phone}, ${address}, ${note || null},
            ${subtotal}, ${fee}, ${discount}, ${voucherCode}, ${total}, ${b.paymentMethod})
          RETURNING *`;
        await tx`INSERT INTO ${S}.order_items ${tx(lines.map((l) => ({
          order_id: o.id, product_id: l.productId, product_name: l.name, price: l.price, quantity: l.quantity, line_total: l.price * l.quantity,
        })))}`;
        if (voucherId) {
          await tx`INSERT INTO ${S}.voucher_usages (voucher_id, user_id, order_id, discount_amount)
            VALUES (${voucherId}, ${user.sub}, ${o.id}, ${discount})`;
          await tx`UPDATE ${S}.vouchers SET used_count = used_count + 1 WHERE id = ${voucherId}`;
        }
        await notify(o, 'placed', {}, tx);
        return o;
      });
      ctx.status = 201;
      return { id: o.id, code, total: o.total, paymentMethod: o.payment_method, discount: o.discount, voucherCode: o.voucher_code };
    } catch (e) {
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

  ['GET', '/orders/notifications', async (ctx) => {
    const user = requireUser(ctx.req);
    const items = await sql`SELECT n.id, n.order_id AS "orderId", o.code, o.status AS "orderStatus", n.type, n.title, n.body,
        n.is_read AS "isRead", n.created_at AS "createdAt"
      FROM ${S}.notifications n JOIN ${S}.orders o ON o.id = n.order_id
      WHERE n.user_id = ${user.sub} ORDER BY n.created_at DESC, n.id DESC LIMIT 100`;
    const [{ unread }] = await sql`SELECT COUNT(*) AS unread FROM ${S}.notifications WHERE user_id = ${user.sub} AND NOT is_read`;
    return { unread, items };
  }],

  ['GET', '/orders/notifications/unread', async (ctx) =>
    (await sql`SELECT COUNT(*) AS unread FROM ${S}.notifications WHERE user_id = ${requireUser(ctx.req).sub} AND NOT is_read`)[0]],

  ['POST', '/orders/notifications/read', async (ctx) => {
    const user = requireUser(ctx.req);
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(toInt).filter((n) => n > 0).slice(0, 200) : null;
    if (ids?.length) await sql`UPDATE ${S}.notifications SET is_read = TRUE WHERE user_id = ${user.sub} AND id IN ${sql(ids)}`;
    else if (!ids) await sql`UPDATE ${S}.notifications SET is_read = TRUE WHERE user_id = ${user.sub}`;
    return { ok: true };
  }],

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
    const products = await sql`SELECT oi.product_id AS "productId", MAX(oi.product_name) AS name, SUM(oi.quantity) AS sold, SUM(oi.line_total) AS revenue
      FROM ${S}.order_items oi JOIN ${S}.orders o ON o.id = oi.order_id WHERE o.status <> 'cancelled'
      GROUP BY oi.product_id ORDER BY sold DESC`;
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
    if (to === 'completed' && o.payment_method === 'cod') {
      await sql`UPDATE ${S}.orders SET payment_status = 'paid' WHERE id = ${o.id}`;
      await call('payment', 'POST', '/payments/record', { internal: true, body: {
        orderId: o.id, userId: o.user_id, method: 'cod', amount: o.total, status: 'success', message: 'Đã thu tiền khi giao hàng',
      } });
    }
    await notify(o, to);
    return { ok: true };
  }],

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
