// Đường dẫn: glowe/public/js/i18n.js — giao diện Tiếng Việt / English
// Nạp trong <head> TRƯỚC mọi script khác. Trang vẫn viết bằng tiếng Việt; khi chọn EN,
// bộ dịch đổi chữ ngay lúc trình duyệt dựng trang (MutationObserver) nên không bị nháy chữ Việt.
// Thêm chữ mới: thêm 1 dòng vào DICT (khớp nguyên câu) hoặc PATTERNS (câu có số / mã đơn).
const Lang = {
  get() { try { return localStorage.getItem('glowe_lang') === 'en' ? 'en' : 'vi'; } catch { return 'vi'; } },
  set(l) { try { localStorage.setItem('glowe_lang', l); } catch {} location.reload(); }
};
document.documentElement.lang = Lang.get();
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (b && b.dataset.lang !== Lang.get()) Lang.set(b.dataset.lang);
});

const DICT = {
  // ---- chung, header, footer ----
  'GLOWÉ — Mỹ phẩm chính hãng': 'GLOWÉ — Authentic cosmetics', 'Mới': 'New', 'Sản phẩm': 'Products', 'Khuyến mãi': 'Promotions', 'Hội viên': 'Membership',
  'Tìm kiếm': 'Search', 'Giỏ hàng': 'Cart', 'Tài khoản': 'Account', 'Thông báo': 'Notifications', 'Mở menu': 'Open menu', 'Menu chính': 'Main menu',
  'Sáng': 'Light', 'Tối': 'Dark', 'Đổi nền sáng/tối': 'Toggle light/dark', 'Đổi nền sáng / tối': 'Light / dark mode', 'Chuyển nền tối': 'Switch to dark', 'Chuyển nền sáng': 'Switch to light',
  'Miễn phí giao hàng cho đơn từ 500.000₫': 'Free shipping on orders from 500,000₫', 'Thành viên mới nhập mã GLOWE10 giảm 10%': 'New members: use code GLOWE10 for 10% off',
  'Cam kết 100% mỹ phẩm chính hãng': '100% authentic cosmetics guaranteed', 'Hotline 1900 0000': 'Hotline 1900 0000',
  'Tài khoản của tôi': 'My account', 'Trang quản trị': 'Admin panel', 'Đăng xuất': 'Log out', 'Đăng nhập': 'Log in', 'Đăng ký': 'Sign up',
  'Đang giảm giá': 'On sale now', 'Săn deal son, serum, chống nắng →': 'Deals on lipstick, serum, sunscreen →',
  'Tìm son, serum, kem chống nắng...': 'Search lipstick, serum, sunscreen...',
  'Cam kết': 'Guaranteed', 'Chính hãng 100%': '100% authentic', 'Ưu đãi': 'Offers', 'Dành cho hội viên': 'For members', 'Miễn phí giao': 'Free shipping', 'Đơn từ 500K': 'Orders from 500K',
  'Thanh toán': 'Payment', 'An toàn, đa dạng': 'Safe & flexible', 'Đổi trả': 'Returns', 'Trong 7 ngày': 'Within 7 days', 'Hỗ trợ': 'Support',
  'Cửa hàng mỹ phẩm trực tuyến: chăm sóc da, trang điểm, chống nắng và nước hoa.': 'Online cosmetics store: skincare, makeup, sunscreen and fragrance.',
  'Phương thức thanh toán': 'Payment methods', 'Ví điện tử': 'E-wallet', 'Danh mục': 'Categories', 'Khách hàng': 'Customers',
  'Tài khoản & hội viên': 'Account & membership', 'Theo dõi đơn hàng': 'Track orders', 'Đăng nhập / Đăng ký': 'Log in / Sign up',
  'Hotline:': 'Hotline:', 'Email:': 'Email:', '8:00 – 22:00 mỗi ngày': '8:00 – 22:00 daily', 'Miễn phí giao hàng từ 500.000₫': 'Free shipping from 500,000₫',
  '© 2026 GLOWÉ — Đồ án hệ thống bán mỹ phẩm. Thanh toán trên website là giả lập, không trừ tiền thật.': '© 2026 GLOWÉ — Cosmetics store student project. Payments are simulated; no real money is charged.',
  'Cần hỗ trợ?': 'Need help?', 'Đang tải...': 'Loading...', 'Có lỗi xảy ra, vui lòng thử lại.': 'Something went wrong, please try again.',
  'Đã thêm vào giỏ hàng': 'Added to cart', '+ Giỏ': '+ Cart', 'Hết hàng': 'Out of stock', 'Còn hàng': 'In stock', 'Xem tất cả →': 'See all →',
  // ---- trang chủ ----
  'Ưu đãi tháng 10': 'October deals', 'Rạng rỡ mỗi ngày': 'Glow every day', 'cùng mỹ phẩm chính hãng': 'with authentic cosmetics',
  'Chăm sóc da, trang điểm, chống nắng và nước hoa được tuyển chọn. Miễn phí giao hàng cho đơn từ 500.000₫.': 'Curated skincare, makeup, sunscreen and fragrance. Free shipping on orders from 500,000₫.',
  'Mua sắm ngay': 'Shop now', 'Xem khuyến mãi': 'See promotions', 'Sản phẩm nổi bật': 'Featured products',
  'Lọc theo danh mục, thương hiệu hoặc mức giảm giá': 'Filter by category, brand or discount', 'Tất cả': 'All', 'Tất cả thương hiệu': 'All brands',
  'Thương hiệu': 'Brand', 'Sắp xếp': 'Sort', 'Mới nhất': 'Newest', 'Giảm giá nhiều': 'Biggest discount', 'Giá tăng dần': 'Price: low to high', 'Giá giảm dần': 'Price: high to low',
  'Không tìm thấy sản phẩm phù hợp.': 'No matching products found.',
  'Sale hôm nay': 'Today\'s sale', 'Kết thúc sau': 'Ends in', 'Giá tốt nhất trong ngày, số lượng có hạn': 'Best prices of the day, while stocks last',
  'Mua theo nhu cầu': 'Shop by need', 'Khám phá các dòng sản phẩm được yêu thích nhất': 'Explore our best-loved ranges', 'Khám phá →': 'Explore →',
  'Bộ sưu tập mùa thu': 'Autumn collection', 'Đã bán': 'Sold', 'Gợi ý sản phẩm': 'Suggested products', 'Tìm kiếm phổ biến': 'Popular searches',
  'Xem tất cả kết quả': 'See all results', 'Không có gợi ý phù hợp': 'No suggestions',
  // ---- danh mục, loại da, sản phẩm ----
  'Chăm sóc da': 'Skincare', 'Trang điểm': 'Makeup', 'Làm sạch': 'Cleansing', 'Chống nắng': 'Sun care', 'Nước hoa': 'Fragrance', 'Body': 'Body',
  'Da dầu, mụn': 'Oily, acne-prone skin', 'Da khô, nhạy cảm': 'Dry, sensitive skin', 'Mọi loại da': 'All skin types', 'Da xỉn màu': 'Dull skin',
  'Da nhạy cảm': 'Sensitive skin', 'Da thường, da khô': 'Normal to dry skin', 'Da khô': 'Dry skin', 'Da dầu': 'Oily skin',
  'Serum Niacinamide 10% + Kẽm': 'Niacinamide 10% + Zinc Serum', 'Kem dưỡng ẩm Ceramide phục hồi': 'Ceramide Repair Moisturizer',
  'Toner hoa hồng cân bằng da': 'Rose Balancing Toner', 'Serum Vitamin C 15% sáng da': 'Vitamin C 15% Brightening Serum', 'Mặt nạ ngủ rau má': 'Centella Sleeping Mask',
  'Son kem lì Velvet — Đỏ gạch': 'Velvet Matte Liquid Lipstick — Brick Red', 'Son dưỡng có màu — Hồng đào': 'Tinted Lip Balm — Peach Pink',
  'Cushion che phủ tự nhiên SPF 35': 'Natural Coverage Cushion SPF 35', 'Mascara dày mi chống nước': 'Waterproof Volumizing Mascara',
  'Bảng phấn mắt 9 ô Terracotta': 'Terracotta 9-Shade Eyeshadow Palette', 'Sữa rửa mặt dịu nhẹ pH 5.5': 'Gentle pH 5.5 Cleanser',
  'Nước tẩy trang Micellar': 'Micellar Cleansing Water', 'Dầu tẩy trang hoa trà': 'Camellia Cleansing Oil', 'Kem chống nắng nâng tông SPF 50+': 'Tone-up Sunscreen SPF 50+',
  'Xịt chống nắng body SPF 50': 'Body Sunscreen Spray SPF 50', 'Eau de Parfum Hoa Nhài Sài Gòn': 'Saigon Jasmine Eau de Parfum', 'Body Mist Đào & Trà Trắng': 'Peach & White Tea Body Mist',
  'Serum giúp se khít lỗ chân lông, giảm dầu thừa và làm đều màu da. Kết cấu mỏng nhẹ, thấm nhanh.': 'Minimizes pores, controls excess oil and evens skin tone. Lightweight, fast-absorbing texture.',
  'Kem dưỡng chứa ceramide và panthenol, củng cố hàng rào bảo vệ da, phù hợp da nhạy cảm.': 'With ceramides and panthenol to strengthen the skin barrier. Suitable for sensitive skin.',
  'Nước cân bằng chiết xuất hoa hồng Damask, không cồn, cấp ẩm tức thì sau bước làm sạch.': 'Alcohol-free Damask rose toner that hydrates instantly after cleansing.',
  'Vitamin C dạng ổn định kết hợp vitamin E, giúp mờ thâm và mang lại làn da rạng rỡ.': 'Stabilized vitamin C with vitamin E to fade dark spots for radiant skin.',
  'Mặt nạ ngủ làm dịu da, giảm đỏ, thức dậy với làn da căng mọng.': 'Overnight mask that soothes and reduces redness. Wake up to plump skin.',
  'Son kem lì mịn như nhung, lên màu chuẩn, giữ màu đến 8 giờ, không khô môi.': 'Velvety matte lipstick with true color that lasts up to 8 hours without drying lips.',
  'Son dưỡng chứa dầu jojoba, màu hồng đào tự nhiên cho đôi môi căng mọng.': 'Jojoba oil lip balm with a natural peach tint for plump lips.',
  'Lớp nền mỏng nhẹ, che phủ vừa, hoàn thiện căng bóng. Kèm lõi thay thế.': 'Lightweight medium-coverage base with a dewy finish. Refill included.',
  'Đầu chải cong ôm mi, làm dày và dài mi, không lem trong 12 giờ.': 'Curved brush that volumizes and lengthens lashes, smudge-free for 12 hours.',
  '9 tông màu đất ấm áp, gồm nhũ và lì, dễ phối cho cả ngày lẫn đêm.': '9 warm earthy shades in shimmer and matte, easy to wear day or night.',
  'Gel rửa mặt tạo bọt mịn, làm sạch sâu mà không gây khô căng.': 'Foaming gel cleanser that cleans deeply without tightness.',
  'Làm sạch lớp trang điểm và bụi bẩn chỉ với một bông tẩy trang, không cần rửa lại.': 'Removes makeup and impurities with one cotton pad. No rinsing needed.',
  'Nhũ hóa nhanh khi gặp nước, cuốn trôi kem chống nắng và son lì bền màu.': 'Emulsifies quickly with water to wash away sunscreen and long-wear lipstick.',
  'Chống nắng phổ rộng, nâng tông nhẹ, không vệt trắng, kiềm dầu suốt ngày.': 'Broad-spectrum protection with a light tone-up, no white cast, all-day oil control.',
  'Dạng xịt tiện lợi, thấm nhanh, chống nước, phù hợp đi biển và vận động ngoài trời.': 'Convenient, fast-absorbing, water-resistant spray for beach days and outdoor sports.',
  'Hương hoa nhài trắng hòa quyện xạ hương ấm, lưu hương 6–8 giờ.': 'White jasmine blended with warm musk. Lasts 6–8 hours.',
  'Xịt thơm toàn thân tươi mát, nhẹ nhàng cho ngày dài năng động.': 'A fresh, light all-over body spray for active days.',
  // ---- chi tiết sản phẩm, giỏ, thanh toán ----
  'Trang chủ': 'Home', 'Dung tích': 'Size', 'Loại da': 'Skin type', 'Tình trạng': 'Availability', 'Số lượng': 'Quantity', 'Thêm vào giỏ': 'Add to cart', 'Mua ngay': 'Buy now',
  'Sản phẩm cùng danh mục': 'Related products', 'Giỏ hàng đang trống.': 'Your cart is empty.', 'Tiếp tục mua sắm': 'Continue shopping', 'Tạm tính': 'Subtotal',
  'Phí giao hàng': 'Shipping', 'Miễn phí': 'Free', 'Tổng cộng': 'Total', 'Tiến hành thanh toán': 'Proceed to checkout', 'Tóm tắt đơn hàng': 'Order summary',
  'Sản phẩm đã hết hàng — vui lòng xóa khỏi giỏ.': 'This product is out of stock — please remove it from your cart.',
  'Thông tin giao hàng': 'Shipping information', 'Họ tên người nhận': 'Recipient name', 'Số điện thoại': 'Phone number', 'Địa chỉ nhận hàng': 'Shipping address',
  'Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành': 'Street, ward, district, city/province', 'Ghi chú': 'Notes',
  'Giao giờ hành chính, gọi trước khi giao...': 'Deliver during office hours, call before delivery...',
  'Thanh toán khi nhận hàng (COD)': 'Cash on delivery (COD)', 'Trả tiền mặt cho shipper': 'Pay the courier in cash', 'Thẻ ngân hàng': 'Bank card', 'Thẻ': 'Card',
  'Thẻ ngân hàng (giả lập)': 'Bank card (simulated)', 'Ví điện tử (giả lập)': 'E-wallet (simulated)',
  'Visa / Mastercard / ATM — nhập thẻ ở bước tiếp theo': 'Visa / Mastercard / ATM — enter your card in the next step',
  'Quét mã QR ở bước tiếp theo': 'Scan the QR code in the next step', 'Đặt hàng': 'Place order',
  'Đặt hàng là đồng ý với điều khoản mua bán của GLOWÉ.': 'By placing an order you agree to GLOWÉ\'s terms of sale.',
  'Miễn phí giao hàng cho đơn từ 500.000₫ · Đổi trả trong 7 ngày nếu sản phẩm lỗi.': 'Free shipping on orders from 500,000₫ · Returns within 7 days for defective items.',
  'Họ tên bắt buộc; SĐT gồm 10 số bắt đầu bằng 0.': 'Name is required; phone must be 10 digits starting with 0.',
  'Vui lòng điền đủ thông tin; số điện thoại gồm 10 số bắt đầu bằng 0.': 'Please fill in all fields; phone must be 10 digits starting with 0.',
  'Đặt hàng thành công! Cảm ơn bạn đã mua sắm tại GLOWÉ.': 'Order placed! Thank you for shopping at GLOWÉ.', 'Thanh toán thành công!': 'Payment successful!',
  // ---- đơn hàng, trạng thái ----
  'Chi tiết đơn hàng': 'Order details', 'Đơn hàng': 'Orders', 'Mã đơn': 'Order ID', 'Ngày đặt': 'Order date', 'Trạng thái': 'Status', 'Thanh toán lỗi': 'Payment failed',
  'Chờ xác nhận': 'Pending', 'Đã xác nhận': 'Confirmed', 'Đang giao': 'Shipping', 'Hoàn thành': 'Completed', 'Đã hủy': 'Cancelled',
  'Chưa thanh toán': 'Unpaid', 'Đã thanh toán': 'Paid', 'Đã hoàn tiền': 'Refunded', 'Thành công': 'Successful',
  'Đã đặt hàng': 'Order placed', 'Đã nhận hàng': 'Delivered', 'Hủy đơn hàng': 'Cancel order', 'Đã hủy đơn hàng': 'Order cancelled',
  'Đơn giá': 'Unit price', 'Thành tiền': 'Amount', 'Tổng': 'Total', 'Tổng tiền': 'Total', 'Giao đến': 'Ship to', 'Lịch sử thanh toán': 'Payment history',
  'Thanh toán chưa thành công': 'Payment not completed', 'Đặt hàng thành công': 'Order placed successfully', 'Đơn hàng đã được xác nhận': 'Order confirmed',
  'Đơn hàng đang được giao': 'Order out for delivery', 'Đơn hàng đã bị hủy': 'Order cancelled', 'Đã thu tiền khi giao hàng': 'Paid on delivery',
  'Đang xử lý': 'Processing', 'Đang xử lý...': 'Processing...',
  // ---- tài khoản, thông báo ----
  'Tổng đơn đã mua': 'Total orders', 'Tổng tiền đã chi': 'Total spent', 'Đã chi': 'Spent', 'trên đơn đã thanh toán': 'on paid orders', 'xem tiến độ bên dưới': 'see progress below',
  'không có đơn đang chờ': 'no pending orders', 'Tiến độ đơn hàng': 'Order progress', 'Tiến độ': 'Progress', 'Thông tin cá nhân': 'Personal info',
  'Họ và tên': 'Full name', 'Họ tên': 'Full name', 'Địa chỉ mặc định': 'Default address', 'Lưu thay đổi': 'Save changes', 'Đã lưu thông tin': 'Information saved',
  'Lịch sử đơn hàng': 'Order history', 'Bạn chưa có đơn hàng nào.': 'You have no orders yet.', 'Không có đơn hàng.': 'No orders.',
  'Đánh dấu đã đọc': 'Mark all as read', 'Xác nhận': 'Confirmed', 'Giao & nhận': 'Delivery', 'Khác': 'Other',
  'Chưa có thông báo nào.': 'No notifications yet.', 'Xem tiến độ đơn hàng của tôi →': 'View my order progress →',
  'Đã đánh dấu tất cả là đã đọc': 'All notifications marked as read', 'Vừa xong': 'Just now', 'Đơn hàng của bạn': 'Your orders',
  // ---- đăng nhập ----
  'Chào mừng trở lại': 'Welcome back', 'Tạo tài khoản mới': 'Create an account', 'Đăng nhập để tiếp tục mua sắm tại GLOWÉ': 'Log in to keep shopping at GLOWÉ',
  'Chỉ mất 30 giây — nhận ưu đãi thành viên ngay': 'Takes 30 seconds — get member offers right away', 'Chọn đăng nhập hoặc đăng ký': 'Choose log in or sign up',
  'Mật khẩu': 'Password', 'Hiện/ẩn mật khẩu': 'Show/hide password', 'Ghi nhớ 7 ngày': 'Remember me for 7 days', 'Quên mật khẩu?': 'Forgot password?',
  'HOẶC': 'OR', 'Chưa có tài khoản?': 'Don\'t have an account?', 'Đã có tài khoản?': 'Already have an account?', 'Đăng ký ngay': 'Sign up now',
  'Tài khoản demo — bấm để điền': 'Demo accounts — click to fill', 'Quản trị viên': 'Administrator', 'Về cửa hàng': 'Back to store',
  'Tài khoản đăng ký trên web là': 'Accounts registered on the web are', 'mua sắm': 'shopping', '. Tài khoản quản trị do admin cấp.': '. Admin accounts are issued by an admin.',
  'Vui lòng nhập email và mật khẩu (tối thiểu 6 ký tự).': 'Please enter your email and password (at least 6 characters).',
  'Vui lòng điền đủ thông tin; SĐT gồm 10 số bắt đầu bằng 0, mật khẩu tối thiểu 6 ký tự.': 'Please fill in all fields; phone must be 10 digits starting with 0, password at least 6 characters.',
  'Liên hệ hotline 1900 0000 hoặc email hotro@glowe.vn để đặt lại mật khẩu': 'Contact hotline 1900 0000 or hotro@glowe.vn to reset your password',
  'Ưu đãi thành viên mỗi tháng': 'Monthly member offers', 'Đổi trả trong 7 ngày': '7-day returns', '100% mỹ phẩm chính hãng': '100% authentic cosmetics',
  'Thanh toán thẻ, ví hoặc khi nhận hàng': 'Pay by card, e-wallet or on delivery', 'Son lì': 'Matte lipstick', 'Serum': 'Serum',
  // ---- quản trị ----
  'Quản trị': 'Admin', 'QUẢN TRỊ': 'ADMIN', 'Dashboard': 'Dashboard', 'Mỹ phẩm': 'Products', 'Người dùng': 'Users',
  'Tổng quan kinh doanh 30 ngày gần nhất': 'Business overview, last 30 days', 'Doanh thu 30 ngày': 'Revenue (30 days)', 'Đơn hàng 30 ngày': 'Orders (30 days)',
  'Giá trị TB / đơn': 'Avg. order value', 'Doanh thu': 'Revenue', 'Doanh thu theo ngày': 'Revenue by day', 'Doanh thu & biểu đồ theo ngày': 'Revenue & daily chart',
  'Doanh thu theo danh mục': 'Revenue by category', 'Biểu đồ cột': 'Bar chart', 'Biểu đồ tròn': 'Pie chart', 'Biểu đồ theo ngày': 'Daily chart',
  'Top 5 bán chạy': 'Top 5 best sellers', 'theo số lượng': 'by quantity', 'Đơn hàng mới nhất': 'Latest orders', 'Xử lý ngay →': 'Handle now →',
  'Sắp hết hàng (≤ 5)': 'Low stock (≤ 5)', 'đơn hợp lệ': 'valid orders', 'đơn hàng': 'orders', 'Số đơn': 'Orders', 'Đơn': 'Orders',
  'Xử lý đơn theo từng bước': 'Process orders step by step', 'Xử lý đơn từng bước': 'Process orders step by step', 'Lọc đơn hàng': 'Filter orders',
  'Lọc trạng thái': 'Filter status', 'Tất cả trạng thái': 'All statuses', 'Trạng thái đơn': 'Order status', 'Không có đơn phù hợp.': 'No matching orders.', 'Xử lý': 'Action',
  'Thêm, sửa, ngừng bán và tồn kho': 'Add, edit, discontinue and manage stock', 'Quản lý mỹ phẩm & tồn kho': 'Manage products & stock',
  'Thêm mỹ phẩm': 'Add product', 'Sửa mỹ phẩm': 'Edit product', 'Sửa': 'Edit', 'Giá': 'Price', 'Tồn': 'Stock', 'Tồn kho': 'Stock',
  'Đang bán': 'Active', 'Ngừng bán': 'Discontinued', 'Đang kinh doanh': 'Active', 'Tên sản phẩm': 'Product name', 'Link ảnh (tùy chọn)': 'Image URL (optional)',
  'https://... (dán link ảnh .jpg, .png, .webp)': 'https://... (paste a .jpg, .png, .webp link)', 'Xóa ảnh': 'Remove image',
  'Bỏ ảnh, dùng biểu tượng danh mục': 'Remove image, use category icon', 'Giá bán (₫)': 'Price (₫)', 'Giá gốc (₫, nếu giảm giá)': 'Original price (₫, if discounted)',
  'Trợ lý Glowie': 'Glowie assistant', 'Trợ lý mua sắm GLOWÉ': 'GLOWÉ shopping assistant', 'Cuộc trò chuyện mới': 'New conversation', 'Đóng': 'Close',
  'Hỏi Glowie về sản phẩm, đơn hàng...': 'Ask Glowie about products, orders...', 'Tin nhắn': 'Message', 'Gửi': 'Send',
  'Danh mục sản phẩm': 'Product categories', 'Chọn danh mục để xem sản phẩm, bấm lần nữa để bỏ lọc': 'Pick a category to browse, click again to clear', 'Bỏ lọc': 'Clear filter',
  'Mô tả': 'Description', 'tất cả': 'all', 'vào Dashboard': 'opens Dashboard', 'Mua thêm': 'Add', 'để được miễn phí giao hàng': 'more for free shipping', 'Đổi trả trong 7 ngày nếu sản phẩm lỗi': 'Returns within 7 days for defective items', 'Xác nhận đơn': 'Confirm', 'Bắt đầu giao': 'Ship', 'Đã giao xong': 'Mark delivered', 'Hủy đơn': 'Cancel', 'Hủy': 'Cancel', 'Lưu': 'Save', 'Đã lưu mỹ phẩm': 'Product saved', 'Đã cập nhật': 'Updated',
  'Chưa có ảnh: cửa hàng sẽ hiện biểu tượng của danh mục.': 'No image: the store shows the category icon.', 'Đang tải ảnh...': 'Loading image...',
  'Khách hàng và tài khoản quản trị': 'Customers and admin accounts', 'Khóa / mở tài khoản khách': 'Lock / unlock customer accounts',
  'Vai trò': 'Role', 'Khóa': 'Lock', 'Mở khóa': 'Unlock', 'Đã khóa': 'Locked', 'Admin': 'Admin', 'Liên hệ': 'Contact', 'Giao hàng': 'Delivery', 'Tăng': 'Up', 'Giảm': 'Down',
  '⚠ Link ảnh phải bắt đầu bằng http:// hoặc https://': '⚠ Image URL must start with http:// or https://',
  '⚠ Không tải được ảnh — kiểm tra lại link (phải là link trực tiếp tới file ảnh, mở được ở tab ẩn danh).': '⚠ Could not load the image — check the link (it must point directly to an image file and open in a private tab).',
  // ---- lỗi từ máy chủ ----
  'Thẻ bị ngân hàng từ chối': 'Card declined by the bank', 'Số dư tài khoản không đủ': 'Insufficient funds', 'Số thẻ không hợp lệ': 'Invalid card number',
  'Ngày hết hạn phải có dạng MM/YY': 'Expiry date must be MM/YY', 'Thẻ đã hết hạn': 'Card has expired', 'Số điện thoại ví không hợp lệ': 'Invalid e-wallet phone number',
  'Ví không đủ số dư': 'Insufficient e-wallet balance', 'giao dịch bị từ chối': 'transaction declined',
  'Email hoặc mật khẩu không đúng': 'Incorrect email or password', 'Email này đã được đăng ký': 'This email is already registered', 'Email không hợp lệ': 'Invalid email',
  'Mật khẩu tối thiểu 6 ký tự': 'Password must be at least 6 characters', 'Vui lòng nhập họ tên': 'Please enter your name', 'Bạn cần đăng nhập': 'Please log in',
  'Tài khoản đã bị khóa': 'This account is locked', 'Tài khoản không tồn tại hoặc đã bị khóa': 'Account does not exist or is locked',
  'Số điện thoại gồm 10 số, bắt đầu bằng 0': 'Phone must be 10 digits starting with 0', 'Giỏ hàng trống': 'Cart is empty',
  'Vui lòng nhập tên người nhận và địa chỉ': 'Please enter the recipient name and address', 'Không tìm thấy sản phẩm': 'Product not found',
  'Không tìm thấy đơn hàng': 'Order not found', 'Chỉ hủy được đơn chưa giao': 'Only orders not yet shipped can be cancelled', 'Chỉ quản trị viên được thực hiện': 'Admins only',
};

// Câu có số, mã đơn, tên riêng: [biểu thức, câu tiếng Anh]
const PATTERNS = [
  [/^(\d+) sản phẩm$/, '$1 products'], [/^(\d+) sản phẩm cho “(.+)”$/, '$1 products for “$2”'], [/^(\d+) sản phẩm · (.+?)( cho “(.+)”)?$/, (m, n, c, x, q) => `${n} products · ${tr(c) ?? c}${q ? ` for “${q}”` : ''}`], [/^(\d+) mỹ phẩm$/, '$1 products'],
  [/^(\d+) đơn$/, '$1 orders'], [/^(\d+) đơn hàng$/, '$1 orders'], [/^(\d+) tài khoản$/, '$1 accounts'], [/^(\d+) đơn đã hủy$/, '$1 cancelled'],
  [/^(\d+) đơn đang xử lý$/, '$1 orders in progress'], [/^trên (\d+) đơn đã thanh toán$/, 'across $1 paid orders'],
  [/^(\d+) (phút|giờ|ngày) trước$/, (m, n, u) => `${n} ${{ 'phút': 'min', 'giờ': 'h', 'ngày': 'days' }[u]} ago`],
  [/^([▲▼]) (\d+)% so với tuần trước$/, '$1 $2% vs last week'], [/^(\d+) sp · (.+) tr$/, '$1 items · $2M'],
  [/^Đặt lúc (.+)$/, 'Ordered $1'], [/^Đơn (GL\d+)$/, 'Order $1'], [/^(\d+)% so với tuần trước$/, '$1% vs last week'], [/^Tham gia (.+)$/, 'Joined $1'], [/^Thành viên từ (.+)$/, 'Member since $1'], [/^Xin chào, (.+)$/, 'Hello, $1'],
  [/^Thêm (.+) vào giỏ$/, (m, n) => `Add ${tr(n) || n} to cart`], [/^Xóa (.+)$/, (m, n) => `Remove ${tr(n) || n}`], [/^Số lượng (.+)$/, (m, n) => `Quantity of ${tr(n) || n}`],
  [/^(.+) × (\d+)$/, (m, n, q) => `${tr(n) || n} × ${q}`], [/^(.+) \| GLOWÉ( Quản trị)?$/, (m, n, a) => `${tr(n) || n} | GLOWÉ${a ? ' Admin' : ''}`],
  [/^Xem tất cả kết quả \((\d+)\)$/, 'See all results ($1)'], [/^Còn (\d+)$/, '$1 left'], [/^Kết quả cho “(.+)”$/, 'Results for “$1”'],
  [/^GLOWÉ đang chuẩn bị hàng cho đơn (\S+)\.$/, 'GLOWÉ is preparing order $1.'],
  [/^Đã nhận thanh toán (.+) qua (.+)\. GLOWÉ đang chuẩn bị hàng cho đơn (\S+)\.$/, (m, a, w, c) => `Received payment of ${a} via ${{ 'khi nhận hàng': 'cash on delivery', 'thẻ ngân hàng': 'bank card', 'ví điện tử': 'e-wallet' }[w] || w}. GLOWÉ is preparing order ${c}.`],
  [/^Đơn (\S+) \((.+)\) đã được ghi nhận\. Bạn thanh toán khi nhận hàng\.$/, 'Order $1 ($2) has been received. You will pay on delivery.'],
  [/^Đơn (\S+) \((.+)\) đã được ghi nhận\. Vui lòng hoàn tất thanh toán để đơn được xác nhận\.$/, 'Order $1 ($2) has been received. Please complete payment to confirm it.'],
  [/^Đơn (\S+): (.+)\. Bạn có thể thanh toán lại trong trang đơn hàng\.$/, (m, c, r) => `Order ${c}: ${tr(r) ?? r}. You can retry payment on the order page.`],
  [/^Đơn (\S+) đã được giao cho đơn vị vận chuyển, bạn để ý điện thoại nhé\.$/, 'Order $1 has been handed to the courier — keep your phone nearby.'],
  [/^Đơn (\S+) đã giao thành công\. Cảm ơn bạn đã mua sắm tại GLOWÉ!$/, 'Order $1 was delivered. Thank you for shopping at GLOWÉ!'],
  [/^Đơn (\S+) đã được hủy (bởi GLOWÉ|theo yêu cầu của bạn)\.(?: Số tiền (.+) sẽ được hoàn lại\.)?$/, (m, c, by, a) => `Order ${c} was cancelled ${by === 'bởi GLOWÉ' ? 'by GLOWÉ' : 'at your request'}.${a ? ` ${a} will be refunded.` : ''}`],
  [/^Thanh toán thẻ thành công$/, 'Card payment successful'], [/^Thanh toán ví điện tử thành công$/, 'E-wallet payment successful'],
  [/^Thẻ bị ngân hàng từ chối$/, 'Card declined by the bank'], [/^thẻ (•••• \d+)$/, 'card $1'], [/^Mã GD (.+)$/, 'Txn $1'],
  [/^"(.+)" chỉ còn (\d+) sản phẩm$/, '"$1" has only $2 left'], [/^"(.+)" đã ngừng kinh doanh$/, '"$1" has been discontinued'],
  [/^Đăng nhập bằng (.+) chưa được kết nối trong bản demo$/, '$1 login is not connected in this demo'],
];

// Dịch 1 chuỗi; trả null nếu không có bản dịch. Giữ nguyên emoji / ký hiệu ở đầu-cuối câu.
function tr(s) {
  if (DICT[s] !== undefined) return DICT[s];
  const m = s.match(/^([^\p{L}\d"“]*)(.*?)([\s:.!?→…]*)$/su);
  const core = m[2];
  if (!core) return null;
  for (const [re, rep] of PATTERNS) if (re.test(s)) return s.replace(re, rep); // mẫu khớp cả câu (kể cả dấu chấm cuối)
  let out = DICT[core];
  if (out === undefined) for (const [re, rep] of PATTERNS) if (re.test(core)) { out = core.replace(re, rep); break; }
  if (out === undefined && core.includes(', ')) { // danh sách tên, chỉ dịch khi dịch được hết
    const parts = core.split(', ').map(tr);
    if (parts.every(x => x !== null)) out = parts.join(', ');
  }
  if (out === undefined && core.includes(' · ')) {
    const parts = core.split(' · ').map(p => tr(p) ?? p);
    out = parts.join(' · ');
    if (out === core) out = undefined;
  }
  return out === undefined ? null : m[1] + out + m[3];
}

if (Lang.get() === 'en') {
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const doText = (n) => {
    if (/^(SCRIPT|STYLE)$/.test(n.parentNode?.nodeName)) return;
    const v = n.nodeValue, s = v.trim();
    if (!s || !/[^\x00-\x7F]|[a-z]/i.test(s)) return;
    const t = tr(s);
    if (t !== null && t !== s) n.nodeValue = v.replace(s, t);
  };
  const doEl = (el) => {
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = tr(v.trim()); if (t !== null && t !== v) el.setAttribute(a, t); } }
  };
  const walk = (root) => {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || root.nodeName === 'SCRIPT' || root.nodeName === 'STYLE') return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (w.nextNode()) w.currentNode.nodeType === 3 ? doText(w.currentNode) : doEl(w.currentNode);
  };
  new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') doText(r.target);
      else doEl(r.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('DOMContentLoaded', () => { walk(document.body); document.title = tr(document.title) ?? document.title; });
}
