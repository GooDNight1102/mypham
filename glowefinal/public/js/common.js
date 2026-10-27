// Dùng chung mọi trang: gọi API, phiên đăng nhập, sáng/tối, giỏ hàng (localStorage), header, định dạng tiền, toast
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Chống XSS: mọi dữ liệu đưa vào innerHTML đều đi qua esc()
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫';
const fmtDate = (s) => new Date(s.replace(' ', 'T')).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const params = new URLSearchParams(location.search);

const LABEL = {
  status: { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', shipping: 'Đang giao', completed: 'Hoàn thành', cancelled: 'Đã hủy' },
  payment: { unpaid: 'Chưa thanh toán', paid: 'Đã thanh toán', failed: 'Thanh toán lỗi', refunded: 'Đã hoàn tiền', success: 'Thành công' },
  method: { cod: 'Thanh toán khi nhận hàng (COD)', card: 'Thẻ ngân hàng', ewallet: 'Ví điện tử' }
};
const pill = (group, key) => `<span class="pill ${esc(key)}">${esc(LABEL[group][key] ?? key)}</span>`;

// Token đăng nhập (do User Service cấp, hạn 7 ngày) gửi kèm mọi request qua Gateway.
// "Ghi nhớ 7 ngày" bật -> localStorage (giữ khi đóng trình duyệt); tắt -> sessionStorage (mất khi đóng tab)
const Auth = {
  key: 'glowe_token',
  get token() { return sessionStorage.getItem(this.key) || localStorage.getItem(this.key); },
  save(token, remember = true) { this.clear(); (remember ? localStorage : sessionStorage).setItem(this.key, token); },
  clear() { localStorage.removeItem(this.key); sessionStorage.removeItem(this.key); }
};

// ---------- Giao diện sáng / tối (lưu lựa chọn; lần đầu theo hệ điều hành) ----------
// Mỗi trang có 1 dòng script trong <head> đặt data-theme trước khi vẽ để không bị nháy màu.
const Theme = {
  get() { return document.documentElement.dataset.theme || 'light'; },
  set(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('glowe_theme', t); } catch {}
    $$('[data-theme-toggle]').forEach(paintToggle);
    document.dispatchEvent(new CustomEvent('themechange'));
  },
  toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); }
};
function paintToggle(b) {
  const dark = Theme.get() === 'dark';
  b.textContent = dark ? '☀️' : '🌙';
  b.title = b.ariaLabel = dark ? 'Chuyển nền sáng' : 'Chuyển nền tối';
}
const themeButton = () => `<button type="button" class="theme-toggle" data-theme-toggle aria-label="Đổi nền sáng/tối"></button>`;
document.addEventListener('click', (e) => { if (e.target.closest('[data-theme-toggle],[data-theme-pill]')) Theme.toggle(); });

async function api(url, { method, body } = {}) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
  const res = await fetch(url, {
    method: method || (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  // data.hint: máy chủ chưa kết nối được CSDL -> hiện luôn cách sửa
  if (!res.ok) throw Object.assign(new Error((data?.error || 'Có lỗi xảy ra, vui lòng thử lại.') + (data?.hint ? ' — ' + data.hint : '')), { status: res.status });
  return data;
}

// ---------- Giỏ hàng: chỉ lưu [{id, qty}], giá luôn lấy lại từ server ----------
const Cart = {
  key: 'glowe_cart',
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; } },
  set(items) { localStorage.setItem(this.key, JSON.stringify(items)); updateCartBadge(); },
  add(id, qty = 1) {
    const items = this.get(), it = items.find(i => i.id === id);
    if (it) it.qty = Math.min(99, it.qty + qty); else items.push({ id, qty });
    this.set(items);
  },
  update(id, qty) { this.set(this.get().map(i => (i.id === id ? { ...i, qty } : i))); },
  remove(id) { this.set(this.get().filter(i => i.id !== id)); },
  clear() { this.set([]); },
  count() { return this.get().reduce((s, i) => s + i.qty, 0); }
};

// Ảnh sản phẩm: có link thì dùng ảnh, không thì ô màu theo danh mục + icon
function thumb(p, extra = '') {
  const off = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const tag = p.stock === 0 ? '<span class="tag out">Hết hàng</span>' : off ? `<span class="tag">-${off}%</span>` : '';
  const inner = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy">` : `<span aria-hidden="true">${esc(p.icon)}</span>`;
  return `<div class="thumb ${extra}" data-cat="${esc(p.categorySlug)}">${inner}${tag}</div>`;
}

const priceHtml = (p) => `<span class="price">${money(p.price)}</span>${p.oldPrice ? `<span class="old">${money(p.oldPrice)}</span>` : ''}`;

function productCard(p) {
  return `<article class="product">
    <a href="sanpham.html?id=${p.id}">${thumb(p)}</a>
    <div class="body">
      <span class="brand">${esc(p.brand)}</span>
      <a class="name" href="sanpham.html?id=${p.id}">${esc(p.name)}</a>
      <div class="foot">
        <div>${priceHtml(p)}</div>
        <button class="btn sm ghost" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''} aria-label="Thêm ${esc(p.name)} vào giỏ">+ Giỏ</button>
      </div>
    </div>
  </article>`;
}

// Nút "+ Giỏ" trên mọi lưới sản phẩm
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  Cart.add(Number(btn.dataset.add));
  toast('Đã thêm vào giỏ hàng');
});

let toastTimer;
function toast(msg, bad = false) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function updateCartBadge() {
  const el = $('#cart-count');
  if (!el) return;
  const n = String(Cart.count());
  if (el.textContent !== n && el.textContent !== '') { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  el.textContent = n;
  el.hidden = n === '0';
}

// ---------- Người dùng hiện tại + header ----------
let currentUser = null;
const userReady = (Auth.token ? api('/api/users/me') : Promise.resolve(null))
  .then(u => (currentUser = u))
  .catch(() => { Auth.clear(); return null; }) // token hết hạn hoặc tài khoản bị khóa
  .finally(renderHeader);

// Danh mục dùng cho menu "Sản phẩm" và trang chủ (tải 1 lần)
const catsReady = api('/api/categories').catch(() => []);

// Icon nét mảnh cho header
const svg = (d) => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  bag: svg('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  down: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
};
const TOP_MSGS = ['Miễn phí giao hàng cho đơn từ 500.000₫', 'Thành viên mới nhập mã GLOWE10 giảm 10%', 'Cam kết 100% mỹ phẩm chính hãng'];
// ponytail: mã GLOWE10 chỉ là chữ trang trí, chưa có logic mã giảm giá ở Order Service

async function renderHeader() {
  const h = $('#site-header');
  if (!h) return;
  const u = currentUser, cats = await catsReady;
  const catLinks = cats.map(c => `<a href="index.html?category=${esc(c.slug)}#shop"><span>${esc(c.icon)}</span>${esc(c.name)}</a>`).join('');
  const accLinks = u
    ? `<a href="taikhoan.html">Tài khoản của tôi</a>${u.role === 'admin' ? '<a href="admin.html">Trang quản trị</a>' : ''}<a href="#" data-logout>Đăng xuất</a>`
    : '<a href="dangnhap.html">Đăng nhập</a><a href="dangnhap.html?mode=register">Đăng ký</a>';
  h.className = 'site-header-wrap';
  h.innerHTML = `
  <div class="topbar"><div class="container">
    <span class="topbar-msg" id="topMsg">${TOP_MSGS[0]}</span>
    <div class="topbar-right">
      <a href="index.html?sort=sale#shop">Khuyến mãi</a><a href="tel:19000000">Hotline 1900 0000</a>
      <span class="theme-pill lang-pill"><button type="button" data-lang="vi">VI</button>/<button type="button" data-lang="en">EN</button></span>
      <button type="button" class="theme-pill" data-theme-pill aria-label="Đổi nền sáng/tối"><span data-t="light">Sáng</span>/<span data-t="dark">Tối</span></button>
    </div>
  </div></div>
  <div class="site-header"><div class="container header-in">
    <div class="header-left">
      <button type="button" class="action-btn burger" id="burger" aria-label="Mở menu" aria-expanded="false">${ICON.menu}</button>
      <a class="logo" href="index.html">GLOW<span>É</span></a>
    </div>
    <nav class="header-nav" id="mainNav" aria-label="Menu chính">
      <a href="index.html#shop">Mới</a>
      <div class="mega">
        <button type="button" class="mega-trigger">Sản phẩm ${ICON.down}</button>
        <div class="mega-pop"><div class="mega-cats">${catLinks}</div></div>
      </div>
      <a href="index.html?sort=sale#shop">Khuyến mãi</a>
      <a href="taikhoan.html">Hội viên</a>
      <div class="nav-account">${accLinks}</div>
    </nav>
    <div class="header-actions">
      <button type="button" class="action-btn" id="searchBtn" aria-label="Tìm kiếm" aria-expanded="false">${ICON.search}</button>
      ${u ? bellMenu() : ''}
      <a class="action-btn" href="giohang.html" aria-label="Giỏ hàng">${ICON.bag}<span class="badge-count" id="cart-count"></span></a>
      <div class="acc">
        <a class="action-btn" href="${u ? 'taikhoan.html' : 'dangnhap.html'}" aria-label="Tài khoản">${ICON.user}${u ? `<i class="acc-dot">${esc(u.fullName.trim().slice(0, 1).toUpperCase())}</i>` : ''}</a>
        <div class="acc-pop">${u ? `<b>${esc(u.fullName)}</b>` : ''}${accLinks}</div>
      </div>
    </div>
  </div>
  <form class="search-panel" id="searchPanel" action="index.html" role="search" ${params.get('q') ? '' : 'hidden'}><div class="container">
    <div class="search-box">
      <input name="q" placeholder="Tìm son, serum, kem chống nắng..." value="${esc(params.get('q') || '')}" aria-label="Tìm kiếm"
        autocomplete="off" role="combobox" aria-expanded="false" aria-controls="suggest">
      <div class="suggest" id="suggest" role="listbox" hidden></div>
    </div>
    <button class="btn">Tìm kiếm</button>
  </div></form></div>`;
  setupSuggest($('#searchPanel'));

  updateCartBadge();
  setupBell();
  refreshBell();
  const toggle = (btn, el, open = el.hidden) => { el.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  $('#searchBtn').onclick = () => { const p = $('#searchPanel'); toggle($('#searchBtn'), p); if (!p.hidden) p.q.focus(); };
  $('#burger').onclick = () => $('#burger').setAttribute('aria-expanded', String(h.classList.toggle('nav-open')));
  $$('[data-logout]', h).forEach(a => a.onclick = (e) => { e.preventDefault(); Auth.clear(); location.href = 'index.html'; });
  let i = 0;
  setInterval(() => { const m = $('#topMsg'); m.classList.remove('swap'); void m.offsetWidth; m.textContent = TOP_MSGS[++i % TOP_MSGS.length]; m.classList.add('swap'); }, 4500);
}

// ---------- Gợi ý khi gõ tìm kiếm ----------
// Gõ chữ -> sau 200ms gọi /api/products?q= (tìm không dấu sẵn có), hiện tối đa 6 sản phẩm.
// Ô trống -> hiện từ khóa phổ biến. Phím ↑ ↓ để chọn, Enter để mở, Esc để đóng.
const HOT_WORDS = ['son', 'serum', 'chống nắng', 'tẩy trang', 'nước hoa', 'body'];
function setupSuggest(form) {
  const input = form.q, box = $('#suggest', form);
  let timer, seq = 0, active = -1;
  const open = (html) => { box.innerHTML = html; box.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1; };
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const hot = () => open(`<p class="sg-title">Tìm kiếm phổ biến</p><div class="sg-hot">${HOT_WORDS.map(w => `<a href="index.html?q=${encodeURIComponent(w)}#shop">${esc(w)}</a>`).join('')}</div>`);
  const search = async () => {
    const q = input.value.trim();
    if (!q) return hot();
    const my = ++seq;
    const list = await api('/api/products?q=' + encodeURIComponent(q)).catch(() => []);
    if (my !== seq) return; // đã gõ tiếp, bỏ kết quả cũ
    const all = `index.html?q=${encodeURIComponent(q)}#shop`;
    open(`<p class="sg-title">Gợi ý sản phẩm</p>` + (list.length
      ? list.slice(0, 6).map(p => `<a class="sg-item" role="option" href="sanpham.html?id=${p.id}">${thumb(p, 'mini')}
          <span class="sg-name"><b>${esc(p.name)}</b><small>${esc(p.brand)}</small></span><span class="sg-price">${priceHtml(p)}</span></a>`).join('')
        + `<a class="sg-all" role="option" href="${all}">Xem tất cả kết quả (${list.length}) →</a>`
      : '<p class="sg-empty">Không có gợi ý phù hợp</p>'));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 200); });
  input.addEventListener('focus', search);
  input.addEventListener('keydown', (e) => {
    const items = $$('a', box);
    if (e.key === 'Escape') return close();
    if (box.hidden || !items.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); location.href = items[active].href; } return; }
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((a, i) => a.classList.toggle('active', i === active));
    items[active].scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
}

// Footer chung: dải cam kết + cột thông tin + nút hỗ trợ nổi
const BENEFITS = [['✅', 'Cam kết', 'Chính hãng 100%'], ['🎁', 'Ưu đãi', 'Dành cho hội viên'], ['🚚', 'Miễn phí giao', 'Đơn từ 500K'],
  ['💳', 'Thanh toán', 'An toàn, đa dạng'], ['🔄', 'Đổi trả', 'Trong 7 ngày'], ['☎️', 'Hỗ trợ', '1900 0000']];
async function renderFooter() {
  const f = $('#site-footer');
  if (!f) return;
  const cats = await catsReady;
  f.className = 'site-footer';
  f.innerHTML = `<div class="container">
    <div class="benefits">${BENEFITS.map(([ic, a, b]) => `<div><span class="b-ic">${ic}</span><b>${a}<br>${b}</b></div>`).join('')}</div>
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="logo" href="index.html">GLOW<span>É</span></a>
        <p>Cửa hàng mỹ phẩm trực tuyến: chăm sóc da, trang điểm, chống nắng và nước hoa.</p>
        <h4>Phương thức thanh toán</h4>
        <div class="pay"><span class="visa">VISA</span><span class="mc"><i></i><i></i></span><span class="jcb">JCB</span><span>COD</span><span>Ví điện tử</span></div>
      </div>
      <div><h4>Danh mục</h4><ul>${cats.map(c => `<li><a href="index.html?category=${esc(c.slug)}#shop">${esc(c.name)}</a></li>`).join('')}</ul></div>
      <div><h4>Khách hàng</h4><ul><li><a href="taikhoan.html">Tài khoản &amp; hội viên</a></li><li><a href="taikhoan.html">Theo dõi đơn hàng</a></li>
        <li><a href="giohang.html">Giỏ hàng</a></li><li><a href="dangnhap.html">Đăng nhập / Đăng ký</a></li></ul></div>
      <div><h4>Hỗ trợ</h4><ul><li>Hotline: <a href="tel:19000000">1900 0000</a></li><li>Email: <a href="mailto:hotro@glowe.vn">hotro@glowe.vn</a></li>
        <li>8:00 – 22:00 mỗi ngày</li><li>Miễn phí giao hàng từ 500.000₫</li></ul></div>
    </div>
    <p class="foot-legal">© 2026 GLOWÉ — Đồ án hệ thống bán mỹ phẩm. Thanh toán trên website là giả lập, không trừ tiền thật.</p>
  </div>
`;
  setupChat();
}

// ---------- Trợ lý Glowie: khung chat nổi góc phải (gọi Assistant Service /api/assistant/chat) ----------
// Lịch sử lưu trong sessionStorage (mất khi đóng tab); gửi kèm 8 lượt gần nhất để trợ lý hiểu ngữ cảnh.
const CHAT_KEY = 'glowe_chat';
const chatLang = () => (typeof Lang !== 'undefined' ? Lang.get() : 'vi');
const CHAT_HELLO = {
  vi: { text: 'Chào bạn! Mình là Glowie ✨ Mình có thể gợi ý mỹ phẩm theo loại da và ngân sách, tra đơn hàng, giải đáp về giao hàng, thanh toán, đổi trả.',
    suggestions: ['Gợi ý cho da dầu mụn', 'Son dưới 200k', 'Sản phẩm đang sale', 'Đơn hàng của tôi', 'Phí giao hàng?'] },
  en: { text: 'Hi! I\'m Glowie ✨ I can recommend products for your skin and budget, track your orders and answer shipping, payment and return questions.',
    suggestions: ['Products for oily skin', 'Lipstick under 200k', 'What\'s on sale?', 'My orders', 'Shipping fee?'] },
};
function setupChat() {
  if ($('#chatBox')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <button type="button" class="fab-help" id="chatFab" aria-expanded="false" aria-controls="chatBox"><span>💬</span><b>Cần hỗ trợ?</b></button>
  <section class="chat" id="chatBox" role="dialog" aria-label="Trợ lý Glowie" hidden>
    <header class="chat-head">
      <span class="chat-ava" aria-hidden="true">✨</span>
      <div><b>Glowie</b><small>Trợ lý mua sắm GLOWÉ</small></div>
      <button type="button" class="chat-x" id="chatReset" title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới">↺</button>
      <button type="button" class="chat-x" id="chatClose" aria-label="Đóng">✕</button>
    </header>
    <div class="chat-log" id="chatLog" aria-live="polite"></div>
    <div class="chat-sugg" id="chatSugg"></div>
    <form class="chat-form" id="chatForm" autocomplete="off">
      <input name="m" maxlength="500" placeholder="Hỏi Glowie về sản phẩm, đơn hàng..." aria-label="Tin nhắn">
      <button class="btn" aria-label="Gửi">➤</button>
    </form>
  </section>`);
  const box = $('#chatBox'), log = $('#chatLog'), form = $('#chatForm');
  let msgs = [], busy = false;
  try { msgs = JSON.parse(sessionStorage.getItem(CHAT_KEY)) || []; } catch {}
  const save = () => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-30))); } catch {} };

  const bubble = (m) => `<div class="msg ${m.role}">
    <div class="bubble">${esc(m.text).replace(/\n/g, '<br>')}</div>
    ${m.products?.length ? `<div class="msg-products">${m.products.map((p) => `<div class="msg-prod">
      <a href="sanpham.html?id=${p.id}">${thumb(p, 'mini')}</a>
      <a class="mp-name" href="sanpham.html?id=${p.id}"><b>${esc(p.name)}</b><small>${esc(p.brand)}</small>${priceHtml(p)}</a>
      <button type="button" class="btn sm" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''} aria-label="Thêm ${esc(p.name)} vào giỏ">+ Giỏ</button>
    </div>`).join('')}</div>` : ''}
    ${m.links?.length ? `<div class="msg-links">${m.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)} →</a>`).join('')}</div>` : ''}
  </div>`;
  const render = () => {
    const hello = CHAT_HELLO[chatLang()];
    log.innerHTML = bubble({ role: 'assistant', text: hello.text }) + msgs.map(bubble).join('') + (busy ? '<div class="msg assistant"><div class="bubble typing"><i></i><i></i><i></i></div></div>' : '');
    const last = msgs.at(-1);
    const sugg = busy ? [] : last ? (last.role === 'assistant' ? last.suggestions || [] : []) : hello.suggestions;
    $('#chatSugg').innerHTML = sugg.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join('');
    log.scrollTop = log.scrollHeight;
  };
  const open = (yes) => {
    box.hidden = !yes;
    $('#chatFab').setAttribute('aria-expanded', String(yes));
    $('#chatFab').classList.toggle('active', yes);
    if (yes) { render(); form.m.focus(); }
  };
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    const history = msgs.slice(-8).map(({ role, text }) => ({ role, text }));
    msgs.push({ role: 'user', text });
    busy = true; render(); save();
    try {
      const r = await api('/api/assistant/chat', { body: { message: text, lang: chatLang(), history } });
      msgs.push({ role: 'assistant', text: r.reply, products: r.products, links: r.links, suggestions: r.suggestions });
    } catch (e) {
      msgs.push({ role: 'assistant', text: (chatLang() === 'en' ? 'Sorry, I can\'t answer right now: ' : 'Xin lỗi, mình chưa trả lời được lúc này: ') + e.message });
    }
    busy = false; render(); save();
  }
  $('#chatFab').onclick = () => open(box.hidden);
  $('#chatClose').onclick = () => open(false);
  $('#chatReset').onclick = () => { msgs = []; save(); render(); };
  form.onsubmit = (e) => { e.preventDefault(); send(form.m.value); form.m.value = ''; };
  $('#chatSugg').onclick = (e) => { const c = e.target.closest('.chip'); if (c) send(c.textContent); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) open(false); });
}
renderFooter();

// ---------- Chuông thông báo: menu nổi trên header ----------
// Máy tính: di chuột tới là mở, bấm chuông để ghim mở/đóng. Điện thoại: chạm để mở/đóng.
const NOTE_ICON = { placed: '🛍', confirmed: '✅', payment_failed: '⚠️', shipping: '🚚', completed: '🎉', cancelled: '❌' };
const NOTE_GROUP = { placed: 'placed', confirmed: 'confirmed', shipping: 'delivery', completed: 'delivery', payment_failed: 'other', cancelled: 'other' };
let notes = { unread: 0, items: [] }, noteFilter = '';

// "5 phút trước", "3 giờ trước", "2 ngày trước", quá 7 ngày thì hiện ngày giờ
function timeAgo(s) {
  const sec = (Date.now() - new Date(s.replace(' ', 'T'))) / 1000;
  if (sec < 60) return 'Vừa xong';
  if (sec < 3600) return Math.floor(sec / 60) + ' phút trước';
  if (sec < 86400) return Math.floor(sec / 3600) + ' giờ trước';
  if (sec < 7 * 86400) return Math.floor(sec / 86400) + ' ngày trước';
  return fmtDate(s);
}

const bellMenu = () => `<div class="bell-wrap" id="bellWrap">
  <button type="button" class="action-btn bell" id="bellBtn" aria-haspopup="true" aria-expanded="false" aria-label="Thông báo" title="Thông báo">${ICON.bell}<span class="badge-count" id="bellCount" hidden></span></button>
  <div class="notif-pop" role="dialog" aria-label="Thông báo">
    <div class="pop-head"><b>Thông báo</b><button type="button" class="auth-link" id="popReadAll" hidden>Đánh dấu đã đọc</button></div>
    <div class="chips notif-filter" id="popFilter">
      <button type="button" class="chip active" data-f="">Tất cả</button><button type="button" class="chip" data-f="placed">Đặt hàng</button>
      <button type="button" class="chip" data-f="confirmed">Xác nhận</button><button type="button" class="chip" data-f="delivery">Giao &amp; nhận</button>
      <button type="button" class="chip" data-f="other">Khác</button>
    </div>
    <ul class="notif-list" id="popList"><li class="empty small">Đang tải...</li></ul>
    <a class="pop-foot" href="taikhoan.html">Xem tiến độ đơn hàng của tôi →</a>
  </div>
</div>`;

function paintBell() {
  const b = $('#bellCount');
  if (!b) return;
  b.hidden = !notes.unread;
  b.textContent = notes.unread > 99 ? '99+' : notes.unread;
  $('#popReadAll').hidden = !notes.unread;
}

function renderPop() {
  const list = notes.items.filter(n => !noteFilter || NOTE_GROUP[n.type] === noteFilter);
  $('#popList').innerHTML = list.length ? list.map(n => `<li>
      <a class="notif ${n.isRead ? '' : 'unread'} t-${n.type}" href="donhang.html?id=${n.orderId}" data-note="${n.id}">
        <span class="n-ico">${NOTE_ICON[n.type]}</span>
        <span class="n-text"><b>${esc(n.title)}</b><span>${esc(n.body)}</span><small>${timeAgo(n.createdAt)}</small></span>
      </a></li>`).join('')
    : '<li class="empty small">Chưa có thông báo nào.</li>';
}

// Chỉ đếm số chưa đọc (gọi ở mọi trang, nhẹ)
function refreshBell() {
  if (!$('#bellCount') || !currentUser) return;
  api('/api/orders/notifications/unread').then(({ unread }) => { notes.unread = unread; paintBell(); }).catch(() => {});
}

// Tải danh sách đầy đủ khi menu mở; mỗi lần mở lại tải mới (tối đa 1 lần / 5 giây)
let notesAt = 0;
async function loadNotes(force = false) {
  if (!force && Date.now() - notesAt < 5000) return notes;
  notesAt = Date.now();
  notes = await api('/api/orders/notifications');
  paintBell();
  if ($('#popList')) renderPop();
  document.dispatchEvent(new CustomEvent('noteschange'));
  return notes;
}

function setupBell() {
  const wrap = $('#bellWrap');
  if (!wrap) return;
  const setOpen = (open) => {
    // điện thoại: menu đặt ngay dưới chuông (header cao thấp tùy màn hình)
    if (open) wrap.style.setProperty('--pop-top', Math.round($('#bellBtn').getBoundingClientRect().bottom + 10) + 'px');
    wrap.classList.toggle('open', open);
    $('#bellBtn').setAttribute('aria-expanded', String(open));
  };
  wrap.addEventListener('mouseenter', () => loadNotes().catch(() => {}));
  $('#bellBtn').onclick = () => {
    const open = !wrap.classList.contains('open');
    setOpen(open);
    if (open) loadNotes().catch(e => toast(e.message, true));
  };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  $('#popFilter').onclick = (e) => {
    const c = e.target.closest('[data-f]');
    if (!c) return;
    noteFilter = c.dataset.f;
    $$('#popFilter .chip').forEach(x => x.classList.toggle('active', x === c));
    renderPop();
  };
  // Bấm 1 thông báo: đánh dấu đã đọc rồi mở đơn
  $('#popList').onclick = async (e) => {
    const a = e.target.closest('[data-note]');
    if (!a || !a.classList.contains('unread')) return;
    e.preventDefault();
    await api('/api/orders/notifications/read', { body: { ids: [Number(a.dataset.note)] } }).catch(() => {});
    location.href = a.href;
  };
  $('#popReadAll').onclick = async () => {
    await api('/api/orders/notifications/read', { body: {} });
    toast('Đã đánh dấu tất cả là đã đọc');
    loadNotes(true);
  };
}

// Trang cần đăng nhập: chuyển sang đăng nhập rồi quay lại
async function requireLogin(role) {
  await userReady;
  if (!currentUser || (role && currentUser.role !== role)) {
    location.href = currentUser ? 'index.html' // đã đăng nhập nhưng sai quyền
      : 'dangnhap.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
    throw new Error('redirect');
  }
  return currentUser;
}

window.addEventListener('storage', updateCartBadge); // đồng bộ số lượng giữa các tab
document.addEventListener('DOMContentLoaded', () => $$('[data-theme-toggle]').forEach(paintToggle));
