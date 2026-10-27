'use strict';
// Chạy trên máy: khởi tạo CSDL Supabase (nếu chưa có) rồi bật toàn bộ hệ thống,
// mỗi service là 1 tiến trình (process) độc lập — đúng kiến trúc microservices.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const run = (file) => [process.execPath, ['--no-warnings', path.join(__dirname, file)]];

// 1. Tạo bảng + dữ liệu demo nếu CSDL còn trống (chạy trong tiến trình riêng để đóng kết nối gọn)
const r = spawnSync(...run('setup.js'), { stdio: 'inherit', env: process.env });
if (r.status !== 0) process.exit(r.status || 1);

// 2. Bật 5 service + gateway
const SERVICES = ['services/user/index.js', 'services/product/index.js', 'services/order/index.js', 'services/payment/index.js', 'services/assistant/index.js', 'gateway/index.js'];
const children = SERVICES.map((file) => spawn(...run(file), { stdio: 'inherit', env: process.env })
  .on('exit', (code) => { if (code) console.error(`[start] ${file} dừng với mã ${code}`); }));

const stop = () => { children.forEach((c) => c.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
