// Trang quản trị: Dashboard (biểu đồ), xử lý đơn, CRUD mỹ phẩm, khóa/mở người dùng. Điều hướng bằng #hash.
const view = $('#view');
const NEXT = { pending: ['confirmed', 'cancelled'], confirmed: ['shipping', 'cancelled'], shipping: ['completed'], completed: [], cancelled: [] };
const ACTION = { confirmed: 'Xác nhận đơn', shipping: 'Bắt đầu giao', completed: 'Đã giao xong', cancelled: 'Hủy đơn' };
const TITLES = {
  dashboard: ['Dashboard', 'Tổng quan kinh doanh 30 ngày gần nhất'],
  orders: ['Đơn hàng', 'Xử lý đơn theo từng bước'],
  products: ['Mỹ phẩm', 'Thêm, sửa, ngừng bán và tồn kho'],
  vouchers: ['Voucher', 'Kho mã giảm giá — tạo, khóa, theo dõi lượt dùng'],
  users: ['Người dùng', 'Khách hàng và tài khoản quản trị'],
};
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let categories = [], products = [], dash = null, dashMetric = 'revenue';

const views = {
  async dashboard() {
    // Gom dữ liệu từ 3 service: Order (doanh thu, đơn), User (khách), Product (tồn kho, danh mục)
    const [stats, users, prods] = await Promise.all([api('/api/orders/stats'), api('/api/users'), api('/api/products?all=1')]);
    dash = { stats, users, prods };
    renderDashboard();
  },

  async orders() {
    const filter = view.dataset.filter || '';
    const orders = await api('/api/orders/all' + (filter ? '?status=' + filter : ''));
    view.innerHTML = `<div class="card"><div class="section-head"><h3 style="margin:0">${orders.length} đơn hàng</h3>
        <select id="order-filter" aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option>
          ${Object.entries(LABEL.status).map(([k, v]) => `<option value="${k}" ${k === filter ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${orders.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th class="num">Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Xử lý</th></tr></thead>
        <tbody>${orders.map(o => `<tr>
          <td><a href="donhang.html?id=${o.id}" target="_blank"><b>${esc(o.code)}</b></a><div class="small muted">${fmtDate(o.createdAt)}</div></td>
          <td>${esc(o.receiverName)}<div class="small muted">${esc(o.phone)}</div></td>
          <td class="num">${money(o.total)}</td>
          <td><span class="small">${o.paymentMethod.toUpperCase()}</span> ${pill('payment', o.paymentStatus)}</td>
          <td>${pill('status', o.status)}</td>
          <td>${NEXT[o.status].map(s => `<button class="btn sm ${s === 'cancelled' ? 'danger' : 'ghost'}" data-order="${o.id}" data-to="${s}">${ACTION[s]}</button>`).join(' ') || '—'}</td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="muted">Không có đơn hàng.</p>'}</div>`;
    $('#order-filter').onchange = (e) => { view.dataset.filter = e.target.value; views.orders(); };
  },

  async products() {
    products = await api('/api/products?all=1');
    view.innerHTML = `<div class="card"><div class="section-head"><h3 style="margin:0">${products.length} mỹ phẩm</h3>
        <button class="btn" data-edit="">+ Thêm mỹ phẩm</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th class="num">Giá</th><th class="num">Tồn</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${products.map(p => `<tr>
          <td><div class="prod-cell">${thumb(p, 'mini')}<div><b>${esc(p.name)}</b><div class="small muted">${esc(p.brand)} · ${esc(p.volume || '')}</div></div></div></td>
          <td>${esc(p.icon)} ${esc(p.categoryName)}</td>
          <td class="num">${money(p.price)}</td>
          <td class="num">${p.stock <= 5 ? `<span class="pill pending">${p.stock}</span>` : p.stock}</td>
          <td>${p.isActive ? '<span class="pill completed">Đang bán</span>' : '<span class="pill refunded">Ngừng bán</span>'}</td>
          <td class="num"><button class="btn sm ghost" data-edit="${p.id}">Sửa</button>
            ${p.isActive ? `<button class="btn sm danger" data-hide="${p.id}">Ngừng bán</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div></div>`;
  },



  async vouchers() {
    const list = await api('/api/vouchers');
    const now = Date.now();
    const active = list.filter(v => v.isActive && (!v.endsAt || new Date(v.endsAt).getTime() >= now));
    const locked = list.filter(v => !v.isActive);
    const expired = list.filter(v => v.endsAt && new Date(v.endsAt).getTime() < now);
    const totalUsed = list.reduce((s, v) => s + (v.usedCount || 0), 0);
    const filter = view.dataset.vFilter || 'all';
    const filtered = list.filter(v => {
      if (filter === 'active') return v.isActive && (!v.endsAt || new Date(v.endsAt).getTime() >= now);
      if (filter === 'locked') return !v.isActive;
      if (filter === 'expired') return v.endsAt && new Date(v.endsAt).getTime() < now;
      return true;
    });

    view.innerHTML = `
      <div class="stats" style="margin-bottom:16px">
        <div class="card stat"><span class="ico">🎟️</span><div class="label">Tổng trong kho</div><div class="value">${list.length}</div></div>
        <div class="card stat"><span class="ico">✅</span><div class="label">Đang mở</div><div class="value">${active.length}</div></div>
        <div class="card stat"><span class="ico">🔒</span><div class="label">Đã khóa</div><div class="value">${locked.length}</div></div>
        <div class="card stat"><span class="ico">📊</span><div class="label">Lượt đã dùng</div><div class="value">${totalUsed}</div></div>
      </div>

      <div class="card">
        <div class="section-head">
          <h3 style="margin:0">${filtered.length} voucher${filter !== 'all' ? ' (đã lọc)' : ''}</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select id="voucher-filter" aria-label="Lọc voucher">
              <option value="all" ${filter === 'all' ? 'selected' : ''}>Tất cả</option>
              <option value="active" ${filter === 'active' ? 'selected' : ''}>Đang mở</option>
              <option value="locked" ${filter === 'locked' ? 'selected' : ''}>Đã khóa</option>
              <option value="expired" ${filter === 'expired' ? 'selected' : ''}>Hết hạn</option>
            </select>
            <button type="button" class="btn" id="voucher-add">+ Tạo voucher mới</button>
          </div>
        </div>
        ${filtered.length ? `<div class="table-wrap"><table>
          <thead><tr>
            <th>Mã</th><th>Loại</th><th class="num">Giá trị</th><th class="num">Đơn tối thiểu</th>
            <th class="num">Đã dùng</th><th>Hết hạn</th><th>Trạng thái</th><th></th>
          </tr></thead>
          <tbody>${filtered.map(v => {
            const val = v.type === 'percent' ? v.value + '%' : money(v.value);
            const limit = v.usageLimit == null ? '∞' : v.usageLimit;
            const isExp = v.endsAt && new Date(v.endsAt).getTime() < now;
            const exp = v.endsAt ? fmtDate(v.endsAt) : 'Không hết hạn';
            const status = !v.isActive
              ? '<span class="pill cancelled">Đã khóa</span>'
              : (isExp ? '<span class="pill pending">Hết hạn</span>' : '<span class="pill completed">Đang mở</span>');
            return `<tr>
              <td>
                <b class="voucher-admin-code">${esc(v.code)}</b>
                <button type="button" class="btn sm ghost" data-copy="${esc(v.code)}" title="Sao chép mã" style="padding:2px 8px;margin-left:4px">📋</button>
                ${v.description ? `<div class="small muted">${esc(v.description)}</div>` : ''}
              </td>
              <td>${v.type === 'percent' ? 'Phần trăm' : 'Số tiền'}</td>
              <td class="num">${val}${v.maxDiscount ? `<div class="small muted">tối đa ${money(v.maxDiscount)}</div>` : ''}</td>
              <td class="num">${v.minOrder ? money(v.minOrder) : '—'}</td>
              <td class="num">${v.usedCount} / ${limit}<div class="small muted">×${v.perUserLimit || 1}/khách</div></td>
              <td class="small">${exp}</td>
              <td>${status}</td>
              <td class="num" style="white-space:nowrap">
                <button type="button" class="btn sm ${v.isActive ? 'danger' : 'ghost'}" data-voucher-toggle="${v.id}" data-active="${v.isActive ? 0 : 1}">${v.isActive ? 'Khóa' : 'Mở'}</button>
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p class="muted" style="margin:0">Chưa có voucher phù hợp bộ lọc. Bấm <b>+ Tạo voucher mới</b> để thêm vào kho.</p>'}
      </div>`;

    $('#voucher-filter').onchange = (e) => { view.dataset.vFilter = e.target.value; views.vouchers(); };
    $('#voucher-add').onclick = openVoucherDialog;
  },

  async users() {
    const [users, orders] = await Promise.all([api('/api/users'), api('/api/orders/all')]);
    // Số đơn / tiền đã chi tính từ dữ liệu Order Service
    const agg = {};
    for (const o of orders) {
      const a = (agg[o.userId] ??= { orders: 0, spent: 0 });
      a.orders++;
      if (o.paymentStatus === 'paid') a.spent += o.total;
    }
    for (const u of users) Object.assign(u, agg[u.id] ?? { orders: 0, spent: 0 });
    view.innerHTML = `<div class="card"><h3>${users.length} tài khoản</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Họ tên</th><th>Liên hệ</th><th>Vai trò</th><th class="num">Đơn</th><th class="num">Đã chi</th><th></th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td><b>${esc(u.fullName)}</b><div class="small muted">Tham gia ${fmtDate(u.createdAt)}</div></td>
          <td>${esc(u.email)}<div class="small muted">${esc(u.phone)}</div></td>
          <td>${u.role === 'admin' ? '<span class="pill confirmed">Admin</span>' : 'Khách hàng'} ${u.isActive ? '' : '<span class="pill cancelled">Đã khóa</span>'}</td>
          <td class="num">${u.orders}</td><td class="num">${money(u.spent)}</td>
          <td class="num">${u.id === currentUser.id ? '' : `<button class="btn sm ${u.isActive ? 'danger' : 'ghost'}" data-user="${u.id}" data-active="${u.isActive ? 0 : 1}">${u.isActive ? 'Khóa' : 'Mở khóa'}</button>`}</td>
        </tr>`).join('')}</tbody></table></div></div>`;
  }
};

// ---------- Dashboard ----------
function renderDashboard() {
  const { stats: s, users, prods } = dash;
  // Đủ 30 ngày (ngày không có đơn = 0)
  const map = Object.fromEntries(s.byDay.map(d => [d.day, d]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i);
    return { date: d, ...(map[ymd(d)] ?? { orders: 0, revenue: 0 }) };
  });
  const sum = (arr, k) => arr.reduce((t, d) => t + d[k], 0);
  const rev30 = sum(days, 'revenue'), ord30 = sum(days, 'orders');
  const last7 = days.slice(-7), prev7 = days.slice(-14, -7);
  const delta = (k) => {
    const a = sum(last7, k), b = sum(prev7, k);
    if (!b) return '';
    const p = Math.round((a - b) / b * 100);
    return `<span class="delta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% so với tuần trước</span>`;
  };
  const paidOrders = s.byMethod.reduce((t, m) => t + m.orders, 0);
  const customers = users.filter(u => u.role === 'customer').length;
  const lowStock = prods.filter(p => p.isActive && p.stock <= 5);

  // Doanh thu theo danh mục: ghép product_id (Order) với danh mục (Product)
  const catOf = Object.fromEntries(prods.map(p => [p.id, p.categoryId]));
  const byCat = categories.map(c => ({
    label: c.name, icon: c.icon,
    value: s.products.filter(p => catOf[p.productId] === c.id).reduce((t, p) => t + p.revenue, 0),
  }));

  const kpi = (ico, label, value, fmt, extra = '') => `<div class="card stat"><span class="ico">${ico}</span>
    <div class="label">${label}</div><div class="value" data-count="${value}" data-fmt="${fmt}">0</div>${extra}</div>`;

  view.innerHTML = `
    <div class="stats">
      ${kpi('💰', 'Doanh thu 30 ngày', rev30, 'money', delta('revenue'))}
      ${kpi('🧾', 'Đơn hàng 30 ngày', ord30, 'num', delta('orders'))}
      ${kpi('🛒', 'Giá trị TB / đơn', s.paid ? Math.round(s.revenue / s.paid) : 0, 'money', '<span class="small muted">trên đơn đã thanh toán</span>')}
      ${kpi('👥', 'Khách hàng', customers, 'num')}
      ${kpi('⏳', 'Chờ xác nhận', s.pending, 'num', s.pending ? '<a class="auth-link" href="#orders" data-goto-pending>Xử lý ngay →</a>' : '')}
      ${kpi('📦', 'Sắp hết hàng (≤ 5)', lowStock.length, 'num', lowStock.length ? `<span class="small muted">${esc(lowStock.map(p => p.name).slice(0, 2).join(', '))}${lowStock.length > 2 ? '…' : ''}</span>` : '')}
    </div>

    <div class="dash-grid">
      <div class="card span-8">
        <div class="card-head"><h3>Doanh thu theo ngày</h3>
          <div class="seg" role="tablist">
            <button data-metric="revenue" class="${dashMetric === 'revenue' ? 'active' : ''}">Doanh thu</button>
            <button data-metric="orders" class="${dashMetric === 'orders' ? 'active' : ''}">Số đơn</button>
          </div></div>
        <div id="trend"></div>
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Trạng thái đơn</h3><span class="small muted">tất cả</span></div>
        ${donutChart(Object.keys(LABEL.status).map(k => ({ label: LABEL.status[k], value: s.byStatus[k] ?? 0 })),
          { center: String(s.orders), sub: 'đơn hàng' })}
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Doanh thu theo danh mục</h3></div>
        ${barChart(byCat.map(c => ({ label: c.label, value: c.value, tip: `${c.icon} ${c.label}: ${money(c.value)}` })), { format: shortMoney })}
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Top 5 bán chạy</h3><span class="small muted">theo số lượng</span></div>
        ${hBars(s.top.map(p => ({ label: p.name, value: p.sold, note: `${p.sold} sp · ${shortMoney(p.revenue)}` })))}
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Phương thức thanh toán</h3></div>
        ${donutChart(s.byMethod.map(m => ({ label: { cod: 'COD', card: 'Thẻ', ewallet: 'Ví điện tử' }[m.method], value: m.orders })),
          { center: String(paidOrders), sub: 'đơn hợp lệ', format: (v) => v + ' đơn' })}
      </div>
      <div class="card span-8">
        <div class="card-head"><h3>Đơn hàng mới nhất</h3><a class="auth-link" href="#orders">Xem tất cả →</a></div>
        <div class="table-wrap"><table><tbody>${s.recent.map(o => `<tr>
          <td><a href="donhang.html?id=${o.id}" target="_blank"><b>${esc(o.code)}</b></a><div class="small muted">${fmtDate(o.createdAt)}</div></td>
          <td>${esc(o.receiverName)}</td><td class="num">${money(o.total)}</td><td>${pill('status', o.status)}</td>
        </tr>`).join('')}</tbody></table></div>
      </div>
    </div>`;

  drawTrend(days);
  $$('[data-count]', view).forEach(el => countUp(el, Number(el.dataset.count), el.dataset.fmt === 'money' ? money : (n) => n.toLocaleString('vi-VN')));
  $$('[data-metric]', view).forEach(b => (b.onclick = () => {
    dashMetric = b.dataset.metric;
    $$('[data-metric]', view).forEach(x => x.classList.toggle('active', x === b));
    drawTrend(days);
  }));
  $('[data-goto-pending]', view)?.addEventListener('click', () => { view.dataset.filter = 'pending'; });
}

function drawTrend(days) {
  const isRev = dashMetric === 'revenue';
  const label = (d) => `${d.date.getDate()}/${d.date.getMonth() + 1}`;
  $('#trend').innerHTML = areaChart(days.map(d => ({
    label: label(d), value: isRev ? d.revenue : d.orders,
    tip: `${label(d)}: ${isRev ? money(d.revenue) : d.orders + ' đơn'}`,
  })), { format: isRev ? shortMoney : (v) => String(Math.round(v)) });
}

// ---------- Điều hướng ----------
async function show() {
  const name = views[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  $$('.admin-side nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  [$('#viewTitle').textContent, $('#viewSub').textContent] = TITLES[name];
  document.title = `${TITLES[name][0]} | GLOWÉ Quản trị`;
  view.innerHTML = '<p class="muted">Đang tải...</p>';
  try { await views[name](); } catch (e) { view.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  refreshPending();
}
const refreshPending = () => api('/api/orders/all?status=pending').then(list => {
  const b = $('#pendingCount');
  b.hidden = !list.length;
  b.textContent = list.length;
}).catch(() => {});

$('.admin-side nav').onclick = (e) => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  if (location.hash === '#' + b.dataset.view) show(); else location.hash = b.dataset.view;
};
addEventListener('hashchange', show);
$('[data-theme-switch]').onclick = () => Theme.toggle();
$('#logout').onclick = () => { Auth.clear(); location.href = 'dangnhap.html'; };

// ---------- Form thêm / sửa mỹ phẩm ----------
const dialog = $('#product-dialog'), pform = $('#product-form');
let editingId = null;

// ---------- Xem trước ảnh trong hộp thoại ----------
// Dùng đúng hàm thumb() của cửa hàng -> thấy y như thẻ sản phẩm (ảnh, nhãn -%, hết hàng, biểu tượng danh mục khi chưa có ảnh)
let previewTimer;
function renderPreview() {
  const d = Object.fromEntries(new FormData(pform));
  const cat = categories.find(c => String(c.id) === d.categoryId) || {};
  const url = d.imageUrl.trim(), valid = /^https?:\/\/\S+$/i.test(url);
  const p = { name: d.name || 'Sản phẩm', imageUrl: valid ? url : '', icon: cat.icon, categorySlug: cat.slug,
    price: Number(d.price) || 0, oldPrice: Number(d.oldPrice) > Number(d.price) ? Number(d.oldPrice) : null, stock: d.stock === '' ? 1 : Number(d.stock) };
  const box = $('#imgPreview'), status = $('#imgStatus');
  box.innerHTML = thumb(p);
  $('#imgClear').hidden = !url;
  status.className = 'small img-status';
  if (!url) { status.textContent = 'Chưa có ảnh: cửa hàng sẽ hiện biểu tượng của danh mục.'; return; }
  if (!valid) { status.textContent = '⚠ Link ảnh phải bắt đầu bằng http:// hoặc https://'; status.classList.add('bad'); return; }
  const img = $('img', box);
  status.textContent = 'Đang tải ảnh...';
  box.classList.add('loading');
  img.onload = () => {
    box.classList.remove('loading');
    status.textContent = `✓ Ảnh hiển thị được (${img.naturalWidth}×${img.naturalHeight}px)` + (img.naturalWidth < 400 ? ' — ảnh hơi nhỏ, nên dùng ảnh từ 600px.' : '');
    status.classList.add('ok');
  };
  img.onerror = () => {
    box.classList.remove('loading');
    img.replaceWith(Object.assign(document.createElement('span'), { textContent: p.icon || '🖼' }));
    status.textContent = '⚠ Không tải được ảnh — kiểm tra lại link (phải là link trực tiếp tới file ảnh, mở được ở tab ẩn danh).';
    status.classList.add('bad');
  };
}
// Gõ link thì đợi 300ms mới tải lại ảnh; đổi giá/danh mục/tồn kho thì vẽ lại ngay
pform.addEventListener('input', (e) => {
  clearTimeout(previewTimer);
  if (e.target.name === 'imageUrl') previewTimer = setTimeout(renderPreview, 300);
  else if (['price', 'oldPrice', 'stock', 'categoryId'].includes(e.target.name)) renderPreview();
});
pform.categoryId.addEventListener('change', renderPreview);
$('#imgClear').onclick = () => { pform.imageUrl.value = ''; renderPreview(); pform.imageUrl.focus(); };

function openProduct(id) {
  const p = products.find(x => x.id === id);
  editingId = p?.id ?? null;
  $('#dialog-title').textContent = p ? 'Sửa mỹ phẩm' : 'Thêm mỹ phẩm';
  $('#product-err').textContent = '';
  pform.reset();
  pform.categoryId.innerHTML = categories.map(c => `<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  if (p) {
    for (const k of ['name', 'brand', 'categoryId', 'price', 'oldPrice', 'stock', 'volume', 'skinType', 'imageUrl', 'description']) pform[k].value = p[k] ?? '';
    pform.isActive.checked = !!p.isActive;
  }
  renderPreview();
  dialog.showModal();
}

pform.onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(pform));
  const body = { ...d, price: Number(d.price), oldPrice: d.oldPrice ? Number(d.oldPrice) : null, stock: Number(d.stock), isActive: pform.isActive.checked };
  try {
    if (editingId) await api('/api/products/' + editingId, { method: 'PUT', body });
    else await api('/api/products', { body });
    dialog.close();
    toast('Đã lưu mỹ phẩm');
    show();
  } catch (ex) { $('#product-err').textContent = ex.message; }
};
$('#product-cancel').onclick = () => dialog.close();


// ---- Voucher dialog (admin) ----
function openVoucherDialog() {
  const f = $('#voucher-form');
  $('#voucher-err').textContent = '';
  f.reset();
  f.isActive.checked = true;
  f.perUserLimit.value = 1;
  f.minOrder.value = 0;
  syncVoucherTypeUI();
  $('#voucher-dialog').showModal();
  f.code.focus();
}
function syncVoucherTypeUI() {
  const isPct = $('#voucher-type').value === 'percent';
  const lab = $('#maxDiscountLabel');
  if (lab) lab.style.opacity = isPct ? '1' : '.45';
  const inp = lab && lab.querySelector('input');
  if (inp) { inp.disabled = !isPct; if (!isPct) inp.value = ''; }
}
$('#voucher-type')?.addEventListener('change', syncVoucherTypeUI);
$('#voucher-cancel').onclick = () => $('#voucher-dialog').close();
$('#voucher-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = $('#voucher-form');
  const d = Object.fromEntries(new FormData(f));
  const body = {
    code: d.code,
    type: d.type,
    value: Number(d.value),
    maxDiscount: d.type === 'percent' && d.maxDiscount ? Number(d.maxDiscount) : null,
    minOrder: Number(d.minOrder) || 0,
    usageLimit: d.usageLimit ? Number(d.usageLimit) : null,
    perUserLimit: Number(d.perUserLimit) || 1,
    endsAt: d.endsAt || null,
    description: d.description || null,
    isActive: f.isActive.checked,
  };
  try {
    await api('/api/vouchers', { body });
    $('#voucher-dialog').close();
    toast('Đã thêm voucher vào kho');
    if (location.hash === '#vouchers') views.vouchers();
    else location.hash = 'vouchers';
  } catch (ex) { $('#voucher-err').textContent = ex.message; }
};

view.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t || t.dataset.metric) return;
  try {
    if ('edit' in t.dataset) return openProduct(Number(t.dataset.edit) || null);
    if (t.dataset.hide) {
      if (!confirm('Ngừng kinh doanh sản phẩm này?')) return;
      await api('/api/products/' + t.dataset.hide, { method: 'DELETE' });
    } else if (t.dataset.order) {
      if (t.dataset.to === 'cancelled' && !confirm('Hủy đơn và hoàn kho?')) return;
      await api('/api/orders/' + t.dataset.order + '/status', { method: 'PATCH', body: { status: t.dataset.to } });
    } else if (t.dataset.user) {
      await api('/api/users/' + t.dataset.user, { method: 'PATCH', body: { isActive: t.dataset.active === '1' } });
    } else if (t.dataset.voucherToggle) {
      await api('/api/vouchers/' + t.dataset.voucherToggle, { method: 'PATCH', body: { isActive: t.dataset.active === '1' } });
    } else if (t.dataset.copy) {
      try {
        await navigator.clipboard.writeText(t.dataset.copy);
        toast('Đã sao chép mã ' + t.dataset.copy);
      } catch { toast('Không sao chép được', true); }
      return;
    } else return;
    toast('Đã cập nhật');
    show();
  } catch (ex) { toast(ex.message, true); }
});

// Đổi nền: vẽ lại biểu đồ để gradient/nhãn nhận màu mới
document.addEventListener('themechange', () => { if (dash && view.querySelector('#trend')) renderDashboard(); });

(async () => {
  const me = await requireLogin('admin'); // chưa đăng nhập -> dangnhap.html?next=admin.html
  $('#adminName').textContent = me.fullName;
  $('#avatar').textContent = me.fullName.trim().split(/\s+/).pop()[0]?.toUpperCase() || 'A';
  categories = await api('/api/categories');
  show();
})().catch(e => e.message !== 'redirect' && toast(e.message, true));
