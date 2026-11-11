# Quản lý kinh doanh: tra cứu đơn hàng

Cập nhật: 2026-11-10. Trạng thái: đã mount backend, chưa kết nối frontend.

## Phạm vi

SA và FA tra cứu đơn hàng, KPI và xuất danh sách. Dữ liệu đọc từ `payment_transactions` và `users`. Không cập nhật giao dịch, enrollment hay hồ sơ học viên. Các số liệu trong tài liệu UI là mock; API tính từ CSDL.

## API

Tất cả endpoint dưới `/api/admin/business/orders` và alias `/api/v1/admin/business/orders`; bắt buộc phiên Admin và role SA hoặc FA. Thiếu phiên theo middleware Admin; sai role trả 403 `ADMIN_FORBIDDEN`.

| Method/path | Mục đích | Thành công |
| --- | --- | --- |
| `GET /` | Danh sách phân trang | `{success,items,total,page,pageSize}` |
| `GET /summary` | KPI theo khoảng ngày tạo | `{success,total,successCount,pendingCount,cancelledCount}` |
| `GET /:id` | Chi tiết theo mã đơn hoặc giao dịch | `{success,order}` |
| `GET /export?format=csv\|excel` | Xuất toàn bộ kết quả lọc | CSV UTF-8 hoặc Excel 2003 XML `.xls` |

Danh sách và export dùng cùng bộ lọc `q`, `status=success|pending|cancelled`, `method`, `from`, `to`, `sort=newest|oldest`; danh sách thêm `page` (mặc định 1) và `pageSize` (mặc định 8, tối đa 100). Export bỏ phân trang. `q` khớp mã đơn, mã giao dịch, tên hoặc email học viên. Lỗi tham số trả 400 `ORDER_QUERY_INVALID`; mã không tồn tại trả 404 `ORDER_NOT_FOUND`.

Mỗi item gồm mã đơn/giao dịch, ID/tên/email học viên, trạng thái chuẩn và trạng thái nguồn, phương thức, số tiền/tiền tệ, ngày tạo/thanh toán, mã hóa đơn, voucher, chiết khấu, subtotal, total và khóa học. Trường không có dữ liệu trả `null`. Không trả nguyên document MongoDB.

## Quy tắc và ảnh hưởng

`completed`, `paid`, `success` hiển thị nhóm thành công; `failed`, `cancelled`, `expired` hiển thị nhóm đã hủy; `pending` giữ nguyên. Bản ghi receipt không được tính là đơn. Dữ liệu legacy `order_summary` dạng JSON string và ngày dạng chuỗi được chuẩn hóa khi đọc. Học viên không nối được hồ sơ vẫn hiển thị giao dịch, tên/email là `null`.

Đây là API chỉ đọc giao dịch và hồ sơ học viên. Không thay đổi quyền học, trạng thái thanh toán, thông báo hoặc số dư. Export có thể chứa tên/email nên chỉ SA/FA được truy cập. CSV và Excel escape nội dung để tránh công thức từ dữ liệu nguồn.

## Nguồn và kiểm tra

Mã nguồn: `server/src/admin/business/orders.admin.js`; mount: `server/src/server.js`. Dữ liệu mock đã được chuẩn hóa riêng và sao lưu trong `server/output/`. Chưa chạy test/build theo yêu cầu `admin_rules.md` (chỉ chạy khi người dùng yêu cầu). Chưa xác minh runtime endpoint.
