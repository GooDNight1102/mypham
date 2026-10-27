// Tài khoản: tổng hợp mua hàng, tiến độ đơn, lịch sử, sửa hồ sơ. Thông báo nằm ở chuông trên header (common.js).
const STEPS = [['placed', 'Đã đặt hàng', '🛍'], ['confirmed', 'Đã xác nhận', '✅'], ['shipping', 'Đang giao', '🚚'], ['completed', 'Đã nhận hàng', '🎉']];
const STEP_OF = { pending: 0, confirmed: 1, shipping: 2, completed: 3 };
const ACTIVE = ['pending', 'confirmed', 'shipping'];

let orders = [];

// Thời điểm đơn đạt từng bước = thông báo đầu tiên cùng loại
function stepTimes(orderId) {
  const t = {};
  for (const n of notes.items) if (n.orderId === orderId) t[n.type] = n.createdAt; // danh sách mới -> cũ: giữ lần sớm nhất
  return t;
}

// ---------- Tổng hợp ----------
function renderSummary() {
  const valid = orders.filter(o => o.status !== 'cancelled');
  const paid = orders.filter(o => o.paymentStatus === 'paid');
  const active = orders.filter(o => ACTIVE.includes(o.status));
  const done = orders.filter(o => o.status === 'completed');
  const card = (ico, label, value, fmt, sub) => `<div class="card stat"><span class="ico">${ico}</span>
    <div class="label">${label}</div><div class="value" data-count="${value}" data-fmt="${fmt}">0</div><span class="small muted">${sub}</span></div>`;
  $('#summary').innerHTML =
    card('🛍', 'Tổng đơn đã mua', valid.length, 'num', `${orders.length - valid.length} đơn đã hủy`) +
    card('💰', 'Tổng tiền đã chi', paid.reduce((s, o) => s + o.total, 0), 'money', `trên ${paid.length} đơn đã thanh toán`) +
    card('🚚', 'Đang xử lý', active.length, 'num', active.length ? 'xem tiến độ bên dưới' : 'không có đơn đang chờ') +
    card('🎉', 'Đã nhận hàng', done.length, 'num', `${done.reduce((s, o) => s + Number(o.itemCount), 0)} sản phẩm`);
  $$('[data-count]', $('#summary')).forEach(el => countUp(el, Number(el.dataset.count), el.dataset.fmt === 'money' ? money : (n) => n.toLocaleString('vi-VN')));
}

// ---------- Tiến độ đơn đang xử lý ----------
function stepper(o) {
  const at = STEP_OF[o.status], times = stepTimes(o.id);
  const p = at / (STEPS.length - 1); // 0 → 1
  return `<div class="tracker" style="--p:${p}">
    ${STEPS.map(([type, label, icon], i) => `<div class="tk-step ${i < at ? 'done' : i === at ? 'now' : ''}">
      <span class="tk-dot">${i <= at ? icon : ''}</span>
      <b>${label}</b><small>${times[type] ? fmtDate(times[type]) : i <= at ? '' : '—'}</small>
    </div>`).join('')}
  </div>`;
}

function renderProgress() {
  const active = orders.filter(o => ACTIVE.includes(o.status));
  $('#activeCount').textContent = active.length ? `${active.length} đơn đang xử lý` : '';
  $('#progress').innerHTML = active.length ? active.map(o => {
    const waitPay = o.status === 'pending' && o.paymentMethod !== 'cod' && o.paymentStatus !== 'paid';
    return `<article class="track-card">
      <div class="track-top">
        <div><a href="donhang.html?id=${o.id}"><b>${esc(o.code)}</b></a>
          <div class="small muted">${o.itemCount} sản phẩm · ${money(o.total)} · ${esc(LABEL.method[o.paymentMethod])}</div></div>
        ${pill('status', o.status)}
      </div>
      ${stepper(o)}
      ${waitPay ? `<div class="note-box">💳 Đơn đang chờ thanh toán. <a class="auth-link" href="donhang.html?id=${o.id}">Thanh toán ngay →</a></div>` : ''}
    </article>`;
  }).join('') : `<div class="empty"><div class="icon">📦</div>Không có đơn nào đang xử lý.<p><a class="btn" href="index.html">Mua sắm ngay</a></p></div>`;
}

// ---------- Lịch sử ----------
function renderHistory() {
  const f = $('#histFilter').value;
  const list = orders.filter(o => !f || (f === 'active' ? ACTIVE.includes(o.status) : o.status === f));
  $('#orders').innerHTML = list.length ? `<table>
    <thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th class="num">SL</th><th class="num">Tổng tiền</th><th>Tiến độ</th></tr></thead>
    <tbody>${list.map(o => `<tr>
      <td><a href="donhang.html?id=${o.id}"><b>${esc(o.code)}</b></a></td>
      <td class="small">${fmtDate(o.createdAt)}</td>
      <td class="num">${o.itemCount}</td>
      <td class="num">${money(o.total)}</td>
      <td>${o.status === 'cancelled' ? '' : `<div class="mini-bar" title="${esc(LABEL.status[o.status])}"><i style="width:${(STEP_OF[o.status] + 1) * 25}%"></i></div>`}
        ${pill('status', o.status)}</td>
    </tr>`).join('')}</tbody></table>`
    : `<div class="empty"><div class="icon">🧾</div>${orders.length ? 'Không có đơn phù hợp.' : 'Bạn chưa có đơn hàng nào.'}</div>`;
}

$('#histFilter').onchange = renderHistory;

(async () => {
  const user = await requireLogin();
  $('#accHello').textContent = `Xin chào, ${user.fullName}`;
  $('#accAvatar').textContent = user.fullName.trim().split(/\s+/).pop()[0]?.toUpperCase() || 'G';
  if (user.createdAt) $('#accSince').textContent = 'Thành viên từ ' + fmtDate(user.createdAt).split(' ').pop();

  const form = $('#profile');
  form.email.value = user.email;
  form.fullName.value = user.fullName;
  form.phone.value = user.phone;
  form.address.value = user.address || '';
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('.error', form);
    err.textContent = '';
    if (!form.checkValidity()) { err.textContent = 'Họ tên bắt buộc; SĐT gồm 10 số bắt đầu bằng 0.'; return; }
    try {
      await api('/api/users/me', { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
      toast('Đã lưu thông tin');
    } catch (ex) { err.textContent = ex.message; }
  };

  // Đơn + thông báo (lấy giờ của từng bước tiến độ) gọi song song
  [orders] = await Promise.all([api('/api/orders'), loadNotes(true)]);
  renderSummary();
  renderProgress();
  renderHistory();
  // Có thông báo mới (mở chuông) -> vẽ lại giờ các bước
  document.addEventListener('noteschange', renderProgress);
})().catch(e => e.message !== 'redirect' && toast(e.message, true));
