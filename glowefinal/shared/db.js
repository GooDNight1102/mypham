'use strict';
// Đường dẫn: glowe/shared/db.js
// Kết nối PostgreSQL (Supabase). Mỗi service có 1 schema riêng: glowe_user, glowe_product, glowe_order, glowe_payment
// -> vẫn giữ "database-per-service": service nào chỉ đọc/ghi schema của mình, muốn dữ liệu service khác thì gọi API.
const postgres = require('postgres');

// Bỏ dấu ngoặc kép/khoảng trắng thừa hay bị dán kèm vào ô Environment Variables
const url = (process.env.DATABASE_URL || '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();

// DATABASE_URL thiếu/sai định dạng: không làm sập tiến trình (trên Vercel sẽ thành lỗi 500 không lời giải thích),
// mà để mọi truy vấn báo lỗi rõ ràng -> /api/health hiện hướng dẫn sửa.
function broken(err) {
  const fail = () => Promise.reject(err);
  const fake = (first) => (typeof first === 'string' || (Array.isArray(first) && !first.raw) ? {} : fail()); // sql('tên') / sql(rows) khi nạp module
  return Object.assign(fake, { begin: fail, unsafe: fail, end: async () => {} });
}
const urlError = !url ? Object.assign(new Error('Chưa có DATABASE_URL'), { code: 'NO_DATABASE_URL' })
  : /\[YOUR-PASSWORD\]/i.test(url) ? new Error('DATABASE_URL vẫn còn chữ [YOUR-PASSWORD]')
  : !/^postgres(ql)?:\/\//.test(url) ? new Error('Invalid URL: DATABASE_URL phải bắt đầu bằng postgresql://')
  : null;

// Dùng chuỗi "Session pooler" của Supabase (host *.pooler.supabase.com, cổng 5432, chạy IPv4 nên Vercel kết nối được).
// KHÔNG dùng "Transaction pooler" (cổng 6543): postgres.js luôn gửi truy vấn kiểu pipeline, ở chế độ transaction
// có thể treo hoặc trả nhầm dòng (theo tài liệu Supabase về Postgres.js).
if (url && /:6543\//.test(url)) console.warn('[db] ⚠ DATABASE_URL đang dùng cổng 6543 (Transaction pooler). Hãy đổi sang chuỗi "Session pooler" (cổng 5432) — xem README.');

const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
let sql;
try {
  if (urlError) throw urlError;
  sql = postgres(url, {
    ssl: isLocal ? false : 'require',
    prepare: false,
    max: process.env.VERCEL ? 1 : 3,      // Vercel: 1 kết nối / hàm; máy: 4 service × 3 = 12, dưới giới hạn gói Free
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    // COUNT/SUM trả về bigint/numeric -> đổi sang Number để JSON trả số như cũ
    types: { bigint: { to: 20, from: [20, 1700], serialize: (x) => String(x), parse: (x) => Number(x) } },
  });
} catch (e) {
  sql = broken(e.code === 'ERR_INVALID_URL' ? new Error('Invalid URL: DATABASE_URL sai định dạng') : e);
}

const PREFIX = process.env.DB_PREFIX || 'glowe';
const schemaName = (svc) => `${PREFIX}_${svc}`;
// Dùng trong câu SQL: sql`SELECT * FROM ${S}.users` -> "glowe_user".users
const schemaOf = (svc) => sql(schemaName(svc));

// Múi giờ dùng để gom "theo ngày" ở Dashboard (máy chủ Supabase chạy giờ UTC)
const TZ = process.env.APP_TZ || 'Asia/Ho_Chi_Minh';

const isUniqueError = (e) => e?.code === '23505';

// Lỗi kết nối -> câu giải thích + cách sửa (dùng ở /api/health trên Vercel và npm run setup trên máy)
function explainDbError(e) {
  const m = String(e?.message || e);
  const hints = [
    [/YOUR-PASSWORD/, 'Chưa thay [YOUR-PASSWORD] trong DATABASE_URL bằng mật khẩu database thật (bỏ cả dấu [ ]). Sửa xong trên Vercel phải Redeploy.'],
    [/Chưa có DATABASE_URL/, 'Chưa khai báo DATABASE_URL. Trên Vercel: Settings → Environment Variables → thêm DATABASE_URL, rồi Deployments → Redeploy. Trên máy: kiểm tra file tên đúng là ".env" (không phải ".env.txt").'],
    [/password authentication failed/i, 'Sai mật khẩu database. Kiểm tra đã thay [YOUR-PASSWORD] (bỏ cả dấu [ ]); mật khẩu có ký tự @ # / ? & thì đặt lại mật khẩu chỉ gồm chữ + số.'],
    [/Tenant or user not found/i, 'Sai tên người dùng trong chuỗi kết nối: với Session pooler phải là postgres.<mã-project>. Hãy copy lại nguyên chuỗi từ nút Connect.'],
    [/ENOTFOUND.*supabase\.co|getaddrinfo.*supabase\.co/i, 'Đang dùng "Direct connection" (db.xxx.supabase.co) — Vercel/nhiều mạng không kết nối được. Đổi sang chuỗi "Session pooler" (host ...pooler.supabase.com, cổng 5432).'],
    [/ENOTFOUND|getaddrinfo/i, 'Không tìm thấy máy chủ database: chuỗi kết nối bị sai/thiếu ký tự. Copy lại từ nút Connect → Session pooler.'],
    [/max clients|too many (clients|connections)|remaining connection slots/i, 'Hết lượt kết nối của gói Free. Tắt bớt `npm start` trên máy rồi thử lại.'],
    [/timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET/i, 'Không kết nối được database (quá thời gian). Project Supabase có thể đang bị tạm dừng (Restore project) hoặc sai cổng — dùng cổng 5432 của Session pooler.'],
    [/Invalid URL|invalid url/i, 'DATABASE_URL sai định dạng: phải bắt đầu bằng postgresql://, không có khoảng trắng. Nếu mật khẩu có ký tự @ # / ? & [ ] thì đặt lại mật khẩu chỉ gồm chữ + số.'],
  ];
  const hint = hints.find(([re]) => re.test(m))?.[1];
  return { error: m.replace(/:\/\/[^@\s]*@/g, '://***@'), hint: hint || 'Xem log chi tiết: Vercel → project → Logs.' };
}

module.exports = { sql, schemaName, schemaOf, TZ, isUniqueError, explainDbError, hasUrl: !!url };
