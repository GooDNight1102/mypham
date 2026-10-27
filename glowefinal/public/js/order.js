// Chi tiết đơn + cổng thanh toán giả lập (thẻ / ví) + hủy đơn
const orderId = params.get('id');
const FLOW = ['pending', 'confirmed', 'shipping', 'completed'];

function paymentPanel(o) {
  if (o.paymentMethod === 'card') return `
    <form id="pay" class="card" novalidate style="margin-bottom:20px">
      <h3>💳 Cổng thanh toán thẻ (giả lập)</h3>
      <div class="test-cards">Thẻ test (bấm để điền):
        <code data-card="4111111111111111">4111 1111 1111 1111</code> thành công ·
        <code data-card="4000000000000002">4000 0000 0000 0002</code> bị từ chối ·
        <code data-card="4000000000009995">4000 0000 0000 9995</code> không đủ tiền.
        Hạn dùng bất kỳ ở tương lai, CVV 3 số bất kỳ.</div>
      <label>Số thẻ <input name="cardNumber" inputmode="numeric" autocomplete="off" maxlength="19" placeholder="1234 5678 9012 3456"></label>
      <label>Tên chủ thẻ <input name="holder" autocomplete="off" placeholder="NGUYEN VAN A" style="text-transform:uppercase"></label>
      <div class="row">
        <label>Hết hạn (MM/YY) <input name="expiry" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="12/28"></label>
        <label>CVV <input name="cvv" inputmode="numeric" autocomplete="off" maxlength="3" type="password"></label>
      </div>
      <p class="error" id="pay-err"></p>
      <button class="btn block">Thanh toán ${money(o.total)}</button>
      <p class="small muted" style="margin:8px 0 0">🔒 Môi trường giả lập — không trừ tiền thật, hệ thống chỉ lưu 4 số cuối thẻ.</p>
    </form>`;
  return `
    <form id="pay" class="card" novalidate style="margin-bottom:20px;text-align:center">
      <h3>📱 Thanh toán ví điện tử (giả lập)</h3>
      <p class="muted small">Quét mã bằng ứng dụng ví, sau đó nhập số điện thoại ví để xác nhận.</p>
      <div class="fake-qr" role="img" aria-label="Mã QR giả lập"></div>
      <p><b>${money(o.total)}</b> · Nội dung: ${esc(o.code)}</p>
      <label style="text-align:left">SĐT ví <input name="walletPhone" inputmode="numeric" maxlength="10" placeholder="09xxxxxxxx"></label>
      <p class="small muted" style="text-align:left">Test: số kết thúc bằng <code>0000</code> sẽ báo “ví không đủ số dư”.</p>
      <p class="error" id="pay-err"></p>
      <button class="btn block">Tôi đã thanh toán</button>
    </form>`;
}

async function render() {
  await requireLogin();
  const box = $('#order');
  let o;
  try {
    // Đơn (Order Service) + lịch sử thanh toán (Payment Service) gọi song song
    const [order, payments] = await Promise.all([
      api('/api/orders/' + encodeURIComponent(orderId)),
      api('/api/payments?orderId=' + encodeURIComponent(orderId))
    ]);
    o = { ...order, payments };
  } catch (e) { box.innerHTML = `<div class="card empty"><div class="icon">📦</div>${esc(e.message)}</div>`; return; }

  const needPay = o.status === 'pending' && o.paymentMethod !== 'cod' && ['unpaid', 'failed'].includes(o.paymentStatus);
  const step = FLOW.indexOf(o.status);
  const isNew = params.has('new');

  box.innerHTML = `
    ${isNew && !needPay ? '<div class="note-box" style="font-size:1rem">🎉 Đặt hàng thành công! Cảm ơn bạn đã mua sắm tại GLOWÉ.</div>' : ''}
    <div class="section-head">
      <h1 style="margin:0">Đơn ${esc(o.code)}</h1>
      <div>${pill('status', o.status)} ${pill('payment', o.paymentStatus)}</div>
    </div>
    ${o.status === 'cancelled' ? '' : `<ol class="steps">${FLOW.map((s, i) => `<li class="${i <= step ? 'done' : ''}">${LABEL.status[s]}</li>`).join('')}</ol>`}
    <div class="layout-2">
      <div>
        ${needPay ? paymentPanel(o) : ''}
        <div class="card">
          <h3>Sản phẩm</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Sản phẩm</th><th class="num">Đơn giá</th><th class="num">SL</th><th class="num">Thành tiền</th></tr></thead>
            <tbody>${o.items.map(i => `<tr><td><a href="sanpham.html?id=${i.productId}">${esc(i.name)}</a></td>
              <td class="num">${money(i.price)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.lineTotal)}</td></tr>`).join('')}</tbody>
          </table></div>
          ${o.payments.length ? `<h3 style="margin-top:22px">Lịch sử thanh toán</h3>
            <div class="table-wrap"><table><tbody>${o.payments.map(p => `<tr>
              <td class="small">${fmtDate(p.createdAt)}</td><td>${pill('payment', p.status)}</td>
              <td class="small">${esc(p.message)}${p.last4 ? ` · thẻ •••• ${esc(p.last4)}` : ''}${p.ref ? ` · Mã GD ${esc(p.ref)}` : ''}</td>
              <td class="num">${money(p.amount)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        </div>
      </div>
      <aside class="card summary">
        <h3>Giao đến</h3>
        <p style="margin-top:0"><b>${esc(o.receiverName)}</b> · ${esc(o.phone)}<br>${esc(o.address)}${o.note ? `<br><span class="small muted">Ghi chú: ${esc(o.note)}</span>` : ''}</p>
        <p class="small muted">Đặt lúc ${fmtDate(o.createdAt)}<br>${esc(LABEL.method[o.paymentMethod])}</p>
        <div class="line"><span>Tạm tính</span><span>${money(o.subtotal)}</span></div>
        <div class="line"><span>Phí giao hàng</span><span>${o.shippingFee ? money(o.shippingFee) : 'Miễn phí'}</span></div>
        ${o.discount ? `<div class="line" style="color:var(--success,#16a34a)"><span>Giảm giá ${esc(o.voucherCode || '')}</span><span>-${money(o.discount)}</span></div>` : ''}
        <div class="line total"><span>Tổng cộng</span><span class="price">${money(o.total)}</span></div>
        ${['pending', 'confirmed'].includes(o.status) ? '<button class="btn danger block" id="cancel" style="margin-top:14px">Hủy đơn hàng</button>' : ''}
      </aside>
    </div>`;

  $('#cancel')?.addEventListener('click', async () => {
    if (!confirm('Bạn chắc chắn muốn hủy đơn này?' + (o.paymentStatus === 'paid' ? ' Tiền sẽ được hoàn lại (giả lập).' : ''))) return;
    try { await api(`/api/orders/${o.id}/cancel`, { method: 'POST' }); toast('Đã hủy đơn hàng'); render(); }
    catch (e) { toast(e.message, true); }
  });

  const pay = $('#pay');
  if (!pay) return;
  // Tự định dạng số thẻ "1234 5678 ..." và hạn "MM/YY" khi gõ
  pay.cardNumber?.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
  pay.expiry?.addEventListener('input', (e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 4); e.target.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; });
  pay.addEventListener('click', (e) => {
    const c = e.target.closest('[data-card]');
    if (!c) return;
    pay.cardNumber.value = c.textContent;
    pay.holder.value ||= 'NGUYEN VAN A';
    pay.expiry.value ||= '12/30';
    pay.cvv.value ||= '123';
  });
  pay.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', pay);
    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';
    try {
      const data = Object.fromEntries(new FormData(pay));
      if (data.holder) data.holder = data.holder.toUpperCase();
      await api('/api/payments', { body: { ...data, orderId: o.id } });
      toast('Thanh toán thành công!');
      history.replaceState(null, '', `?id=${o.id}&new=1`);
    } catch (err) {
      toast(err.message, true);
    }
    render(); // tải lại để thấy lịch sử thanh toán (kể cả lần thất bại)
  };
}

render().catch(e => e.message !== 'redirect' && toast(e.message, true));
