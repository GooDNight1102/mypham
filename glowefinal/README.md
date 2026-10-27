# 💄 GLOWÉ — Hệ thống bán mỹ phẩm (Microservices · Supabase · Vercel)

HTML · CSS · JavaScript (Node.js) · JSON · SQL (PostgreSQL trên **Supabase**).

Cùng một bộ code chạy được 2 kiểu:

| | Trên máy (`npm start`) |
|---|---|---|
| Cách chạy | 5 tiến trình riêng: gateway + 4 service gọi nhau qua HTTP (microservices thật) | 1 hàm serverless `api/index.js` nạp cả 4 service, gọi nhau trực tiếp trong bộ nhớ |
| Giao diện | gateway phục vụ `public/` | Vercel phục vụ `public/` (file tĩnh) |
| CSDL | Supabase | Supabase (cùng CSDL) |

Mỗi service vẫn tách code + **schema riêng** trên Supabase: `glowe_user`, `glowe_product`, `glowe_order`, `glowe_payment`. Không service nào đọc schema của service khác, chỉ gọi API.

---

## 1. Chạy trên máy

Yêu cầu: **Node.js ≥ 22** và một project Supabase (làm theo mục 2.A trước).

```bash
npm install                  # cài thư viện kết nối PostgreSQL (postgres)
copy .env.example .env       # macOS/Linux: cp .env.example .env  — rồi mở .env điền DATABASE_URL, APP_SECRET
npm start                    # lần đầu tự tạo bảng + dữ liệu demo trên Supabase, rồi bật 6 tiến trình (gateway + 5 service)
# mở http://localhost:3000
```

| Lệnh | Tác dụng |
|---|---|
| `npm start` | Tạo bảng/dữ liệu nếu còn trống, bật hệ thống |
| `npm run setup` | Chỉ tạo bảng + dữ liệu (không bật server). Chạy lại thoải mái, không mất dữ liệu |
| `npm run reset-db` | ⚠ **Xóa sạch** 4 schema rồi tạo lại + dữ liệu demo |
| `npm test` | Kiểm thử end-to-end kiểu microservices, trên schema riêng `glowe_test_*` (không đụng dữ liệu thật). Cần tắt `npm start` trước |
| `npm test -- --serverless` | Cùng bộ kiểm thử, chạy kiểu Vercel (`api/index.js`) |

Dữ liệu demo (`seed.js`): 5 danh mục, 17 mỹ phẩm, 10 khách hàng, ~150 đơn trong 30 ngày qua kèm thanh toán và thông báo. Không muốn dữ liệu demo: đặt `NO_SEED=1` trong `.env` trước lần chạy đầu (khi đó chỉ tạo tài khoản admin + khách mẫu).

- Quản trị: `admin@glowe.vn` / `Admin@123` → đăng nhập xong vào thẳng **Dashboard**
- Khách: `khach@glowe.vn` / `Khach@123` (các khách demo khác: `minhanh@`, `phuonglinh@`, `ngocmai@`… `@glowe.vn`, cùng mật khẩu)

---

## 2. Triển khai: Supabase → GitHub → Vercel

### A. Tạo CSDL trên Supabase

1. Vào **https://supabase.com** → *Start your project* → đăng nhập bằng GitHub.
2. **New project**:
   - *Name*: `glowe`
   - *Database Password*: bấm *Generate a password* rồi **lưu lại**. Nên chỉ dùng chữ + số; nếu có ký tự `@ # / ? &` phải mã hóa khi dán vào URL.
   - *Region*: **Southeast Asia (Singapore)** (gần Việt Nam, cùng vùng với Vercel `sin1` trong `vercel.json`).
   - Bấm **Create new project**, chờ ~2 phút.
3. Lấy chuỗi kết nối: bấm nút **Connect** ở thanh trên cùng → chọn **Session pooler** → **Copy**. Chuỗi có dạng:
   ```
   postgresql://postgres.abcdxyz:[YOUR-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```
   Thay `[YOUR-PASSWORD]` bằng mật khẩu ở bước 2 (bỏ cả dấu `[ ]`).
   > ⚠ Dùng **Session pooler** (cổng **5432**, host `…pooler.supabase.com`).
   > - Không dùng *Direct connection* (`db.xxx.supabase.co`): chỉ hỗ trợ IPv6, Vercel không kết nối được.
   > - Không dùng *Transaction pooler* (cổng 6543): thư viện `postgres` dùng trong dự án gửi truy vấn kiểu pipeline, ở chế độ này có thể treo hoặc trả nhầm dữ liệu.
4. Mở file `.env` trên máy, dán chuỗi vào `DATABASE_URL=...`, đặt `APP_SECRET` là một chuỗi dài ngẫu nhiên.
5. Tạo bảng + dữ liệu trên Supabase. Có 2 cách, chọn 1:
   - **Tự động**: bỏ qua bước này. Lần đầu bản Vercel nhận request sẽ tự tạo bảng + dữ liệu demo (mất ~5–10 giây cho lần đầu).
   - **Bằng SQL**: Supabase → **SQL Editor** → *New query* → dán toàn bộ file `database.sql` → **Run** (cuối kết quả hiện 11 tài khoản, 17 mỹ phẩm, 149 đơn hàng).
   - **Từ máy**: `npm install` rồi `npm run setup`. Thấy `[setup] CSDL sẵn sàng` là xong. Nếu lỗi, dòng `→ ...` cho biết cách sửa. Kiểm tra: Supabase → **Table Editor** → ô chọn *schema* (mặc định `public`) → chọn `glowe_order`… sẽ thấy các bảng và dữ liệu.

### B. Đưa code lên GitHub

`.gitignore` đã loại `node_modules/` và `.env`. **Không bao giờ đưa `.env` lên GitHub** vì trong đó có mật khẩu CSDL.

1. Vào **https://github.com/new** → *Repository name*: `glowe` → chọn **Private** → **Create repository**.
2. Mở terminal **trong thư mục dự án** (thư mục có `package.json`) và chạy:
   ```bash
   git init
   git add .
   git commit -m "GLOWÉ - Supabase + Vercel"
   git branch -M main
   git remote add origin https://github.com/<tên-github-của-bạn>/glowe.git
   git push -u origin main
   ```
   (Hoặc dùng **GitHub Desktop**: *File → Add local repository* → chọn thư mục → *Publish repository*.)
3. Mở repo trên GitHub, kiểm tra `package.json`, `vercel.json`, `api/` nằm **ngay ở gốc** repo và **không có** file `.env`.

### C. Triển khai lên Vercel

1. Vào **https://vercel.com** → *Sign Up / Log in* bằng GitHub.
2. **Add New… → Project** → ở *Import Git Repository* chọn repo `glowe` → **Import**. Nếu không thấy repo: *Adjust GitHub App Permissions* → cho phép Vercel truy cập repo.
3. Màn hình cấu hình:
   - *Framework Preset*: **Other**
   - *Root Directory*: để trống `./`. Nếu `package.json` nằm trong thư mục con, ví dụ `glowe/`, thì bấm *Edit* và chọn thư mục đó.
   - *Build and Output Settings*: không cần sửa vì `vercel.json` đã khai báo.
   - **Environment Variables**: thêm từng biến:

     | Key | Value |
     |---|---|
     | `DATABASE_URL` | chuỗi Session pooler ở bước A.3 (đã thay mật khẩu) |
     | `APP_SECRET` | giống trong `.env` |
     | `APP_TZ` | `Asia/Ho_Chi_Minh` (tùy chọn) |
4. Bấm **Deploy**, chờ ~1 phút → **Visit**. Mở thử:
   - `https://<tên-project>.vercel.app/api/health` phải trả `{"gateway":"UP",...}`
   - Trang chủ, đăng nhập `admin@glowe.vn` / `Admin@123` → Dashboard có dữ liệu.
5. Cập nhật về sau: sửa code → `git add . && git commit -m "..." && git push` → Vercel tự triển khai lại. Nếu đổi *Environment Variables* thì vào **Deployments → ⋯ → Redeploy**.

### D. Gặp lỗi?

**Bước 1: mở `https://<tên-project>.vercel.app/api/health`.** Trang này cho biết chính xác chỗ sai:

| `/api/health` hiện | Ý nghĩa |
|---|---|
| `"database":"UP"` | Mọi thứ ổn. Tải lại trang chủ bằng Ctrl+F5 |
| `"database":"ERROR"` kèm `"hint": "..."` | Không kết nối được Supabase → làm theo dòng `hint`. Sửa biến môi trường trên Vercel xong phải **Redeploy** |
| `"hasDatabaseUrl": false` | Vercel chưa có `DATABASE_URL`, hoặc đã thêm nhưng chưa Redeploy |
| Trang 404 của Vercel / trang trắng | Vercel không thấy `api/index.js` → *Root Directory* sai, hoặc repo GitHub thiếu `vercel.json` / thư mục `api/` |
| Trang tải xuống file hoặc hiện mã nguồn | *Framework Preset* không phải **Other** |

**Bước 2:** nếu vẫn chưa rõ, xem Vercel → project → **Logs**. Lỗi CSDL có dòng `[api] không kết nối/khởi tạo được CSDL`.

Các lỗi hay gặp:

| Hiện tượng | Cách xử lý |
|---|---|
| Mọi API báo *Lỗi hệ thống* / 500 trên Vercel | Vercel → project → **Logs** xem lỗi. Thường do thiếu/sai `DATABASE_URL` → sửa trong *Settings → Environment Variables* rồi **Redeploy** |
| `password authentication failed` | Sai mật khẩu, hoặc còn nguyên `[YOUR-PASSWORD]`, hoặc mật khẩu có ký tự đặc biệt chưa mã hóa. Đổi mật khẩu ở Supabase → *Project Settings → Database → Reset database password* |
| `Tenant or user not found` | Copy thiếu phần tên người dùng: với pooler phải là `postgres.<mã-project>` |
| `getaddrinfo ENOTFOUND db.xxx.supabase.co` | Đang dùng *Direct connection* → đổi sang **Session pooler** |
| `max clients reached` / `too many connections` | Tắt bớt `npm start` trên máy khi đang dùng bản Vercel (gói Free giới hạn số kết nối) |
| Trang web mở được nhưng `/api/...` báo 404 | `vercel.json` hoặc thư mục `api/` không nằm ở gốc → chỉnh *Root Directory* |
| Đang đăng nhập thì bị đăng xuất | Bình thường khi đổi `APP_SECRET`; đăng nhập lại |
| Supabase báo project *paused* | Gói Free tạm dừng sau 7 ngày không dùng → vào Supabase bấm **Restore project** |

---

## Trợ lý Glowie (chatbot)

Nút **"Cần hỗ trợ?"** ở góc phải mở khung chat. Trợ lý là service riêng `services/assistant` (cổng 4005, API `POST /api/assistant/chat`) và dùng **dữ liệu thật** của cửa hàng:

- Gợi ý sản phẩm theo loại da, nhu cầu, ngân sách ("da dầu mụn tầm 300k", "son dưới 200k"), sản phẩm đang sale.
- Tra đơn hàng của khách đã đăng nhập ("đơn hàng của tôi", hoặc gõ mã `GL...`).
- Trả lời về phí giao, đổi trả, thanh toán và thẻ test, tài khoản, hotline. Dị ứng hoặc viêm da thì khuyên gặp bác sĩ.
- Trả lời tiếng Việt / tiếng Anh theo nút VI / EN. Lịch sử chat giữ trong tab đang mở.

Có 2 chế độ:

| Chế độ | Bật khi | Ghi chú |
|---|---|---|
| Bộ luật | Mặc định | Miễn phí, không cần internet, trả lời theo từ khóa (gõ không dấu vẫn hiểu) |
| AI (Claude) | `.env` có `ANTHROPIC_API_KEY=...` | Trò chuyện tự nhiên, hiểu câu dài và ngữ cảnh. Trợ lý chỉ được dùng danh mục, chính sách và đơn của khách, không được bịa. Giới hạn 30 lượt/phút. Lỗi mạng hoặc hết hạn mức thì tự quay về bộ luật |

Muốn trợ lý hiểu thêm câu hỏi: thêm dòng vào mảng `NEEDS` (nhu cầu → từ khóa sản phẩm) hoặc thêm một khối `if (has(/.../))` trong hàm `rules()`.

## Giao diện
- **Sáng / tối**: nút 🌙/☀️ trên mọi trang (và trong sidebar quản trị). Lần đầu theo cài đặt của máy, sau đó nhớ lựa chọn.
- **Đăng nhập**: khung vòm "gương trang điểm" giữa nền lụa chuyển màu, thanh trượt Đăng nhập/Đăng ký, ô nhập nhãn nổi, dải chữ chạy ở chân trang. Có hiện/ẩn mật khẩu, *Ghi nhớ 7 ngày*, quên mật khẩu, đăng nhập mạng xã hội (demo), tài khoản demo bấm để điền nhanh.
- **Thông báo** (chuông 🔔 trên header, mọi trang): menu nổi. Máy tính: di chuột tới là mở, bấm để ghim. Điện thoại: chạm để mở/đóng. Lọc theo loại, đếm chưa đọc, đánh dấu đã đọc.
- **Tài khoản khách**: tổng hợp (tổng đơn đã mua, tổng tiền đã chi, đang xử lý, đã nhận), tiến độ 4 bước của từng đơn kèm giờ mỗi bước, lịch sử đơn có lọc, sửa hồ sơ.
- **Dashboard**: 6 chỉ số, biểu đồ doanh thu/số đơn theo ngày, trạng thái đơn, doanh thu theo danh mục, top 5 bán chạy, phương thức thanh toán, đơn mới nhất. Biểu đồ SVG tự viết, không cần CDN.

### Thanh toán thử
| Thẻ | Kết quả |
|---|---|
| `4111 1111 1111 1111` | Thành công |
| `4000 0000 0000 0002` | Bị từ chối |
| `4000 0000 0000 9995` | Không đủ số dư |

Hạn dùng bất kỳ ở tương lai, CVV 3 số. Ví điện tử: SĐT kết thúc `0000` → không đủ số dư, số khác → thành công.

## Kiến trúc

```
 Trình duyệt (public/: HTML/CSS/JS)  ── chỉ gọi /api/*
        │
        ▼
 ┌─ Trên máy: gateway/index.js :3000 ──┐   ┌─ Trên Vercel: api/index.js (serverless) ─┐
 │ định tuyến /api/* qua HTTP          │   │ định tuyến /api/* trong cùng 1 hàm        │
 │ xoá header X-Internal-Key           │   │ xoá header X-Internal-Key                 │
 └──┬──────┬───────┬───────┬───────────┘   └───────────────────────────────────────────┘
    ▼      ▼       ▼       ▼
  User   Product  Order ◄─► Payment        (mỗi service: index.js + schema.sql)
    │      │       │        │
    ▼      ▼       ▼        ▼
 ┌──────────────── Supabase PostgreSQL ────────────────┐
 │ glowe_user · glowe_product · glowe_order · glowe_payment │
 └──────────────────────────────────────────────────────┘
```

- **Schema-per-service**: mỗi service chỉ đọc/ghi schema của mình; cần dữ liệu service khác thì gọi API (`call()` trong `shared/lib.js`: cùng tiến trình thì gọi thẳng, khác tiến trình thì HTTP).
- **Xác thực stateless**: User Service cấp token ký HMAC (`APP_SECRET`); mọi service tự kiểm tra, nên chạy tốt trên serverless.
- **Lời gọi nội bộ** dùng header `X-Internal-Key`; gateway luôn xoá header này nên client không giả mạo được.

## Luồng mua hàng

1. `POST /api/orders` → Order hỏi **User** tài khoản còn hoạt động, gọi **Product** `/products/reserve`: khóa dòng sản phẩm (`FOR UPDATE`), kiểm tra tồn kho, trừ kho nguyên tử và lấy **giá thật** (giá client gửi lên bị bỏ qua). Sau đó lưu đơn `pending` kèm snapshot tên/giá.
2. COD: chờ admin duyệt. Thẻ/ví: trang đơn hàng hiện cổng thanh toán → `POST /api/payments` → **Payment** lấy số tiền từ **Order**, giả lập cổng, ghi giao dịch, báo Order chuyển `paid` + `confirmed`.
3. Thẻ bị từ chối → đơn `failed`, khách thanh toán lại hoặc huỷ.
4. Huỷ đơn → trả kho về Product; nếu đã trả tiền thì Payment ghi `refunded`.

Trạng thái đơn: `pending → confirmed → shipping → completed` (huỷ được khi `pending`/`confirmed`). Đơn COD hoàn thành = đã thu tiền. Mỗi lần đổi trạng thái, Order ghi 1 thông báo cho khách.

**Tính nhất quán**: unique index `payments(order_id) WHERE status = 'success'` chặn thanh toán 2 lần kể cả khi bấm đồng thời. Nếu đã trừ tiền mà đơn vừa bị huỷ, giao dịch tự chuyển `refunded`.

## API (qua Gateway `/api`)

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/users/register` · `/users/login` | – | → `{token, user}` |
| GET · PUT | `/users/me` | 🔒 | Hồ sơ |
| GET | `/users` · PATCH `/users/:id` `{isActive}` | 👑 | Danh sách, khoá/mở tài khoản |
| GET | `/categories` · `/brands` | – | |
| GET | `/products?q=&category=&brand=&sort=` · `/products/:id` | – | Tìm không dấu; `sort` = `price_asc` · `price_desc` · `sale` |
| GET | `/products?all=1` | 👑 | Gồm cả sản phẩm ngừng bán |
| POST · PUT · DELETE | `/products`, `/products/:id` | 👑 | DELETE = ngừng bán (xoá mềm) |
| POST | `/orders` | 🔒 | `{receiverName, phone, address, note?, paymentMethod: cod\|card\|ewallet, items:[{productId, quantity}]}` |
| GET | `/orders` · `/orders/:id` | 🔒 | Đơn của tôi / chi tiết |
| POST | `/orders/:id/cancel` | 🔒 | Huỷ đơn |
| GET | `/orders/all?status=` · `/orders/stats` | 👑 | Tất cả đơn; số liệu Dashboard |
| PATCH | `/orders/:id/status` `{status}` | 👑 | Chuyển trạng thái |
| GET | `/orders/notifications` · `/orders/notifications/unread` | 🔒 | Thông báo của tôi (`{unread, items}`) / chỉ số chưa đọc |
| POST | `/orders/notifications/read` `{ids?}` | 🔒 | Đánh dấu đã đọc (không gửi `ids` = tất cả) |
| POST | `/payments` | 🔒 | `{orderId, cardNumber, holder, expiry, cvv}` hoặc `{orderId, walletPhone}` |
| GET | `/payments?orderId=` | 🔒 | Lịch sử thanh toán |
| GET | `/health` | – | Trạng thái các service |

🔒 = header `Authorization: Bearer <token>` · 👑 = admin. Lỗi luôn trả `{ "error": "..." }` kèm mã HTTP chuẩn (400/401/402/403/404/409/503).

## Cấu trúc thư mục

```
api/index.js           Gateway trên Vercel (hàm serverless, nạp cả 4 service)
vercel.json            cấu hình Vercel: web tĩnh public/, /api/* -> api/index.js, vùng Singapore
.env.example           mẫu biến môi trường (DATABASE_URL, APP_SECRET...)
config.json            cổng các service khi chạy trên máy
start.js               chạy trên máy: setup CSDL rồi bật 5 tiến trình
setup.js               tạo schema/bảng trên Supabase + dữ liệu mẫu (npm run setup / reset-db)
seed.js                dữ liệu demo cho Dashboard
shared/lib.js          router, token, gọi service — dùng chung
shared/db.js           kết nối Supabase PostgreSQL
gateway/index.js       API Gateway khi chạy trên máy
services/user/         index.js + schema.sql
services/product/      index.js + schema.sql + catalog.js + products.json (dữ liệu mẫu)
services/order/        index.js + schema.sql + notices.js (nội dung thông báo)
services/payment/      index.js + schema.sql + simulate.js (cổng thanh toán giả lập)
public/                giao diện: index · sanpham · giohang · thanhtoan · donhang · taikhoan · dangnhap · admin (.html) + css/ + js/
test.js                kiểm thử end-to-end (2 chế độ)
```

## Hướng mở rộng

- Tách mỗi service thành 1 project Vercel riêng (mỗi service 1 URL), thay `127.0.0.1:port` trong `call()` bằng URL đó.
- Trả kho / hoàn tiền đang gọi đồng bộ: dùng hàng đợi hoặc bảng outbox khi cần chịu lỗi tốt hơn.
- Thay `services/payment/simulate.js` bằng SDK cổng thật (VNPay/MoMo), giữ nguyên bảng `payments`.
