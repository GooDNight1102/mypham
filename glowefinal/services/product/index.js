'use strict';
// Đường dẫn: glowe/services/product/index.js
// PRODUCT SERVICE — danh mục, mỹ phẩm, tìm kiếm/lọc, tồn kho (giữ hàng / trả hàng cho Order Service)
const { unaccent, searchText } = require('./catalog');
const { service, requireAdmin, requireInternal, isInternal, HttpError, toInt, str } = require('../../shared/lib');
const { sql, schemaOf } = require('../../shared/db');

const S = schemaOf('product');

const SELECT = () => sql`
  SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon
  FROM ${S}.products p JOIN ${S}.categories c ON c.id = p.category_id`;

const toProduct = (p) => ({
  id: p.id, name: p.name, brand: p.brand, description: p.description, price: p.price, oldPrice: p.old_price,
  stock: p.stock, skinType: p.skin_type, volume: p.volume, imageUrl: p.image_url, isActive: p.is_active,
  categoryId: p.category_id, categoryName: p.category_name, categorySlug: p.category_slug, icon: p.icon,
});

async function productInput(b = {}) {
  const p = {
    category_id: toInt(b.categoryId), name: str(b.name, 150), brand: str(b.brand, 80), description: str(b.description, 5000) || null,
    price: Number(b.price), old_price: b.oldPrice ? Number(b.oldPrice) : null, stock: Number(b.stock),
    skin_type: str(b.skinType, 60) || null, volume: str(b.volume, 30) || null, image_url: str(b.imageUrl, 500) || null,
    is_active: b.isActive !== false,
  };
  if (!(p.category_id > 0) || !(await sql`SELECT 1 FROM ${S}.categories WHERE id = ${p.category_id}`).length) throw new HttpError(400, 'Danh mục không hợp lệ');
  if (!p.name || !p.brand) throw new HttpError(400, 'Tên và thương hiệu là bắt buộc');
  if (!Number.isInteger(p.price) || p.price <= 0) throw new HttpError(400, 'Giá phải là số nguyên dương');
  if (p.old_price !== null && (!Number.isInteger(p.old_price) || p.old_price <= p.price)) throw new HttpError(400, 'Giá gốc phải lớn hơn giá bán');
  if (!Number.isInteger(p.stock) || p.stock < 0) throw new HttpError(400, 'Tồn kho phải là số nguyên ≥ 0');
  if (p.image_url && !/^https?:\/\//i.test(p.image_url)) throw new HttpError(400, 'Link ảnh phải bắt đầu bằng http(s)://');
  p.search = searchText(p.name, p.brand);
  return p;
}

// [{productId, quantity}] -> Map(id -> qty), gộp dòng trùng
function parseItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new HttpError(400, 'Giỏ hàng trống');
  const qty = new Map();
  for (const it of items) {
    const id = toInt(it?.productId), q = toInt(it?.quantity);
    if (!(id > 0) || !(q >= 1 && q <= 99)) throw new HttpError(400, 'Số lượng mỗi sản phẩm từ 1 đến 99');
    qty.set(id, (qty.get(id) || 0) + q);
  }
  return qty;
}

const COLS = ['category_id', 'name', 'brand', 'description', 'price', 'old_price', 'stock', 'skin_type', 'volume', 'image_url', 'search', 'is_active'];

module.exports = service('product', [
  ['GET', '/categories', () => sql`
    SELECT c.id, c.name, c.slug, c.icon, COUNT(p.id) AS total
    FROM ${S}.categories c LEFT JOIN ${S}.products p ON p.category_id = c.id AND p.is_active
    GROUP BY c.id ORDER BY c.id`],

  ['GET', '/brands', async () => (await sql`SELECT DISTINCT brand FROM ${S}.products WHERE is_active ORDER BY brand`).map((r) => r.brand)],

  // ?q=&category=slug&brand=&sort=newest|price_asc|price_desc|sale  ·  ?all=1 (admin: gồm sản phẩm ngừng bán)
  // ponytail: không phân trang — đủ cho vài trăm sản phẩm; thêm LIMIT/OFFSET khi catalog lớn
  ['GET', '/products', async (ctx) => {
    const all = ctx.query.get('all') === '1';
    if (all) requireAdmin(ctx.req);
    const q = unaccent(str(ctx.query.get('q'), 100)), cat = str(ctx.query.get('category'), 80), brand = str(ctx.query.get('brand'), 80);
    const order = {
      price_asc: sql`p.price ASC`, price_desc: sql`p.price DESC`,
      sale: sql`(p.old_price IS NULL), (p.old_price - p.price)::float / p.old_price DESC`,
    }[ctx.query.get('sort')] || sql`p.is_active DESC, p.id DESC`;
    const rows = await sql`${SELECT()} WHERE TRUE
      ${all ? sql`` : sql`AND p.is_active`}
      ${q ? sql`AND p.search LIKE ${'%' + q + '%'}` : sql``}
      ${cat ? sql`AND c.slug = ${cat}` : sql``}
      ${brand ? sql`AND p.brand = ${brand}` : sql``}
      ORDER BY ${order}`;
    return rows.map(toProduct);
  }],

  ['GET', '/products/:id', async (ctx) => {
    const id = toInt(ctx.params.id);
    const [p] = id > 0 ? await sql`${SELECT()} WHERE p.id = ${id}` : [];
    if (!p || (!p.is_active && !isInternal(ctx.req))) throw new HttpError(404, 'Không tìm thấy sản phẩm');
    return toProduct(p);
  }],

  // ---- Quản trị ----
  ['POST', '/products', async (ctx) => {
    requireAdmin(ctx.req);
    const [{ id }] = await sql`INSERT INTO ${S}.products ${sql(await productInput(ctx.body), COLS)} RETURNING id`;
    ctx.status = 201;
    return { id };
  }],

  ['PUT', '/products/:id', async (ctx) => {
    requireAdmin(ctx.req);
    const r = await sql`UPDATE ${S}.products SET ${sql(await productInput(ctx.body), COLS)} WHERE id = ${toInt(ctx.params.id)}`;
    if (!r.count) throw new HttpError(404, 'Không tìm thấy sản phẩm');
    return { ok: true };
  }],

  // Xóa mềm: đơn hàng cũ vẫn tham chiếu sản phẩm
  ['DELETE', '/products/:id', async (ctx) => {
    requireAdmin(ctx.req);
    await sql`UPDATE ${S}.products SET is_active = FALSE WHERE id = ${toInt(ctx.params.id)}`;
    return { ok: true };
  }],

  // ---- Nội bộ (Order Service) ----
  // Giữ hàng: trừ kho nguyên tử cho cả giỏ; thiếu 1 món là hủy toàn bộ. Trả về giá thật để Order lưu snapshot.
  // FOR UPDATE khóa các dòng sản phẩm -> 2 người mua cùng lúc không làm âm kho. Khóa theo thứ tự id để tránh deadlock.
  ['POST', '/products/reserve', async (ctx) => {
    requireInternal(ctx.req);
    const qty = parseItems(ctx.body.items);
    const ids = [...qty.keys()].sort((a, b) => a - b);
    return sql.begin(async (tx) => {
      const rows = await tx`SELECT id, name, price, stock, is_active FROM ${S}.products WHERE id IN ${tx(ids)} ORDER BY id FOR UPDATE`;
      if (rows.length !== ids.length) throw new HttpError(400, 'Có sản phẩm không còn tồn tại');
      for (const p of rows) {
        if (!p.is_active) throw new HttpError(409, `"${p.name}" đã ngừng kinh doanh`);
        if (p.stock < qty.get(p.id)) throw new HttpError(409, `"${p.name}" chỉ còn ${p.stock} sản phẩm`);
      }
      for (const p of rows) await tx`UPDATE ${S}.products SET stock = stock - ${qty.get(p.id)} WHERE id = ${p.id}`;
      return rows.map((p) => ({ productId: p.id, name: p.name, price: p.price, quantity: qty.get(p.id) }));
    });
  }],

  // Trả hàng về kho khi đơn bị hủy
  ['POST', '/products/release', async (ctx) => {
    requireInternal(ctx.req);
    const qty = parseItems(ctx.body.items);
    await sql.begin(async (tx) => {
      for (const [id, q] of [...qty].sort((a, b) => a[0] - b[0])) await tx`UPDATE ${S}.products SET stock = stock + ${q} WHERE id = ${id}`;
    });
    return { ok: true };
  }],
], module);
