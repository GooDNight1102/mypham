// Thanh toán: tạo đơn -> nếu thanh toán online thì chuyển sang cổng thanh toán (trang đơn hàng)
(async () => {
  const user = await requireLogin();
  const lines = await loadCartLines();
  if (!lines.length) { location.href = 'giohang.html'; return; }

  const form = $('#checkout');
  form.receiverName.value = user.fullName;
  form.phone.value = user.phone;
  form.address.value = user.address || '';

  $('#lines').innerHTML = lines.map(l =>
    `<div class="line small"><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.price * l.qty)}</span></div>`).join('');
  $('#sum').innerHTML = summaryHtml(lines);

  form.onsubmit = async (e) => {
    e.preventDefault();
    $('#err').textContent = '';
    if (!form.checkValidity()) {
      $('#err').textContent = 'Vui lòng điền đủ thông tin; số điện thoại gồm 10 số bắt đầu bằng 0.';
      form.reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(form));
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
