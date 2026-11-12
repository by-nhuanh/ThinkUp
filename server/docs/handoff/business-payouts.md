# Bàn giao backend payout giảng viên

Cập nhật: 2026-11-10. Phạm vi: `server/`. **Bối cảnh hiện tại:** module giảng viên đang được xây dựng; phân hệ Admin payout dùng dữ liệu mock để diễn tập duyệt/từ chối, lọc, KPI và export. API Admin cũng giữ điều kiện an toàn cho yêu cầu thật có khoản giữ được xác minh, nhưng chưa có luồng tạo yêu cầu hay xác nhận giải ngân vì nguồn doanh thu, hợp đồng thuế và hợp đồng API kế toán chưa được cung cấp. Không xem các bản ghi demo là khoản tiền đã chi thực.

## Dữ liệu và tác động

- **Hiện có:** `payout_requests` chứa 30 bản ghi `is_demo: true` (12 pending, 6 approved, 8 paid, 4 rejected) tại thời điểm kiểm tra trước các test. Chúng được hiển thị với `isDemo: true`, có thể duyệt/từ chối để thử luồng Admin và được tính vào `kpi` hiển thị. Response trả thêm `demoKpi`, `realKpi` và `containsDemo` để phân biệt số liệu. CSV/Excel có cột nhận diện dữ liệu minh họa. Các trạng thái paid trong nhóm này không chứng minh đã chuyển tiền.
- **Đã bổ sung:** `instructor_wallets` có unique index `instructor_id`; 40 ví có `available_balance = pending_balance = frozen_balance = 0`. `pending_balance` dành cho doanh thu trong 7 ngày chờ; `available_balance` mới là tiền có thể yêu cầu rút. `instructor_wallet_ledger` có unique index `(request_id, action)` và hiện có 0 bút toán. Script `scripts/prepare-instructor-payout-wallets.js` hỗ trợ dry-run và `--apply`, chỉ thêm ví/trường pending còn thiếu, không ghi đè số dư đã có.
- **Đã có:** `admin_audit_logs` và `admin_user_email_outbox`. Duyệt/từ chối ghi audit cùng transaction. Với yêu cầu thật, từ chối ghi thêm bút toán hoàn tiền và outbox email cùng transaction. Với yêu cầu mock, chỉ đổi trạng thái và ghi audit có cờ `is_demo`; không thay đổi ví/sổ cái, không gửi email.
- **Đã đối chiếu 29 dòng lịch sử:** `scripts/backfill-instructor-revenue-split.js` đã cập nhật 29/29 dòng trong transaction theo tỷ lệ mỗi khóa học 60% ThinkUp / 40% giảng viên. Không voucher: 18; voucher ThinkUp tài trợ: 7 (`THINKUP100`, `THINKUP50`); voucher giảng viên tài trợ: 4 (`NEXT100K`, `REACT20`), theo xác nhận của BA. Tổng tiền khách trả 21.665.400đ; phân bổ ThinkUp 13.067.000đ, giảng viên 8.598.400đ. Mỗi dòng có `instructor_id`, nguồn voucher, số tiền chia, `withdrawable_at = paid_at + 7 ngày` và phiên bản phân bổ. **Nguồn thanh toán của 29 dòng chưa đối chiếu được** nên `source_reconciliation_status = unverified_payment_source`, `wallet_credit_status = not_posted`; không cộng tiền vào ví. Bản sao trước khi sửa nằm trong `server/output/` (Git bỏ qua). Dry-run lại cho `toUpdate: 0`.
- **Chưa có:** nguồn số dư/doanh thu khả dụng đã đối soát; hợp đồng và chính sách thuế có cấu trúc; luồng nạp doanh thu mới, chuyển pending thành available sau 7 ngày, tạo yêu cầu và bút toán giữ tiền; hợp đồng API xác thực của phần mềm kế toán; đối soát và cập nhật approved → paid. Không suy diễn số dư từ `available_balance` trên bản ghi demo.

## API đã mount

Prefix: `/api/admin/business/payouts` và `/api/v1/admin/business/payouts`. Tất cả yêu cầu Admin auth; SA/FA được đọc, CA/CS bị từ chối. FA chỉ được duyệt khoản dưới 20 triệu; từ 20 triệu trở lên chỉ SA.

| Method/path | Chức năng và dữ liệu |
| --- | --- |
| `GET /summary` | `kpi` gồm dữ liệu để thử UI; `demoKpi`, `realKpi`, `containsDemo` tách số liệu minh họa và tài chính thực. |
| `GET /` | Danh sách phân trang; `q`, `status`, `limitMin/Max`, `from/to`, `taxOnly`, `paidMonthOnly`, `sort`; mỗi item có `isDemo`. |
| `GET /:id` | Chi tiết một yêu cầu theo request ID hoặc Mongo ID. |
| `GET /export?format=csv\|excel` | Xuất toàn bộ hàng theo cùng bộ lọc; thêm cột nhận diện demo. |
| `POST /:id/approve` | Pending → approved; kiểm tra quyền và hồ sơ; yêu cầu thật phải có khoản giữ, ví và snapshot thuế hợp lệ. Mock dùng công thức thuế minh họa, đổi trạng thái và audit, không phát sinh thanh toán. Body: `note` tùy chọn. |
| `POST /:id/reject` | Pending → rejected; body bắt buộc `reason`, `details`, `evidence` tùy chọn. Yêu cầu thật hoàn đúng khoản giữ một lần, ghi ledger/audit/outbox nguyên tử; mock chỉ đổi trạng thái và audit. |
| `POST /:id/evidence` | SA/FA tải PNG, JPG hoặc PDF tối đa 10 MB cho yêu cầu pending; gửi tệp thô với `Content-Type` và `X-File-Name`. Trả `evidence.id`; khi từ chối, truyền ID này trong trường `evidence`. Nội dung lưu trong `admin_payout_evidence`, gắn với mã yêu cầu và chỉ liên kết một lần. |
| `GET /evidence/:id` | SA/FA tải nội dung minh chứng đã lưu. Chi tiết payout trả `evidenceId` sau khi từ chối. |

Lỗi chính: `401 UNAUTHORIZED`, `403 ADMIN_FORBIDDEN`/`PAYOUT_SUPER_ADMIN_REQUIRED`, `404 PAYOUT_NOT_FOUND`, `409 PAYOUT_STATE_CONFLICT`/`PAYOUT_HOLD_UNVERIFIED`/`PAYOUT_BALANCE_UNAVAILABLE`/`PAYOUT_TAX_POLICY_UNVERIFIED`, `422` khi hồ sơ/ngân hàng không đủ điều kiện và `503 PAYOUT_STORAGE_UNAVAILABLE` khi transaction không khả dụng. Chưa có endpoint xác nhận `paid`; không được coi duyệt là chuyển tiền.

## Kiểm tra đã chạy

- `node --test src/admin/business/test/payouts.admin.test.js`: 8/8 đạt, gồm chuyển trạng thái mock, KPI tách mock/thật, không tác động ví/email và chặn yêu cầu thật thiếu snapshot thuế.
- `MONGODB_DB_NAME=Thinkup_payout_test_1110 node --test src/admin/business/test/payouts.mongo.integration.test.js`: 1/1 đạt. Hai lệnh từ chối đồng thời chỉ một lệnh thành công, số dư hoàn một lần; thiếu ví làm transaction rollback. Hai lệnh duyệt đồng thời cũng chỉ một lệnh thành công. HTTP API với middleware Admin thật trả 401 khi thiếu token, 403 cho CA và 200 cho FA; duyệt/từ chối mock qua HTTP đạt, KPI mock thay đổi, không tạo bút toán hay email. Dữ liệu test được dọn sau chạy.
- `node scripts/prepare-instructor-payout-wallets.js` dry-run: 40 hồ sơ, 0 ví cũ, 40 ví cần tạo. `--apply` tạo và xác minh 40 ví; kiểm tra lại: 40 ví đều có số dư 0, sổ cái 0 bản ghi, 30 payout demo không đổi.
- Sau khi BA chốt 7 ngày chờ: dry-run phát hiện 40 ví thiếu `pending_balance`; `--apply` bổ sung giá trị 0 và xác minh 40/40 ví. Dry-run phân bổ doanh thu 29 dòng đạt; `--apply` cập nhật 29/29 và dry-run lặp lại cho `toUpdate: 0`. Không ghi bút toán ví.
- Chưa kiểm tra phiên đăng nhập qua màn hình hoặc frontend. Chưa kiểm tra luồng tạo yêu cầu và giải ngân vì chưa triển khai.

## Điều kiện để mở payout thật

1. Nguồn doanh thu/số dư được phép rút và quy tắc đối soát được chốt; backfill bằng bút toán có chứng cứ, không tự lấy số liệu mock.
2. Hợp đồng đã ký cung cấp snapshot chính sách thuế có định danh, ngày phê duyệt, ngưỡng, thuế suất và phiên bản. Backend không áp mức mặc định cho yêu cầu thật khi thiếu snapshot.
3. Phần mềm kế toán cung cấp hợp đồng API/webhook, cơ chế xác thực, mã yêu cầu, tham chiếu ngân hàng duy nhất, số tiền và thời gian thực chuyển; sau đó mới triển khai `approved → paid` và đối soát lặp an toàn.
