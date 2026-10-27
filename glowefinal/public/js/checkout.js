// Thanh toán: kho voucher + áp mã giảm giá + tạo đơn
(async () => {
  const user = await requireLogin();
  const lines = await loadCartLines();
  if (!lines.length) { location.href = 'giohang.html'; return; }

  const form = $('#checkout');
  form.receiverName.value = user.fullName;
  form.phone.value = user.phone;
  form.address.value = user.address || '';

  let applied = null; // { code, discount, description }
  let available = [];

  $('#lines').innerHTML = lines.map(l =>
    `<div class="line small"><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.price * l.qty)}</span></div>`).join('');

  function renderSum() {
    const t = totals(lines);
    const discount = applied ? applied.discount : 0;
    const total = Math.max(0, t.total - discount);
    const left = FREE_SHIP_FROM - t.subtotal;
    $('#sum').innerHTML = `
      ${applied ? `<div class="voucher-applied-hint">✓ ${esc(applied.description || ('Giảm ' + money(applied.discount)))}</div>` : ''}
      <div class="line"><span>Tạm tính</span><span>${money(t.subtotal)}</span></div>
      <div class="line"><span>Phí giao hàng</span><span>${t.ship ? money(t.ship) : 'Miễn phí'}</span></div>
      ${discount ? `<div class="line voucher-discount"><span>Giảm giá <b>${esc(applied.code)}</b> <button type="button" class="voucher-remove" id="removeVoucher">Bỏ</button></span><span>-${money(discount)}</span></div>` : ''}
      ${left > 0 && !discount ? `<div class="note-box">Mua thêm <b>${money(left)}</b> để được miễn phí giao hàng.</div>` : ''}
      <div class="line total"><span>Tổng cộng</span><span class="price">${money(total)}</span></div>`;
    $('#removeVoucher')?.addEventListener('click', () => {
      applied = null;
      $('#voucherCode').value = '';
      $('#voucherMsg').textContent = '';
      renderSum();
      renderVault();
    });
  }

  function descOf(v) {
    if (v.description) return v.description;
    const base = v.type === 'percent'
      ? `Giảm ${v.value}%${v.maxDiscount ? ` tối đa ${money(v.maxDiscount)}` : ''}`
      : `Giảm ${money(v.value)}`;
    return base + (v.minOrder ? ` cho đơn từ ${money(v.minOrder)}` : '');
  }

  function renderVault() {
    const box = $('#voucherList');
    if (!available.length) {
      box.innerHTML = '<p class="small muted" id="voucherEmpty">Chưa có voucher khả dụng. Hãy nhập mã ở trên nếu bạn có mã riêng.</p>';
      return;
    }
    box.innerHTML = available.map(v => {
      const using = applied && applied.code === v.code;
      const btn = using
        ? '<span class="voucher-using">Đang dùng</span>'
        : (v.usable
          ? `<button type="button" class="voucher-use" data-code="${esc(v.code)}">Dùng</button>`
          : `<span class="voucher-locked" title="${esc(v.reason || '')}">${esc(v.reason || 'Chưa đủ điều kiện')}</span>`);
      return `<div class="voucher-item ${using ? 'is-using' : ''} ${v.usable ? '' : 'is-locked'}">
        <div class="voucher-item-body">
          <b class="voucher-code">${esc(v.code)}</b>
          <span class="voucher-desc">${esc(descOf(v))}</span>
        </div>
        ${btn}
      </div>`;
    }).join('');
  }

  async function applyCode(code, { silent } = {}) {
    const c = (code || '').trim().toUpperCase();
    const msg = $('#voucherMsg');
    msg.textContent = '';
    msg.className = 'small';
    if (!c) {
      applied = null;
      renderSum();
      renderVault();
      if (!silent) msg.textContent = 'Đã bỏ mã giảm giá.';
      return;
    }
    try {
      const t = totals(lines);
      const r = await api('/api/vouchers/validate', { body: { code: c, subtotal: t.subtotal } });
      applied = { code: r.code, discount: r.discount, description: r.description || descOf(r) };
      $('#voucherCode').value = r.code;
      msg.textContent = '';
      renderSum();
      renderVault();
    } catch (err) {
      if (!silent) {
        msg.textContent = err.message;
        msg.classList.add('error');
      }
      // giữ applied cũ nếu chỉ fail khi gõ tay
    }
  }

  $('#applyVoucher').onclick = () => applyCode($('#voucherCode').value);

  $('#voucherList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-code]');
    if (!btn) return;
    applyCode(btn.dataset.code);
  });

  // Enter trong ô mã = áp dụng
  $('#voucherCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyCode($('#voucherCode').value); }
  });

  // Tải kho voucher
  try {
    const t = totals(lines);
    available = await api('/api/vouchers/available?subtotal=' + t.subtotal);
  } catch {
    available = [];
  }
  renderVault();
  renderSum();

  form.onsubmit = async (e) => {
    e.preventDefault();
    $('#err').textContent = '';
    if (!form.checkValidity()) {
      $('#err').textContent = 'Vui lòng điền đủ thông tin; số điện thoại gồm 10 số bắt đầu bằng 0.';
      form.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    if (applied) data.voucherCode = applied.code;
    else delete data.voucherCode;
    $('#submit').disabled = true;
    try {
      const order = await api('/api/orders', { body: { ...data, items: Cart.get().map(i => ({ productId: i.id, quantity: i.qty })) } });
      Cart.clear();
      location.href = `donhang.html?id=${order.id}&new=1`;
    } catch (err) {
      $('#err').textContent = err.message;
      $('#submit').disabled = false;
    }
  };
})().catch(e => e.message !== 'redirect' && toast(e.message, true));
