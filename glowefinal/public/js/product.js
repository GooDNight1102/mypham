// Chi tiết sản phẩm + chọn số lượng + sản phẩm liên quan
(async () => {
  const box = $('#detail');
  let p;
  try {
    p = await api('/api/products/' + encodeURIComponent(params.get('id')));
  } catch (e) {
    box.innerHTML = `<div class="empty"><div class="icon">🫙</div>${esc(e.message)}<p><a class="btn" href="index.html">Về trang chủ</a></p></div>`;
    return;
  }
  document.title = `${p.name} | GLOWÉ`;
  $('#crumb-cat').textContent = p.categoryName;
  $('#crumb-cat').href = 'index.html?category=' + encodeURIComponent(p.categorySlug);

  const stockText = p.stock === 0 ? '<span class="pill cancelled">Hết hàng</span>'
    : p.stock <= 5 ? `<span class="pill pending">Chỉ còn ${p.stock}</span>` : '<span class="pill completed">Còn hàng</span>';

  box.innerHTML = `<div class="detail">
    ${thumb(p)}
    <div>
      <span class="brand" style="color:var(--gold);font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:.8rem">${esc(p.brand)}</span>
      <h1>${esc(p.name)}</h1>
      <div>${priceHtml(p)}</div>
      <dl class="specs">
        <dt>Dung tích</dt><dd>${esc(p.volume || '—')}</dd>
        <dt>Loại da</dt><dd>${esc(p.skinType || 'Mọi loại da')}</dd>
        <dt>Tình trạng</dt><dd>${stockText}</dd>
      </dl>
      <p>${esc(p.description || '')}</p>
      <div class="actions">
        <div class="qty">
          <button type="button" data-step="-1" aria-label="Giảm">−</button>
          <input id="qty" type="number" min="1" max="${Math.min(99, p.stock)}" value="1" aria-label="Số lượng">
          <button type="button" data-step="1" aria-label="Tăng">+</button>
        </div>
        <button class="btn" id="add" ${p.stock === 0 ? 'disabled' : ''}>Thêm vào giỏ</button>
        <button class="btn ghost" id="buy" ${p.stock === 0 ? 'disabled' : ''}>Mua ngay</button>
      </div>
      <div class="note-box">🚚 Miễn phí giao hàng cho đơn từ 500.000₫ · Đổi trả trong 7 ngày nếu sản phẩm lỗi.</div>
    </div>
  </div>`;

  const qtyInput = $('#qty');
  const clamp = () => (qtyInput.value = Math.max(1, Math.min(Number(qtyInput.max), Math.floor(Number(qtyInput.value)) || 1)));
  qtyInput.onchange = clamp;
  $$('[data-step]').forEach(b => (b.onclick = () => { qtyInput.value = Number(qtyInput.value) + Number(b.dataset.step); clamp(); }));
  $('#add').onclick = () => { Cart.add(p.id, Number(clamp())); toast('Đã thêm vào giỏ hàng'); };
  $('#buy').onclick = () => { Cart.add(p.id, Number(clamp())); location.href = 'giohang.html'; };

  const related = (await api('/api/products?category=' + encodeURIComponent(p.categorySlug))).filter(x => x.id !== p.id).slice(0, 4);
  if (related.length) {
    $('#related').innerHTML = related.map(productCard).join('');
    $('#related-wrap').hidden = false;
  }
})();
