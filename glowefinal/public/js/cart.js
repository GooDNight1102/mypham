// Giỏ hàng: ghép [{id, qty}] trong localStorage với giá/tồn kho mới nhất từ server
const FREE_SHIP_FROM = 500000, SHIP_FEE = 30000; // chỉ để hiển thị — server tự tính lại khi đặt hàng

// Dùng chung với thanhtoan.js: trả về các dòng hợp lệ + tự loại sản phẩm đã ngừng bán
async function loadCartLines() {
  const items = Cart.get();
  if (!items.length) return [];
  const products = await api('/api/products');
  const byId = new Map(products.map(p => [p.id, p]));
  const lines = items.filter(i => byId.has(i.id)).map(i => {
    const p = byId.get(i.id);
    return { ...p, qty: Math.min(i.qty, Math.max(p.stock, 1)) };
  });
  if (lines.length !== items.length) Cart.set(lines.map(l => ({ id: l.id, qty: l.qty })));
  return lines;
}

function totals(lines) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const ship = subtotal >= FREE_SHIP_FROM || !subtotal ? 0 : SHIP_FEE;
  return { subtotal, ship, total: subtotal + ship };
}

function summaryHtml(lines) {
  const t = totals(lines);
  const left = FREE_SHIP_FROM - t.subtotal;
  return `<div class="line"><span>Tạm tính</span><span>${money(t.subtotal)}</span></div>
    <div class="line"><span>Phí giao hàng</span><span>${t.ship ? money(t.ship) : 'Miễn phí'}</span></div>
    ${left > 0 ? `<div class="note-box">Mua thêm <b>${money(left)}</b> để được miễn phí giao hàng.</div>` : ''}
    <div class="line total"><span>Tổng cộng</span><span class="price">${money(t.total)}</span></div>`;
}

async function renderCart() {
  const box = $('#cart');
  if (!box) return; // file này cũng được nạp ở trang thanh toán
  const lines = await loadCartLines();
  if (!lines.length) {
    box.innerHTML = '<div class="card empty"><div class="icon">🛍</div><p>Giỏ hàng đang trống.</p><a class="btn" href="index.html">Tiếp tục mua sắm</a></div>';
    return;
  }
  box.innerHTML = `<div class="layout-2">
    <div class="card">${lines.map(l => `
      <div class="line-item" data-id="${l.id}">
        <a href="sanpham.html?id=${l.id}">${thumb(l)}</a>
        <div><a href="sanpham.html?id=${l.id}"><b>${esc(l.name)}</b></a>
          <div class="small muted">${esc(l.brand)} · ${money(l.price)}</div>
          ${l.stock === 0 ? '<div class="error">Sản phẩm đã hết hàng — vui lòng xóa khỏi giỏ.</div>' : ''}</div>
        <div class="qty"><input type="number" min="1" max="${Math.min(99, l.stock)}" value="${l.qty}" aria-label="Số lượng ${esc(l.name)}"></div>
        <b class="line-total">${money(l.price * l.qty)}</b>
        <button class="icon-btn" data-remove aria-label="Xóa ${esc(l.name)}">✕</button>
      </div>`).join('')}
    </div>
    <aside class="card summary">
      <h3>Tóm tắt đơn hàng</h3>
      ${summaryHtml(lines)}
      <a class="btn block" href="thanhtoan.html" style="margin-top:16px" ${lines.some(l => l.stock === 0) ? 'aria-disabled="true" onclick="return false"' : ''}>Tiến hành thanh toán</a>
    </aside>
  </div>`;

  box.onchange = (e) => {
    const row = e.target.closest('.line-item');
    const max = Number(e.target.max) || 1;
    Cart.update(Number(row.dataset.id), Math.max(1, Math.min(max, Math.floor(Number(e.target.value)) || 1)));
    renderCart();
  };
  box.onclick = (e) => {
    if (!e.target.closest('[data-remove]')) return;
    Cart.remove(Number(e.target.closest('.line-item').dataset.id));
    renderCart();
  };
}

renderCart().catch(e => toast(e.message, true));
