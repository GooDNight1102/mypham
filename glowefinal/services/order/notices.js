'use strict';
// Đường dẫn: glowe/services/order/notices.js
// Nội dung thông báo cho khách theo từng sự kiện của đơn — dùng bởi Order Service và seed.js
const money = (n) => Number(n).toLocaleString('vi-VN') + '₫';
const METHOD = { cod: 'khi nhận hàng', card: 'thẻ ngân hàng', ewallet: 'ví điện tử' };

// o: { code, total, payment_method } ; extra: { reason, refunded, byAdmin, paid }
const TEXT = {
  placed: (o) => ['Đặt hàng thành công',
    `Đơn ${o.code} (${money(o.total)}) đã được ghi nhận. ` + (o.payment_method === 'cod' ? 'Bạn thanh toán khi nhận hàng.' : 'Vui lòng hoàn tất thanh toán để đơn được xác nhận.')],
  confirmed: (o, x) => ['Đơn hàng đã được xác nhận',
    (x.paid ? `Đã nhận thanh toán ${money(o.total)} qua ${METHOD[o.payment_method]}. ` : '') + `GLOWÉ đang chuẩn bị hàng cho đơn ${o.code}.`],
  payment_failed: (o, x) => ['Thanh toán chưa thành công',
    `Đơn ${o.code}: ${x.reason || 'giao dịch bị từ chối'}. Bạn có thể thanh toán lại trong trang đơn hàng.`],
  shipping: (o) => ['Đơn hàng đang được giao', `Đơn ${o.code} đã được giao cho đơn vị vận chuyển, bạn để ý điện thoại nhé.`],
  completed: (o) => ['Đã nhận hàng', `Đơn ${o.code} đã giao thành công. Cảm ơn bạn đã mua sắm tại GLOWÉ!`],
  cancelled: (o, x) => ['Đơn hàng đã bị hủy',
    `Đơn ${o.code} đã được hủy ${x.byAdmin ? 'bởi GLOWÉ' : 'theo yêu cầu của bạn'}.` + (x.refunded ? ` Số tiền ${money(o.total)} sẽ được hoàn lại.` : '')],
};
const TYPES = Object.keys(TEXT);

const noticeText = (type, o, extra = {}) => {
  const [title, body] = TEXT[type](o, extra);
  return { title, body };
};

module.exports = { noticeText, TYPES };
