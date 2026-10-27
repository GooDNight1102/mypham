'use strict';
// Đường dẫn: glowe/services/product/catalog.js
// Chuỗi tìm kiếm không dấu + nạp 17 mỹ phẩm mẫu từ products.json khi bảng còn trống (dùng bởi Product Service và seed.js)
const fs = require('node:fs');
const path = require('node:path');

// "Kem chống nắng" -> "kem chong nang" (bỏ dấu tiếng Việt, kể cả đ)
const unaccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const searchText = (name, brand) => unaccent(`${name} ${brand}`);

async function seedCatalog(sql, S) {
  if ((await sql`SELECT 1 FROM ${S}.products LIMIT 1`).length) return;
  const catId = Object.fromEntries((await sql`SELECT id, slug FROM ${S}.categories`).map((c) => [c.slug, c.id]));
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8')).map((p) => ({
    category_id: catId[p.category], name: p.name, brand: p.brand, description: p.description, price: p.price,
    old_price: p.oldPrice ?? null, stock: p.stock, skin_type: p.skinType ?? null, volume: p.volume ?? null,
    image_url: p.imageUrl ?? null, search: searchText(p.name, p.brand),
  }));
  await sql`INSERT INTO ${S}.products ${sql(rows)}`;
}

module.exports = { seedCatalog, unaccent, searchText };
