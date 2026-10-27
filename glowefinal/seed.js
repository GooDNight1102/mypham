'use strict';
// Tạo dữ liệu demo cho Dashboard: 10 khách hàng + ~150 đơn trong 30 ngày qua (kèm giao dịch thanh toán + thông báo).
// setup.js gọi khi CSDL còn trống (npm start / npm run setup). Bỏ qua: NO_SEED=1. Làm lại từ đầu: npm run reset-db
const { hashPassword } = require('./shared/lib');
const { noticeText } = require('./services/order/notices');

// Ngẫu nhiên có hạt giống: chạy lại cho cùng bộ dữ liệu
let s = 20261020;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pad = (n) => String(n).padStart(2, '0');
const ymdhms = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}`;

// sql: kết nối postgres ; S: { user, product, order, payment } -> tên schema (đã bọc sql())
async function seed(sql, S, log = console.log) {
  if ((await sql`SELECT 1 FROM ${S.user}.users LIMIT 1`).length) return false; // đã có dữ liệu -> bỏ qua

  // ---- Người dùng ----
  const now = new Date();
  // Thời điểm n ngày trước, giờ ngẫu nhiên 8h–22h; không bao giờ sau thời điểm hiện tại
  const daysAgo = (n, h = between(8, 22)) => {
    const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(h, between(0, 59), between(0, 59));
    return d < now ? d : new Date(now - between(5, 240) * 60e3);
  };
  const people = [
    ['Nguyễn Thu Hà', 'khach@glowe.vn', '0912345678', '12 Láng Hạ, Đống Đa, Hà Nội'],
    ['Trần Minh Anh', 'minhanh@glowe.vn', '0903111222', '45 Nguyễn Trãi, Thanh Xuân, Hà Nội'],
    ['Lê Phương Linh', 'phuonglinh@glowe.vn', '0987222333', '8 Lê Lợi, Quận 1, TP.HCM'],
    ['Phạm Ngọc Mai', 'ngocmai@glowe.vn', '0938444555', '102 Trần Phú, Hải Châu, Đà Nẵng'],
    ['Hoàng Khánh Vy', 'khanhvy@glowe.vn', '0977666777', '23 Cầu Giấy, Cầu Giấy, Hà Nội'],
    ['Vũ Bảo Ngọc', 'baongoc@glowe.vn', '0915888999', '67 Võ Văn Tần, Quận 3, TP.HCM'],
    ['Đặng Thảo My', 'thaomy@glowe.vn', '0968123456', '5 Hùng Vương, Huế'],
    ['Bùi Gia Hân', 'giahan@glowe.vn', '0945234567', '19 Lạch Tray, Ngô Quyền, Hải Phòng'],
    ['Đỗ Quỳnh Chi', 'quynhchi@glowe.vn', '0923345678', '88 Hai Bà Trưng, Hoàn Kiếm, Hà Nội'],
    ['Ngô Hải Yến', 'haiyen@glowe.vn', '0956456789', '31 Nguyễn Văn Linh, Quận 7, TP.HCM'],
  ];
  const demoHash = hashPassword('Khach@123'); // mọi khách demo dùng chung mật khẩu Khach@123
  const userRows = [
    { full_name: 'Quản trị viên', email: (process.env.ADMIN_EMAIL || 'admin@glowe.vn').toLowerCase(), phone: '0900000001', address: 'Hà Nội',
      password_hash: hashPassword(process.env.ADMIN_PASSWORD || 'Admin@123'), role: 'admin', created_at: daysAgo(60) },
    ...people.map(([full_name, email, phone, address], i) => ({ full_name, email, phone, address, password_hash: demoHash, role: 'customer', created_at: daysAgo(45 - i * 3) })),
  ];
  const ids = Object.fromEntries((await sql`INSERT INTO ${S.user}.users ${sql(userRows)} RETURNING id, email`).map((u) => [u.email, u.id]));
  const customers = people.map(([name, email, phone, address]) => ({ id: ids[email], name, phone, address }));

  // ---- Đơn hàng + thanh toán + thông báo: dựng hết trong bộ nhớ rồi chèn hàng loạt ----
  const products = await sql`SELECT id, name, price FROM ${S.product}.products WHERE is_active ORDER BY id`;
  const popular = products.flatMap((p, i) => Array(i % 4 === 0 ? 4 : i % 3 === 0 ? 2 : 1).fill(p)); // vài món bán chạy hơn
  const orders = [], items = [], notices = [], pays = []; // items/notices/pays giữ code đơn, đổi sang id sau khi chèn đơn
  let count = 0;
  {
    for (let day = 29; day >= 0; day--) {
      const weekend = [0, 6].includes(daysAgo(day, 12).getDay());
      const perDay = between(3, 6) + (weekend ? 3 : 0); // cuối tuần đông hơn
      for (let k = 0; k < perDay; k++) {
        const c = day <= 3 && k === 0 ? customers[0] : pick(customers), at = daysAgo(day); // khách demo luôn có đơn mới để xem tiến độ
        const lines = new Map();
        for (let n = between(1, 3); n > 0; n--) { const p = pick(popular); lines.set(p, (lines.get(p) || 0) + between(1, 2)); }
        const subtotal = [...lines].reduce((sum, [p, q]) => sum + p.price * q, 0);
        const fee = subtotal >= 500000 ? 0 : 30000, total = subtotal + fee;
        const method = pick(['cod', 'cod', 'cod', 'card', 'card', 'ewallet']);
        // Đơn cũ phần lớn đã xong; đơn 0–2 ngày còn đang xử lý
        const r = rand();
        let status = day > 2 ? (r < 0.84 ? 'completed' : r < 0.94 ? 'cancelled' : 'shipping')
          : (r < 0.35 ? 'pending' : r < 0.6 ? 'confirmed' : r < 0.85 ? 'shipping' : 'completed');
        const online = method !== 'cod';
        let payStatus = 'unpaid';
        if (online && !(status === 'pending' && r < 0.15)) payStatus = status === 'cancelled' ? 'refunded' : 'paid';
        if (!online && status === 'completed') payStatus = 'paid';
        if (status === 'pending' && payStatus === 'paid') status = 'confirmed'; // trả online xong -> tự xác nhận
        const code = 'GL' + ymdhms(at).slice(2) + String(++count).padStart(3, '0');
        orders.push({ code, user_id: c.id, receiver_name: c.name, phone: c.phone, address: c.address, subtotal, shipping_fee: fee,
          discount: 0, voucher_code: null, total,
          payment_method: method, payment_status: payStatus, status, created_at: at, updated_at: at });
        for (const [p, q] of lines) items.push({ code, product_id: p.id, product_name: p.name, price: p.price, quantity: q, line_total: p.price * q });
        const id = code; // tạm dùng mã đơn, đổi sang id thật bên dưới

        const payAt = new Date(at.getTime() + 60e3);
        let failedCard = false;
        if (online && payStatus !== 'unpaid') {
          if (method === 'card' && rand() < 0.2) { failedCard = true; pays.push([id, c.id, method, total, 'failed', null, '0002', 'Thẻ bị ngân hàng từ chối', payAt]); }
          const ref = (method === 'card' ? 'CARD' : 'WALLET') + count.toString(36).toUpperCase() + between(1000, 9999);
          pays.push([id, c.id, method, total, 'success', ref, method === 'card' ? '1111' : null,
            method === 'card' ? 'Thanh toán thẻ thành công' : 'Thanh toán ví điện tử thành công', payAt]);
          if (payStatus === 'refunded') pays.push([id, c.id, method, total, 'refunded', null, null, 'Hoàn tiền do hủy đơn (giả lập)', payAt]);
        }
        if (!online && payStatus === 'paid') pays.push([id, c.id, 'cod', total, 'success', null, null, 'Đã thu tiền khi giao hàng', payAt]);

        // Thông báo theo dòng thời gian của đơn (không vượt quá hiện tại; cũ hơn 2 ngày = đã đọc)
        const o = { code, total, payment_method: method };
        const H = 3600e3;
        let last = at.getTime() - 60e3;
        const note = (type, after, extra) => {
          last = Math.max(last + 60e3, Math.min(at.getTime() + after, now.getTime() - 60e3));
          const { title, body } = noticeText(type, o, extra);
          notices.push({ user_id: c.id, code, type, title, body, is_read: now - last > 2 * 24 * H, created_at: new Date(last) });
        };
        note('placed', 0);
        if (failedCard) note('payment_failed', 60e3, { reason: 'Thẻ bị ngân hàng từ chối' });
        if (status === 'cancelled') {
          if (payStatus === 'refunded') note('confirmed', 2 * 60e3, { paid: true });
          note('cancelled', between(1, 10) * H, { byAdmin: rand() < 0.4, refunded: payStatus === 'refunded' });
        } else {
          const steps = ['confirmed', 'shipping', 'completed'].slice(0, ['pending', 'confirmed', 'shipping', 'completed'].indexOf(status));
          let after = online ? 2 * 60e3 : between(20, 180) * 60e3;
          for (const step of steps) {
            note(step, after, step === 'confirmed' ? { paid: online } : undefined);
            after += (step === 'confirmed' ? between(6, 20) : between(18, 40)) * H;
          }
        }
      }
    }
  }
  // Kho voucher mẫu
  await sql`INSERT INTO ${S.order}.vouchers ${sql([
    { code: 'GLOWE10', description: 'Giảm 10% tối đa 50.000₫ — đơn từ 300.000₫', type: 'percent', value: 10, min_order: 300000, max_discount: 50000, usage_limit: 100, used_count: 0, per_user_limit: 1, is_active: true },
    { code: 'FREESHIP', description: 'Giảm cố định 30.000₫ — đơn từ 200.000₫', type: 'fixed', value: 30000, min_order: 200000, max_discount: null, usage_limit: null, used_count: 0, per_user_limit: 3, is_active: true },
    { code: 'WELCOME50', description: 'Giảm 50.000₫ cho khách mới — đơn từ 150.000₫', type: 'fixed', value: 50000, min_order: 150000, max_discount: null, usage_limit: 50, used_count: 0, per_user_limit: 1, is_active: true },
  ])}`;

  const orderId = Object.fromEntries((await sql`INSERT INTO ${S.order}.orders ${sql(orders)} RETURNING id, code`).map((o) => [o.code, o.id]));
  const withId = ({ code, ...r }) => ({ order_id: orderId[code], ...r });
  await sql`INSERT INTO ${S.order}.order_items ${sql(items.map(withId))}`;
  await sql`INSERT INTO ${S.order}.notifications ${sql(notices.map(withId))}`;
  const payCols = ['order_id', 'user_id', 'method', 'amount', 'status', 'transaction_ref', 'card_last4', 'message', 'created_at'];
  await sql`INSERT INTO ${S.payment}.payments ${sql(pays.map((p) => Object.fromEntries(payCols.map((k, i) => [k, i ? p[i] : orderId[p[0]]]))))}`;
  log(`[seed] đã tạo ${customers.length} khách hàng, ${count} đơn hàng, ${pays.length} giao dịch demo, 3 voucher`);
  return true;
}

module.exports = { seed };
