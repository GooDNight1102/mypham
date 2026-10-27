// Đăng nhập / đăng ký (1 form, đổi chế độ). Admin -> thẳng Dashboard, khách -> trang trước đó hoặc trang chủ.
// ?next= chỉ nhận đường dẫn nội bộ (chống open redirect)
const next = /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(params.get('next') || '') ? params.get('next') : null;
const form = $('#authForm'), screen = $('#authScreen');
let mode = params.get('mode') === 'register' ? 'register' : 'login';

// Dải chữ chạy + tem hai bên: vào từ trang quản trị thì đổi nội dung cho admin
const forAdmin = next?.startsWith('admin.html');
const RIBBON = forAdmin
  ? ['Doanh thu & biểu đồ theo ngày', 'Xử lý đơn từng bước', 'Quản lý mỹ phẩm & tồn kho', 'Khóa / mở tài khoản khách']
  : ['100% mỹ phẩm chính hãng', 'Miễn phí giao hàng từ 500.000₫', 'Đổi trả trong 7 ngày', 'Thanh toán thẻ, ví hoặc khi nhận hàng', 'Ưu đãi thành viên mỗi tháng'];
$('#ribbon').innerHTML = [...RIBBON, ...RIBBON].map(t => `<span>${esc(t)}</span>`).join('');
if (forAdmin) {
  $('#stickers').innerHTML = [['📊', 'Doanh thu'], ['🧾', 'Đơn hàng'], ['📦', 'Tồn kho'], ['👥', 'Khách hàng']]
    .map(([i, t], k) => `<span class="sticker st${k + 1}">${i}<small>${t}</small></span>`).join('');
  $('#compactIcon').textContent = '👑';
}

function setMode(m) {
  mode = m;
  const login = m === 'login';
  screen.classList.toggle('is-login', login);
  $('#authTitle').textContent = login ? 'Chào mừng trở lại' : 'Tạo tài khoản mới';
  $('#authSub').textContent = !login ? 'Chỉ mất 30 giây — nhận ưu đãi thành viên ngay'
    : forAdmin ? 'Đăng nhập để vào trang quản trị GLOWÉ' : 'Đăng nhập để tiếp tục mua sắm tại GLOWÉ';
  $('#authSubmit').textContent = login ? 'Đăng nhập' : 'Đăng ký';
  $('#authSwitchText').textContent = login ? 'Chưa có tài khoản?' : 'Đã có tài khoản?';
  $('#authSwitchBtn').textContent = login ? 'Đăng ký ngay' : 'Đăng nhập';
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  if (!forAdmin) $('#compactIcon').textContent = login ? '💄' : '🎁';
  $('.auth-demo').hidden = !login;
  form.password.autocomplete = login ? 'current-password' : 'new-password';
  form.fullName.required = form.phone.required = !login;
  $('#authError').textContent = '';
}
setMode(mode);

$('#authSwitchBtn').onclick = () => setMode(mode === 'login' ? 'register' : 'login');
$$('[data-mode]').forEach(b => (b.onclick = () => setMode(b.dataset.mode)));

// Hiện / ẩn mật khẩu
$('[data-eye]').onclick = (e) => {
  const show = form.password.type === 'password';
  form.password.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? '🙈' : '👁';
};

$('[data-forgot]').onclick = () =>
  toast('Liên hệ hotline 1900 0000 hoặc email hotro@glowe.vn để đặt lại mật khẩu');
$$('[data-social]').forEach(b => (b.onclick = () =>
  toast(`Đăng nhập bằng ${b.dataset.social} chưa được kết nối trong bản demo`)));

// Tài khoản demo: bấm để điền nhanh
$$('[data-demo]').forEach(b => (b.onclick = () => {
  const [email, pw] = b.dataset.demo.split('|');
  form.email.value = email;
  form.password.value = pw;
  form.password.focus();
}));

form.onsubmit = async (e) => {
  e.preventDefault();
  const err = $('#authError');
  err.textContent = '';
  if (!form.checkValidity()) {
    err.textContent = mode === 'login' ? 'Vui lòng nhập email và mật khẩu (tối thiểu 6 ký tự).'
      : 'Vui lòng điền đủ thông tin; SĐT gồm 10 số bắt đầu bằng 0, mật khẩu tối thiểu 6 ký tự.';
    return;
  }
  const { remember, ...body } = Object.fromEntries(new FormData(form));
  if (mode === 'login') { delete body.fullName; delete body.phone; }
  $('#authSubmit').disabled = true;
  try {
    const { token, user } = await api('/api/users/' + mode, { body });
    Auth.save(token, !!remember);
    location.href = user.role === 'admin' ? 'admin.html' : (next && !next.startsWith('admin.html') ? next : 'index.html');
  } catch (ex) {
    err.textContent = ex.message;
    $('#authSubmit').disabled = false;
  }
};

// Đã đăng nhập thì không cần ở đây
userReady.then(u => { if (u) location.href = u.role === 'admin' ? 'admin.html' : (next || 'index.html'); });
