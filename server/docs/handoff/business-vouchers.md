# Quản lý kinh doanh: voucher

Cập nhật: 2026-11-10. Trạng thái: backend đã có API và dữ liệu demo, frontend chưa nối API. Đã chạy kiểm tra voucher, payment và cart.

## Phạm vi và dữ liệu

Admin SA/FA quản lý voucher trong `business_vouchers`. API đọc thêm `platform_coupons`, `payment_vouchers`, `course_coupons` để hiển thị dữ liệu cũ; chỉ voucher ở collection mới được sửa/khóa/xóa qua API này. `courses.instructor_id` là nguồn kiểm tra khóa học thuộc giảng viên. `payment_transactions` lưu voucher đã giữ và snapshot giảm giá. `admin_audit_logs` lưu thao tác Admin.

Nguồn mới có unique index `code`; ba collection cũ chỉ có index `_id`, và `THINKUP15` trùng giữa platform/payment. Chưa migration mã cũ. Đã seed 50 voucher demo bằng `server/scripts/seed-business-vouchers-demo.js`: 25 ThinkUp, 25 giảng viên; 20 active, 10 scheduled, 10 locked, 10 expired. File preview nằm trong `server/output/` và được Git bỏ qua.

## API Admin

Mount `/api/admin/business/vouchers` và `/api/v1/admin/business/vouchers`. Tất cả route cần Admin auth và SA/FA.

| Method/path | Chức năng |
| --- | --- |
| `GET /summary` | KPI và chiết khấu thực tế đã ghi nhận trong đơn thành công; khoản legacy chưa rõ nhà tài trợ nằm ở `unattributedDiscount` |
| `GET /` | Danh sách phân trang, lọc `q`, `sponsor`, `status` |
| `GET /export?format=csv\|excel` | Xuất toàn bộ kết quả theo cùng bộ lọc, CSV UTF-8 hoặc Excel XML `.xls` |
| `GET /:code` | Chi tiết mọi bản ghi cùng mã, gồm mã legacy trùng |
| `POST /` | Tạo voucher mới |
| `PATCH /:code` | Sửa theo trạng thái; body cần `version` |
| `POST /:code/lock`, `/unlock` | Khóa/mở một mã |
| `POST /bulk-lock`, `/bulk-unlock` | Xử lý tối đa 50 mã, trả kết quả từng mã |
| `DELETE /:code` | Xóa mềm voucher chưa dùng |

Các lỗi nghiệp vụ dùng 400 `VOUCHER_INVALID`, 403 `ADMIN_FORBIDDEN`, 404 `VOUCHER_NOT_FOUND`, 409 `VOUCHER_DUPLICATE`/`VOUCHER_CHANGED`/`VOUCHER_STATE` hoặc 503 khi transaction/audit không khả dụng. Mã và nguồn tài trợ bất biến sau khi tạo. Voucher đang hoạt động chỉ cho chỉnh mô tả, trần giảm, đơn tối thiểu, tăng lượt và gia hạn; voucher chưa bắt đầu có thể chỉnh thêm phạm vi/điều kiện. Thao tác ghi cùng audit trong MongoDB transaction.

## Checkout và ảnh hưởng học viên

Giỏ hàng và checkout đọc voucher mới. Voucher giảng viên chỉ giảm giá khóa có `instructor_id` trùng và nằm trong danh sách đích. Checkout ghi nguồn tài trợ, giảng viên, khóa đủ điều kiện và phân bổ giảm giá vào snapshot đơn. Giữ lượt bằng cập nhật có `version`/trạng thái và transaction. Phiên đã tạo trước khi khóa giữ snapshot; khóa trước khi tạo phiên trả 409 `VOUCHER_UNAVAILABLE` để client yêu cầu khách bỏ mã và xác nhận lại giá. Hủy/hết hạn/thất bại dùng luồng giải phóng lượt hiện có.

Tác động: voucher active có thể thay đổi giá mua mới cho một học viên, một nhóm hoặc tất cả theo phạm vi. Đơn đã tạo không tính lại. Dữ liệu lịch sử thiếu nguồn tài trợ nên chiết khấu lịch sử không thể phân hết cho ThinkUp/giảng viên.

## Hạn chế cần xử lý tiếp

`POST /api/user/cart/voucher/validate` nhận thêm `courseIds` cho voucher mới và tính lại giá từ giỏ/khóa học phía server. Nếu thiếu `courseIds`, voucher mới trả thông báo cần chọn khóa học. Voucher cũ vẫn dùng contract `code`/`eligibleSubtotal`; chưa migration voucher cũ, nên chúng vẫn theo luồng checkout cũ. Frontend chưa gửi `courseIds` theo contract mới.

Kiểm tra đã chạy: `node --test src/admin/business/test/vouchers.admin.test.js` đạt 3/3; `node --check` trên module Admin, voucher, cart, payment và server đều đạt. Sau khi sửa cấu hình test và mặc định xác minh callback VNPay, `node --test src/user/payment/test/payment.test.js` đạt 44/44 khi chạy ngoài sandbox để dùng HTTP nội bộ. `node --test src/user/cart/test/cart.user.test.js` đạt 15/15 trên database cô lập `Thinkup_cart_test_20261110`; test yêu cầu tiền tố database test và đóng kết nối sau khi dọn fixture. Chưa xác minh runtime endpoint Admin có phiên đăng nhập thật.

Kiểm tra bổ sung ngày 2026-11-10: `node --test src/user/payment/test/payment.test.js src/admin/business/test/vouchers.admin.test.js` đạt 51/51. Bài kiểm tra gọi HTTP API Admin với middleware vai trò giả lập, xác nhận SA/FA được thao tác, CA bị từ chối; kiểm tra giới hạn theo học viên, hoàn lượt khi thất bại/hết hạn và gọi lại không hoàn trùng; snapshot checkout chỉ phân bổ giảm giá cho khóa của giảng viên. `MONGODB_DB_NAME=Thinkup_cart_test_voucher10 node --test src/user/cart/test/cart.user.test.js` đạt 16/16 trên database test riêng; giỏ hàng chọn hai khóa của hai giảng viên chỉ giảm khóa thuộc giảng viên tài trợ. `MONGODB_DB_NAME=Thinkup_voucher_test_1110 node --test src/admin/business/test/vouchers.mongo.integration.test.js` đạt 1/1 trên MongoDB test: dùng middleware xác thực Admin thật với token ký cho tài khoản test, gọi API qua HTTP và chạy đồng thời giữ lượt/khóa trong MongoDB transaction. Đã chạy cuộc đua hai lần; bản ghi test được dọn sau mỗi lần. Chưa chạy trình duyệt với frontend và chưa dùng phiên đăng nhập Admin thông qua giao diện.
