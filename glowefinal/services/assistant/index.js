'use strict';
// Đường dẫn: glowe/services/assistant/index.js
// ASSISTANT SERVICE (cổng 4005) — trợ lý mua sắm "Glowie" của GLOWÉ.
// POST /assistant/chat { message, lang: 'vi'|'en', history: [{ role: 'user'|'assistant', text }] }
//   -> { reply, products: [...], links: [{ label, href }], suggestions: [...], source: 'rules'|'ai' }
//
// 2 chế độ:
//  1. Luật (mặc định, miễn phí, không cần internet): hiểu ý theo từ khóa không dấu, dùng DỮ LIỆU THẬT
//     từ Product Service (gợi ý theo loại da / nhu cầu / ngân sách) và Order Service (tra đơn của khách).
//  2. AI (khi .env có ANTHROPIC_API_KEY): Claude trò chuyện tự nhiên, được nạp sẵn danh mục, chính sách
//     và đơn hàng của khách. Lỗi mạng / hết hạn mức -> tự quay về chế độ 1.
const { service, call, str, HttpError } = require('../../shared/lib');
const { unaccent } = require('../product/catalog');

const AI_KEY = process.env.ANTHROPIC_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-5-5';
const SHOP = { freeShipFrom: 500000, shipFee: 30000, returnDays: 7, hotline: '1900 0000', email: 'hotro@glowe.vn', hours: '8:00 – 22:00' };
const money = (n) => Number(n).toLocaleString('vi-VN') + '₫';

// Danh mục: lấy từ Product Service, nhớ 60 giây
let cache = { at: 0, list: [] };
async function catalog() {
  if (Date.now() - cache.at > 60000) cache = { at: Date.now(), list: await call('product', 'GET', '/products') };
  return cache.list;
}
const card = (p) => ({ id: p.id, name: p.name, brand: p.brand, price: p.price, oldPrice: p.oldPrice, stock: p.stock,
  imageUrl: p.imageUrl, icon: p.icon, categorySlug: p.categorySlug });

// Đơn của khách (cần token). Không đăng nhập / token hỏng -> null
const myOrders = (token) => (token ? call('order', 'GET', '/orders', { token }).catch(() => null) : Promise.resolve(null));

// ---------- 1. Bộ luật ----------
// Nhu cầu -> từ khóa tìm trong (tên + mô tả + loại da + danh mục) của sản phẩm, đều đã bỏ dấu
const NEEDS = [
  [/da (\w+ )?dau\b|dau nhon|bong dau|oily/, ['da dau', 'dau thua', 'kiem dau', 'lo chan long']],
  [/mun|acne/, ['mun', 'lo chan long', 'niacinamide']],
  [/da (\w+ )?kho\b|bong troc|dry/, ['da kho', 'cap am', 'duong am', 'ceramide']],
  [/nhay cam|kich ung|do da|sensitive/, ['nhay cam', 'diu', 'lam diu', 'ceramide']],
  [/tham|xin mau|sang da|nam|dull|bright/, ['vitamin c', 'mo tham', 'deu mau', 'xin mau']],
  [/lo chan long|pore/, ['lo chan long']],
  [/chong nang|spf|di bien|nang|sunscreen|sun/, ['chong nang', 'spf']],
  [/son|moi|lip/, ['son']],
  [/serum/, ['serum']],
  [/kem duong|duong am|moistur/, ['kem duong', 'duong am']],
  [/toner|nuoc can bang/, ['toner', 'can bang']],
  [/tay trang|makeup remov|cleansing/, ['tay trang']],
  [/rua mat|cleanser|lam sach/, ['rua mat', 'lam sach']],
  [/mat na|mask/, ['mat na']],
  [/nuoc hoa|perfume|fragrance|thom|body mist/, ['nuoc hoa', 'huong', 'xit thom']],
  [/mascara|chuot mi|\bmi\b|lash/, ['mascara', 'mi']],
  [/phan mat|eyeshadow/, ['phan mat']],
  [/cushion|kem nen|lop nen|foundation/, ['cushion', 'nen']],
  [/trang diem|makeup/, ['trang diem']],
  [/cham soc da|skincare|duong da/, ['cham soc da']],
  [/body|toan than/, ['body', 'toan than']],
];
// "dưới 300k", "tầm 200 nghìn", "under 300k", "300.000"
function budgetOf(n) {
  const m = n.match(/(duoi|toi da|khong qua|tam|khoang|under|below|max|<)?\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|tr|trieu|d|vnd|000)?\b/);
  if (!m || (!m[1] && !m[3] && Number(m[2].replace(/[.,]/g, '')) < 10000)) return null;
  let v = Number(m[2].replace(',', '.')); // "300.000" -> 300 rồi nhân 1000 bên dưới
  if (m[3] === 'tr' || m[3] === 'trieu') v *= 1e6;
  else if ((m[3] && m[3] !== 'd' && m[3] !== 'vnd') || v < 10000) v *= 1000;
  const around = /tam|khoang/.test(m[1] || '');
  return { max: around ? v * 1.25 : v };
}

function recommend(list, n) {
  const words = NEEDS.filter(([re]) => re.test(n)).flatMap(([, w]) => w);
  const budget = budgetOf(n);
  const sale = /sale|giam gia|khuyen mai|discount|deal/.test(n);
  if (!words.length && !budget && !sale) return null;
  return list
    .filter((p) => p.stock > 0 && (!budget || p.price <= budget.max) && (!sale || p.oldPrice))
    .map((p) => {
      const text = unaccent(`${p.name} ${p.description} ${p.skinType || ''} ${p.categoryName}`);
      const score = words.reduce((s, w) => s + (text.includes(w) ? (unaccent(p.name).includes(w) ? 3 : 1) : 0), 0)
        + (sale && p.oldPrice ? (1 - p.price / p.oldPrice) * 5 : 0);
      return { p, score };
    })
    .filter((x) => x.score > 0 || !words.length)
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
    .slice(0, 4).map((x) => x.p);
}

const STATUS = {
  vi: { pending: 'đang chờ xác nhận', confirmed: 'đã được xác nhận, đang chuẩn bị hàng', shipping: 'đang được giao', completed: 'đã giao thành công', cancelled: 'đã hủy' },
  en: { pending: 'waiting for confirmation', confirmed: 'confirmed and being prepared', shipping: 'out for delivery', completed: 'delivered', cancelled: 'cancelled' },
};
const SUGGEST = {
  vi: ['Gợi ý cho da dầu mụn', 'Son dưới 200k', 'Sản phẩm đang sale', 'Đơn hàng của tôi', 'Phí giao hàng?'],
  en: ['Products for oily skin', 'Lipstick under 200k', 'What\'s on sale?', 'My orders', 'Shipping fee?'],
};

async function rules(message, lang, token) {
  const vi = lang === 'vi', t = (a, b) => (vi ? a : b);
  const n = ' ' + unaccent(message) + ' ', has = (re) => re.test(n);
  const out = (reply, extra = {}) => ({ reply, products: [], links: [], suggestions: [], ...extra });

  // Vấn đề da nghiêm trọng: khuyên gặp bác sĩ trước
  if (has(/di ung|noi man|sung|mun mu|viem|nhiem trung|bong da|allerg|rash|infect/))
    return out(t('Nếu da đang dị ứng, sưng hoặc viêm, bạn nên ngưng sản phẩm đang dùng và gặp bác sĩ da liễu trước nhé. Khi da ổn hơn, bạn thử sản phẩm mới ở vùng nhỏ sau tai 24 giờ. Mình có thể gợi ý dòng dịu nhẹ cho da nhạy cảm.',
      'If your skin is allergic, swollen or inflamed, please stop the current product and see a dermatologist first. Once it calms down, patch-test new products behind the ear for 24 hours. I can suggest gentle products for sensitive skin.'),
    { suggestions: [t('Gợi ý cho da nhạy cảm', 'Products for sensitive skin')] });

  // Tra đơn hàng
  const code = message.match(/GL\d{6,}/i)?.[0]?.toUpperCase();
  if (code || has(/don hang|don cua toi|kiem tra don|tra don|giao den dau|bao gio nhan|my order|order status|track/)) {
    const orders = await myOrders(token);
    if (!orders) return out(t('Bạn đăng nhập để mình xem đơn hàng giúp nhé.', 'Please log in so I can check your orders.'),
      { links: [{ label: t('Đăng nhập', 'Log in'), href: 'dangnhap.html?next=index.html' }] });
    const pick = code ? orders.filter((o) => o.code === code) : orders.filter((o) => !['completed', 'cancelled'].includes(o.status)).slice(0, 3);
    if (!pick.length) return out(code ? t(`Mình không thấy đơn ${code} trong tài khoản của bạn.`, `I can't find order ${code} in your account.`)
      : t('Bạn không có đơn nào đang xử lý. Tất cả đơn đã giao hoặc đã hủy.', 'You have no orders in progress — all are delivered or cancelled.'),
      { links: [{ label: t('Xem lịch sử đơn hàng', 'Order history'), href: 'taikhoan.html' }] });
    return out(pick.map((o) => `• ${o.code} (${money(o.total)}): ${STATUS[lang][o.status]}` + (o.paymentStatus === 'unpaid' && o.paymentMethod !== 'cod' ? t(' — chưa thanh toán', ' — awaiting payment') : '')).join('\n'),
      { links: pick.map((o) => ({ label: t('Chi tiết ', 'Details ') + o.code, href: `donhang.html?id=${o.id}` })) });
  }

  if (has(/phi ship|phi giao|phi van chuyen|freeship|mien phi giao|ship bao nhieu|giao mat bao lau|bao lau nhan|shipping|delivery/))
    return out(t(`Phí giao hàng ${money(SHOP.shipFee)}/đơn, MIỄN PHÍ cho đơn từ ${money(SHOP.freeShipFrom)}. Thời gian nhận hàng thường 2–4 ngày, nội thành nhanh hơn.`,
      `Shipping is ${money(SHOP.shipFee)} per order, FREE from ${money(SHOP.freeShipFrom)}. Delivery usually takes 2–4 days, faster within the city.`));
  if (has(/doi tra|tra hang|hoan tien|doi hang|bi loi|return|refund|exchange/))
    return out(t(`GLOWÉ nhận đổi trả trong ${SHOP.returnDays} ngày nếu sản phẩm lỗi hoặc giao sai, còn nguyên tem. Đơn đã thanh toán online mà bị hủy sẽ được hoàn tiền. Liên hệ ${SHOP.hotline} để được hỗ trợ.`,
      `GLOWÉ accepts returns within ${SHOP.returnDays} days for defective or wrong items with seals intact. Cancelled prepaid orders are refunded. Call ${SHOP.hotline} for help.`));
  if (has(/thanh toan|tra tien|the ngan hang|\bcod\b|vi dien tu|the test|payment|pay |card/))
    return out(t('Bạn có thể trả bằng COD (tiền mặt khi nhận), thẻ ngân hàng hoặc ví điện tử. Đây là thanh toán giả lập, không trừ tiền thật. Thẻ test: 4111 1111 1111 1111 (thành công), 4000 0000 0000 0002 (bị từ chối).',
      'You can pay by COD (cash on delivery), bank card or e-wallet. Payments are simulated — no real money is charged. Test card: 4111 1111 1111 1111 (success), 4000 0000 0000 0002 (declined).'));
  if (has(/ma giam|voucher|coupon|glowe10|ma khuyen mai|promo code/))
    return out(t('Hiện bước thanh toán chưa có ô nhập mã giảm giá. Các sản phẩm dưới đây đang được giảm giá trực tiếp:', 'Checkout does not support promo codes yet. These products are discounted directly:'),
      { products: recommend(await catalog(), ' sale ').map(card) });
  if (has(/quen mat khau|doi mat khau|dang ky|tao tai khoan|tai khoan|password|sign up|register|account/))
    return out(t(`Bạn tạo tài khoản ở trang Đăng nhập → Đăng ký (chỉ mất 30 giây). Quên mật khẩu thì gọi ${SHOP.hotline} hoặc email ${SHOP.email} để được đặt lại.`,
      `Create an account via Log in → Sign up (30 seconds). Forgot your password? Call ${SHOP.hotline} or email ${SHOP.email}.`),
      { links: [{ label: t('Đăng nhập / Đăng ký', 'Log in / Sign up'), href: 'dangnhap.html' }] });
  if (has(/hotline|lien he|so dien thoai|nhan vien|tu van vien|gap nguoi|contact|human|staff/))
    return out(t(`Hotline ${SHOP.hotline} (${SHOP.hours} mỗi ngày) · Email ${SHOP.email}.`, `Hotline ${SHOP.hotline} (${SHOP.hours} daily) · Email ${SHOP.email}.`));
  if (has(/chinh hang|hang that|fake|authentic|nguon goc/))
    return out(t('Tất cả sản phẩm tại GLOWÉ đều chính hãng 100%, có nguồn gốc rõ ràng.', 'All products at GLOWÉ are 100% authentic with clear origin.'));

  const recs = recommend(await catalog(), n);
  if (recs?.length)
    return out(t('Mình chọn mấy sản phẩm hợp với bạn nè:', 'Here are some picks for you:'), { products: recs.map(card),
      suggestions: SUGGEST[lang].filter((s) => !unaccent(s).includes(unaccent(message))).slice(0, 3) });
  if (recs) return out(t('Mình chưa tìm được sản phẩm phù hợp với yêu cầu này. Bạn thử nới ngân sách hoặc mô tả loại da nhé.',
    'I couldn\'t find a matching product. Try a higher budget or tell me your skin type.'), { suggestions: SUGGEST[lang] });

  if (has(/cam on|thanks|thank you|tks/)) return out(t('Không có chi! Cần gì cứ nhắn mình nha 💕', 'You\'re welcome! Message me anytime 💕'));
  if (has(/^ ?(xin chao|chao|hello|hi|hey|alo)\b/))
    return out(t('Chào bạn! Mình là Glowie, trợ lý của GLOWÉ. Mình có thể gợi ý mỹ phẩm theo loại da, tra đơn hàng và giải đáp về giao hàng, thanh toán, đổi trả.',
      'Hi! I\'m Glowie, GLOWÉ\'s assistant. I can recommend products for your skin, track orders and answer shipping, payment and return questions.'), { suggestions: SUGGEST[lang] });
  return out(t('Mình chưa hiểu ý bạn lắm 😅 Bạn thử hỏi về loại da, sản phẩm, đơn hàng hoặc giao hàng nhé.',
    'Sorry, I didn\'t quite get that 😅 Try asking about your skin type, products, orders or shipping.'), { suggestions: SUGGEST[lang] });
}

// ---------- 2. AI (Claude) ----------
// Giới hạn 30 lượt AI / phút cho cả hệ thống để không tốn chi phí ngoài ý muốn; vượt -> dùng bộ luật
let aiWindow = { at: 0, n: 0 };
const aiAllowed = () => {
  if (Date.now() - aiWindow.at > 60000) aiWindow = { at: Date.now(), n: 0 };
  return ++aiWindow.n <= 30;
};

async function ai(message, lang, token, history) {
  const [list, orders] = await Promise.all([catalog(), myOrders(token)]);
  const products = list.map((p) => `#${p.id} | ${p.name} | ${p.brand} | ${p.categoryName} | ${money(p.price)}${p.oldPrice ? ` (gốc ${money(p.oldPrice)})` : ''} | ${p.stock > 0 ? 'còn ' + p.stock : 'HẾT HÀNG'} | da: ${p.skinType || 'mọi loại'} | ${p.description || ''}`).join('\n');
  const orderText = orders ? (orders.slice(0, 8).map((o) => `${o.code} | ${money(o.total)} | ${STATUS.vi[o.status]} | thanh toán: ${o.paymentStatus} | id ${o.id}`).join('\n') || 'Chưa có đơn') : 'Khách chưa đăng nhập';
  const system = `Bạn là Glowie, trợ lý mua sắm của GLOWÉ — cửa hàng mỹ phẩm trực tuyến (đồ án sinh viên, thanh toán giả lập).
Trả lời bằng ${lang === 'en' ? 'tiếng Anh' : 'tiếng Việt'}, thân thiện, ngắn gọn (tối đa ~100 từ), văn bản thuần, không dùng markdown tiêu đề hay bảng.
CHỈ dùng thông tin dưới đây; không bịa sản phẩm, giá, chương trình hay chính sách. Không biết thì nói không biết và đưa hotline.
Khi gợi ý sản phẩm: chọn tối đa 4 sản phẩm còn hàng, nêu ngắn lý do, rồi kết thúc câu trả lời bằng đúng 1 dòng dạng [[SP:id1,id2]].
Khi khách hỏi đơn hàng: dùng danh sách đơn bên dưới; thêm [[DON:id]] để hiện nút xem chi tiết.
Không chẩn đoán bệnh da; dị ứng, viêm, mụn nặng thì khuyên gặp bác sĩ da liễu. Câu hỏi ngoài mỹ phẩm/cửa hàng: lịch sự từ chối và quay lại chủ đề.
Mã giảm giá: bước thanh toán CHƯA hỗ trợ nhập mã.

CHÍNH SÁCH: phí giao ${money(SHOP.shipFee)}, miễn phí từ ${money(SHOP.freeShipFrom)}; giao 2–4 ngày; đổi trả ${SHOP.returnDays} ngày nếu lỗi/giao sai; thanh toán COD, thẻ, ví điện tử (giả lập; thẻ test 4111 1111 1111 1111 thành công, 4000 0000 0000 0002 bị từ chối); hotline ${SHOP.hotline} (${SHOP.hours}), email ${SHOP.email}.

SẢN PHẨM (id | tên | thương hiệu | danh mục | giá | tồn | loại da | mô tả):
${products}

ĐƠN HÀNG CỦA KHÁCH (mã | tổng | trạng thái | thanh toán | id):
${orderText}`;
  const messages = [...history, { role: 'user', text: message }].map((m) => ({ role: m.role, content: m.text }));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'content-type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 500, system, messages }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let reply = (await res.json()).content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  const ids = [...reply.matchAll(/\[\[SP:([\d,\s]+)\]\]/g)].flatMap((m) => m[1].split(',').map(Number));
  const orderIds = [...reply.matchAll(/\[\[DON:(\d+)\]\]/g)].map((m) => Number(m[1]));
  reply = reply.replace(/\[\[(SP|DON):[^\]]*\]\]/g, '').trim();
  const byId = new Map(list.map((p) => [p.id, p]));
  return {
    reply, source: 'ai', suggestions: [],
    products: [...new Set(ids)].map((id) => byId.get(id)).filter(Boolean).slice(0, 4).map(card),
    links: orderIds.map((id) => orders?.find((o) => o.id === id)).filter(Boolean)
      .map((o) => ({ label: (lang === 'en' ? 'Details ' : 'Chi tiết ') + o.code, href: `donhang.html?id=${o.id}` })),
  };
}

module.exports = service('assistant', [
  ['POST', '/assistant/chat', async (ctx) => {
    const message = str(ctx.body.message, 500);
    if (!message) throw new HttpError(400, 'Vui lòng nhập câu hỏi');
    const lang = ctx.body.lang === 'en' ? 'en' : 'vi';
    const token = (ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
    // Lịch sử hội thoại do trình duyệt gửi: chỉ giữ 8 lượt gần nhất, đúng vai, cắt độ dài, bắt đầu bằng lượt của khách
    const history = (Array.isArray(ctx.body.history) ? ctx.body.history : []).slice(-8)
      .filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.text === 'string' && m.text.trim())
      .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
    while (history[0]?.role === 'assistant') history.shift();
    for (let i = history.length - 1; i > 0; i--) if (history[i].role === history[i - 1].role) history.splice(i, 1); // xen kẽ user/assistant
    if (history.at(-1)?.role === 'user') history.pop();

    if (AI_KEY && aiAllowed()) {
      try { return await ai(message, lang, token, history); }
      catch (e) { console.error('[assistant] AI lỗi, dùng bộ luật:', e.message); }
    }
    return { ...(await rules(message, lang, token)), source: 'rules' };
  }],
  ['GET', '/assistant/info', () => ({ name: 'Glowie', mode: AI_KEY ? 'ai' : 'rules' })],
], module);
