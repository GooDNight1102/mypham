'use strict';
// Đường dẫn: glowe/services/user/index.js
// USER SERVICE — đăng ký, đăng nhập, hồ sơ, phân quyền (customer / admin), khóa tài khoản
const { service, hashPassword, checkPassword, signToken, requireUser, requireAdmin, requireInternal, HttpError, toInt, str, PHONE } = require('../../shared/lib');
const { sql, schemaOf, isUniqueError } = require('../../shared/db');

const S = schemaOf('user');

const publicUser = (u) => ({
  id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, address: u.address,
  role: u.role, isActive: u.is_active, createdAt: u.created_at,
});
const session = (u) => ({ token: signToken({ sub: u.id, name: u.full_name, role: u.role }), user: publicUser(u) });
const getUser = async (id) => (await sql`SELECT * FROM ${S}.users WHERE id = ${id}`)[0];

// Token không trạng thái -> /users/me kiểm tra lại khóa tài khoản; Order Service cũng hỏi trước khi đặt hàng
async function activeMe(ctx) {
  const u = await getUser(requireUser(ctx.req).sub);
  if (!u || !u.is_active) throw new HttpError(401, 'Tài khoản không tồn tại hoặc đã bị khóa');
  return u;
}

module.exports = service('user', [
  ['POST', '/users/register', async (ctx) => {
    const fullName = str(ctx.body.fullName, 100), email = str(ctx.body.email, 150).toLowerCase();
    const phone = str(ctx.body.phone, 15), password = String(ctx.body.password ?? '');
    if (fullName.length < 2) throw new HttpError(400, 'Vui lòng nhập họ tên');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ');
    if (!PHONE.test(phone)) throw new HttpError(400, 'Số điện thoại gồm 10 số, bắt đầu bằng 0');
    if (password.length < 6) throw new HttpError(400, 'Mật khẩu tối thiểu 6 ký tự');
    try {
      const [u] = await sql`INSERT INTO ${S}.users (full_name, email, phone, password_hash)
        VALUES (${fullName}, ${email}, ${phone}, ${hashPassword(password)}) RETURNING *`;
      ctx.status = 201;
      return session(u);
    } catch (e) {
      if (isUniqueError(e)) throw new HttpError(409, 'Email này đã được đăng ký');
      throw e;
    }
  }],

  ['POST', '/users/login', async (ctx) => {
    const [u] = await sql`SELECT * FROM ${S}.users WHERE email = ${str(ctx.body.email, 150).toLowerCase()}`;
    // Cùng 1 thông báo để không lộ email nào đã đăng ký
    if (!u || !checkPassword(String(ctx.body.password ?? ''), u.password_hash)) throw new HttpError(401, 'Email hoặc mật khẩu không đúng');
    if (!u.is_active) throw new HttpError(403, 'Tài khoản đã bị khóa');
    return session(u);
  }],

  ['GET', '/users/me', async (ctx) => publicUser(await activeMe(ctx))],

  ['PUT', '/users/me', async (ctx) => {
    const u = await activeMe(ctx);
    const fullName = str(ctx.body.fullName, 100), phone = str(ctx.body.phone, 15), address = str(ctx.body.address, 255);
    if (fullName.length < 2) throw new HttpError(400, 'Vui lòng nhập họ tên');
    if (!PHONE.test(phone)) throw new HttpError(400, 'Số điện thoại gồm 10 số, bắt đầu bằng 0');
    const [updated] = await sql`UPDATE ${S}.users SET full_name = ${fullName}, phone = ${phone}, address = ${address || null}
      WHERE id = ${u.id} RETURNING *`;
    return publicUser(updated);
  }],

  // ---- Quản trị ----
  ['GET', '/users', async (ctx) => {
    requireAdmin(ctx.req);
    return (await sql`SELECT * FROM ${S}.users ORDER BY id DESC`).map(publicUser);
  }],

  ['PATCH', '/users/:id', async (ctx) => {
    const admin = requireAdmin(ctx.req);
    const id = toInt(ctx.params.id);
    if (id === admin.sub) throw new HttpError(400, 'Không thể tự khóa tài khoản của mình');
    const r = await sql`UPDATE ${S}.users SET is_active = ${!!ctx.body.isActive} WHERE id = ${id}`;
    if (!r.count) throw new HttpError(404, 'Không tìm thấy người dùng');
    return { ok: true };
  }],

  // ---- Nội bộ: Order Service hỏi trước khi tạo đơn ----
  ['GET', '/users/:id/status', async (ctx) => {
    requireInternal(ctx.req);
    const u = await getUser(toInt(ctx.params.id));
    return { isActive: !!u?.is_active };
  }],
], module);
