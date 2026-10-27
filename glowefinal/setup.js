'use strict';
// Khởi tạo CSDL trên Supabase (PostgreSQL): tạo 4 schema/bảng + 17 mỹ phẩm + dữ liệu demo (nếu còn trống).
//   npm run setup      -> tạo nếu chưa có (chạy lại thoải mái, không mất dữ liệu)
//   npm run reset-db   -> XÓA SẠCH 4 schema rồi tạo lại + dữ liệu demo
//   NO_SEED=1          -> không tạo dữ liệu demo, chỉ tạo tài khoản admin + khách mẫu
// npm start tự gọi setup trước khi bật các service.
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('./shared/lib');
const { sql, schemaName, schemaOf, explainDbError } = require('./shared/db');
const { seedCatalog } = require('./services/product/catalog');
const { seed } = require('./seed');

const SERVICES = ['user', 'product', 'order', 'payment'];

// Tạo bảng + dữ liệu nếu còn trống. Chạy cả khi npm start (máy) và lần đầu Vercel nhận request.
// Toàn bộ nằm trong 1 transaction + khóa advisory: nhiều tiến trình gọi cùng lúc cũng chỉ 1 cái làm, không bị nhân đôi dữ liệu.
async function setup({ reset = false, demo = !process.env.NO_SEED, quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(20261022)`;
    if (reset) {
      for (const svc of SERVICES) await tx.unsafe(`DROP SCHEMA IF EXISTS "${schemaName(svc)}" CASCADE`);
      log('[setup] đã xóa dữ liệu cũ');
    }
    for (const svc of SERVICES) {
      const ddl = fs.readFileSync(path.join(__dirname, 'services', svc, 'schema.sql'), 'utf8').replaceAll('{{s}}', `"${schemaName(svc)}"`);
      await tx.unsafe(ddl);
    }
    await fill(tx, demo, log);
  });
  log('[setup] CSDL sẵn sàng');
}

async function fill(sql, demo, log) {
  const S = Object.fromEntries(SERVICES.map((svc) => [svc, schemaOf(svc)]));
  await seedCatalog(sql, S.product);
  if (demo) {
    if (await seed(sql, S, log)) return;
  } else if (!(await sql`SELECT 1 FROM ${S.user}.users LIMIT 1`).length) {
    // Không tạo demo: vẫn cần 1 admin để đăng nhập trang quản trị
    await sql`INSERT INTO ${S.user}.users ${sql([
      { full_name: 'Quản trị viên', email: (process.env.ADMIN_EMAIL || 'admin@glowe.vn').toLowerCase(), phone: '0900000001', address: 'Hà Nội',
        password_hash: hashPassword(process.env.ADMIN_PASSWORD || 'Admin@123'), role: 'admin' },
      { full_name: 'Nguyễn Thu Hà', email: 'khach@glowe.vn', phone: '0912345678', address: '12 Láng Hạ, Đống Đa, Hà Nội',
        password_hash: hashPassword('Khach@123'), role: 'customer' },
    ])}`;
  }
}

if (require.main === module) {
  setup({ reset: process.argv.includes('--reset') })
    .then(() => sql.end())
    .catch(async (e) => {
      const { error, hint } = explainDbError(e);
      console.error(`\n✘ Không khởi tạo được CSDL: ${error}\n  → ${hint}\n`);
      await sql.end();
      process.exit(1);
    });
}
module.exports = { setup };
