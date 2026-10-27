'use strict';
// Đường dẫn: glowe/services/payment/simulate.js
// Cổng thanh toán GIẢ LẬP — không kết nối ngân hàng thật, không lưu số thẻ đầy đủ.
const crypto = require('node:crypto');

// Thẻ test cố định kết quả (mọi thẻ hợp lệ Luhn khác -> thành công)
const DECLINED_CARDS = {
  '4000000000000002': 'Thẻ bị ngân hàng từ chối',
  '4000000000009995': 'Số dư tài khoản không đủ',
};

// Thuật toán Luhn — cách ngân hàng kiểm tra số thẻ có "đúng dạng" không
function luhn(num) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const ref = (prefix) => prefix + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
const fail = (message, last4 = null) => ({ ok: false, message, last4 });

/**
 * method: 'card' | 'ewallet'
 * data:   card    -> { cardNumber, expiry: 'MM/YY', cvv, holder }
 *         ewallet -> { walletPhone }
 * now:    truyền vào để test được ngày hết hạn
 */
function simulatePayment(method, data = {}, now = new Date()) {
  if (method === 'card') {
    const number = String(data.cardNumber ?? '').replace(/\s+/g, '');
    if (!/^\d{16}$/.test(number) || !luhn(number)) return fail('Số thẻ không hợp lệ');
    const last4 = number.slice(-4);
    if (!String(data.holder ?? '').trim()) return fail('Vui lòng nhập tên chủ thẻ', last4);
    const m = /^(\d{2})\/(\d{2})$/.exec(String(data.expiry ?? ''));
    if (!m || +m[1] < 1 || +m[1] > 12) return fail('Ngày hết hạn phải có dạng MM/YY', last4);
    if (new Date(2000 + +m[2], +m[1], 1) <= now) return fail('Thẻ đã hết hạn', last4); // còn hạn tới hết tháng MM
    if (!/^\d{3}$/.test(String(data.cvv ?? ''))) return fail('CVV gồm 3 chữ số', last4);
    if (DECLINED_CARDS[number]) return fail(DECLINED_CARDS[number], last4);
    return { ok: true, message: 'Thanh toán thẻ thành công', last4, ref: ref('CARD') };
  }
  if (method === 'ewallet') {
    const phone = String(data.walletPhone ?? '');
    if (!/^0\d{9}$/.test(phone)) return fail('Số điện thoại ví không hợp lệ');
    if (phone.endsWith('0000')) return fail('Ví không đủ số dư'); // quy ước test
    return { ok: true, message: 'Thanh toán ví điện tử thành công', last4: null, ref: ref('WALLET') };
  }
  return fail('Phương thức thanh toán không hỗ trợ');
}

module.exports = { simulatePayment, luhn };
