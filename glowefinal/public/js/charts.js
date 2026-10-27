// Biểu đồ SVG tự vẽ — không cần thư viện/CDN, chạy cả khi không có mạng. Màu lấy từ biến CSS nên tự đổi theo nền sáng/tối.
const PALETTE = ['var(--rose-deep)', 'var(--gold)', 'var(--info)', 'var(--ok)', 'var(--warn)', 'var(--bad)', 'var(--muted)'];

// 1.250.000 -> "1,3 tr" ; 45.000 -> "45k"
const shortMoney = (n) => n >= 1e6 ? (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: n >= 1e7 ? 0 : 1 }) + ' tr'
  : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);

// Làm tròn trục lên số "đẹp": 3.840.000 -> 4.000.000
function niceMax(v) {
  if (v <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step * 2) / 2 * step;
}

/** Biểu đồ vùng/đường. points: [{label, value, tip}] */
function areaChart(points, { format = String } = {}) {
  const W = 640, H = 240, L = 52, R = 14, T = 14, B = 30;
  const n = points.length, max = niceMax(Math.max(...points.map(p => p.value), 0));
  const step = (W - L - R) / Math.max(n - 1, 1);
  const x = (i) => L + i * step, y = (v) => H - B - (v / max) * (H - T - B);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const grid = [0, 1, 2, 3, 4].map(k => {
    const v = max * k / 4, yy = y(v).toFixed(1);
    return `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="axis" x="${L - 8}" y="${yy}" text-anchor="end" dy="4">${esc(format(v))}</text>`;
  }).join('');
  const every = Math.ceil(n / 8);
  // Nhãn cách đều; nhãn cuối chỉ hiện khi không đè lên nhãn liền trước
  const xlabels = points.map((p, i) => (i % every === 0 || (i === n - 1 && (n - 1) % every >= every / 2))
    ? `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>` : '').join('');
  const hits = points.map((p, i) => `<rect class="hit" x="${(x(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${H - T - B}" data-tip="${esc(p.tip)}"/>
    <circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="5"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ theo ngày">
    <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--rose-deep);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--rose-deep);stop-opacity:0"/></linearGradient></defs>
    ${grid}${xlabels}
    <path class="area" d="M${x(0)},${H - B} L${pts.join(' L')} L${x(n - 1)},${H - B} Z"/>
    <polyline class="line" points="${pts.join(' ')}"/>
    ${hits}
  </svg>`;
}

/** Biểu đồ cột đứng. items: [{label, value, tip}] */
function barChart(items, { format = String } = {}) {
  const W = 520, H = 240, L = 46, R = 10, T = 14, B = 34;
  const max = niceMax(Math.max(...items.map(i => i.value), 0));
  const slot = (W - L - R) / items.length, bw = Math.min(56, slot * .6);
  const y = (v) => H - B - (v / max) * (H - T - B);
  const grid = [0, 1, 2, 3, 4].map(k => {
    const v = max * k / 4, yy = y(v).toFixed(1);
    return `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="axis" x="${L - 8}" y="${yy}" text-anchor="end" dy="4">${esc(format(v))}</text>`;
  }).join('');
  const bars = items.map((it, i) => {
    const cx = L + slot * i + slot / 2, top = y(it.value);
    return `<rect class="bar" x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - top).toFixed(1)}" rx="6"
        style="fill:${PALETTE[i % PALETTE.length]};animation-delay:${i * 80}ms" data-tip="${esc(it.tip)}"/>
      <text class="axis" x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle">${esc(it.label)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ cột">${grid}${bars}</svg>`;
}

/** Biểu đồ tròn khuyết. items: [{label, value}] ; center: chữ ở giữa */
function donutChart(items, { center = '', sub = '', format = String } = {}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const r = 60, C = 2 * Math.PI * r;
  let offset = 0;
  const segs = items.map((it, i) => {
    const len = it.value / total * C;
    const seg = `<circle r="${r}" cx="80" cy="80" style="stroke:${PALETTE[i % PALETTE.length]};animation-delay:${i * 90}ms"
      stroke-dasharray="${Math.max(len - 2, 0).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 80 80)" data-tip="${esc(`${it.label}: ${format(it.value)} (${Math.round(it.value / total * 100)}%)`)}"/>`;
    offset += len;
    return seg;
  }).join('');
  const legend = items.map((it, i) => `<div><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(it.label)}<b>${esc(format(it.value))}</b></div>`).join('');
  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 160 160" role="img" aria-label="Biểu đồ tròn">${segs}
      <text class="center" x="80" y="80" text-anchor="middle" dy="4">${esc(center)}</text>
      <text class="center-sub" x="80" y="98" text-anchor="middle">${esc(sub)}</text></svg>
    <div class="legend">${legend}</div>
  </div>`;
}

/** Thanh ngang (HTML). items: [{label, value, note}] */
function hBars(items) {
  const max = Math.max(...items.map(i => i.value), 1);
  return `<div class="hbars">${items.map((it, i) => `<div class="hbar">
      <div class="top"><span>${esc(it.label)}</span><b>${esc(it.note ?? it.value)}</b></div>
      <div class="track"><div class="fill" style="width:${(it.value / max * 100).toFixed(1)}%;animation-delay:${i * 90}ms"></div></div>
    </div>`).join('')}</div>`;
}

// Số chạy từ 0 lên giá trị thật
function countUp(el, to, format = String, ms = 900) {
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = format(Math.round(to * e));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Tooltip dùng chung cho mọi phần tử có data-tip
document.addEventListener('mousemove', (e) => {
  const tip = $('#tip'), t = e.target.closest?.('[data-tip]');
  if (!tip) return;
  if (!t) { tip.classList.remove('show'); return; }
  tip.textContent = t.dataset.tip;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = (e.clientY - 36) + 'px';
  tip.classList.add('show');
});
