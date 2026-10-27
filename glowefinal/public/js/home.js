// Trang chủ: danh mục, lọc thương hiệu, sắp xếp, tìm kiếm — trạng thái lọc giữ trên URL
let showFilter = () => '';
const state = { q: params.get('q') || '', category: params.get('category') || '', brand: params.get('brand') || '', sort: params.get('sort') || '' };

async function loadProducts() {
  const qs = new URLSearchParams(Object.entries(state).filter(([, v]) => v));
  history.replaceState(null, '', qs.size ? '?' + qs : location.pathname);
  const grid = $('#products');
  try {
    const list = await api('/api/products?' + qs);
    $('#count').textContent = `${list.length} sản phẩm` + showFilter() + (state.q ? ` cho “${state.q}”` : '');
    grid.innerHTML = list.length ? list.map(productCard).join('')
      : '<div class="empty" style="grid-column:1/-1"><div class="icon">🔍</div>Không tìm thấy sản phẩm phù hợp.</div>';
  } catch (e) {
    grid.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

async function init() {
  const brands = await api('/api/brands');
  // Ô danh mục: bấm để lọc, bấm lại ô đang chọn để bỏ lọc. Danh mục không có ô (vd. Làm sạch) vẫn lọc được từ menu "Sản phẩm".
  const tiles = $('#categories');
  const isOn = (b) => (b.dataset.cat ? b.dataset.cat === state.category && !state.q : b.dataset.q === state.q && !state.category);
  const markActive = () => {
    $$('button', tiles).forEach(b => { b.classList.toggle('active', isOn(b)); b.setAttribute('aria-pressed', String(isOn(b))); });
    $('#clearFilter').hidden = !state.category && !state.q;
  };
  markActive();
  tiles.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const on = isOn(b);
    state.category = on ? '' : b.dataset.cat || '';
    state.q = on ? '' : b.dataset.q || '';
    markActive();
    loadProducts();
    $('#count').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#clearFilter').onclick = () => { state.category = state.q = ''; markActive(); loadProducts(); };
  const cats = (await catsReady);
  const catName = (slug) => cats.find(c => c.slug === slug)?.name;
  showFilter = () => state.category && catName(state.category) ? ` · ${catName(state.category)}` : '';

  $('#brand').insertAdjacentHTML('beforeend', brands.map(b => `<option>${esc(b)}</option>`).join(''));
  $('#brand').value = state.brand;
  $('#sort').value = state.sort;
  $('#brand').onchange = (e) => { state.brand = e.target.value; loadProducts(); };
  $('#sort').onchange = (e) => { state.sort = e.target.value; loadProducts(); };
  loadProducts();
}

init().catch(e => toast(e.message, true));

// ---------- Sale hôm nay ----------
async function loadSale() {
  const list = (await api('/api/products?sort=sale')).filter(p => p.oldPrice && p.stock > 0).slice(0, 8);
  if (!list.length) return;
  $('#saleRow').innerHTML = list.map(productCard).join('');
  $('#sale').hidden = false;
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const end = new Date(); end.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
    $('#cdH').textContent = pad(Math.floor(s / 3600)); $('#cdM').textContent = pad(Math.floor(s / 60) % 60); $('#cdS').textContent = pad(s % 60);
  };
  tick(); setInterval(tick, 1000);
}
loadSale().catch(() => {});
