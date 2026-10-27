'use strict';
// Đường dẫn: glowe/services/payment/index.js
// PAYMENT SERVICE — thanh toán thẻ / ví điện tử giả lập, lịch sử giao dịch, ghi nhận COD & hoàn tiền
const { service, call, requireUser, requireInternal, HttpError, toInt, str } = require('../../shared/lib');
const { sql, schemaOf, isUniqueError } = require('../../shared/db');
const { simulatePayment } = require('./simulate');

const S = schemaOf('payment');

const toPayment = (p) => ({
  id: p.id, orderId: p.order_id, method: p.method, amount: p.amount, status: p.status,
  ref: p.transaction_ref, last4: p.card_last4, message: p.message, createdAt: p.created_at,
});
const insert = async (p) => (await sql`INSERT INTO ${S}.payments ${sql(p,
  'order_id', 'user_id', 'method', 'amount', 'status', 'transaction_ref', 'card_last4', 'message')} RETURNING id`)[0].id;

module.exports = service('payment', [
  // Khách thanh toán đơn online. Số tiền lấy từ Order Service, không tin client.
  ['POST', '/payments', async (ctx) => {
    const user = requireUser(ctx.req);
    const orderId = toInt(ctx.body.orderId);
    if (!(orderId > 0)) throw new HttpError(400, 'Thiếu mã đơn hàng');
    const order = await call('order', 'GET', `/orders/${orderId}`, { internal: true });
    if (order.userId !== user.sub) throw new HttpError(404, 'Không tìm thấy đơn hàng');
    if (order.paymentMethod === 'cod') throw new HttpError(400, 'Đơn COD thanh toán khi nhận hàng');
    if (order.status !== 'pending' || !['unpaid', 'failed'].includes(order.paymentStatus)) throw new HttpError(409, 'Đơn này không thể thanh toán');

    const pay = simulatePayment(order.paymentMethod, ctx.body);
    let id;
    try {
      id = await insert({ order_id: orderId, user_id: user.sub, method: order.paymentMethod, amount: order.total,
        status: pay.ok ? 'success' : 'failed', transaction_ref: pay.ref ?? null, card_last4: pay.last4, message: pay.message });
    } catch (e) {
      if (isUniqueError(e)) throw new HttpError(409, 'Đơn đã được thanh toán');
      throw e;
    }
    try {
      await call('order', 'POST', `/orders/${orderId}/payment-result`, { body: { ok: pay.ok, message: pay.message }, internal: true });
    } catch (e) {
      // Đã "trừ tiền" nhưng đơn vừa bị hủy -> hoàn tiền ngay
      if (pay.ok) await sql`UPDATE ${S}.payments SET status = 'refunded', message = 'Hoàn tiền: đơn không còn chờ thanh toán' WHERE id = ${id}`;
      throw e;
    }
    if (!pay.ok) throw new HttpError(402, pay.message);
    return { ok: true, ref: pay.ref, message: pay.message };
  }],

  // Lịch sử thanh toán của 1 đơn (chủ đơn hoặc admin)
  ['GET', '/payments', async (ctx) => {
    const user = requireUser(ctx.req);
    const orderId = toInt(ctx.query.get('orderId'));
    if (!(orderId > 0)) return [];
    const rows = user.role === 'admin'
      ? await sql`SELECT * FROM ${S}.payments WHERE order_id = ${orderId} ORDER BY id`
      : await sql`SELECT * FROM ${S}.payments WHERE order_id = ${orderId} AND user_id = ${user.sub} ORDER BY id`;
    return rows.map(toPayment);
  }],

  // ---- Nội bộ: Order Service ghi nhận thu tiền COD / hoàn tiền ----
  ['POST', '/payments/record', async (ctx) => {
    requireInternal(ctx.req);
    const b = ctx.body;
    await insert({ order_id: toInt(b.orderId), user_id: toInt(b.userId), method: str(b.method, 10), amount: toInt(b.amount),
      status: str(b.status, 10), transaction_ref: null, card_last4: null, message: str(b.message, 255) });
    ctx.status = 201;
    return { ok: true };
  }],
], module);
