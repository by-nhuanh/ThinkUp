# TÀI LIỆU KỸ THUẬT TOÀN DIỆN: ROADMAP, FLASHCARD & PAYMENT FLOW
**Dự án:** ThinkUp - Nền tảng học lập trình trực tuyến  
**Đối tượng sử dụng:** Frontend Developer (Angular), Backend Developer, QA/Tester, DevOps, AI Agent  
**Phiên bản:** 2.3 (Đồng bộ thay đổi module hiện hữu từ api_user_3.md; giữ API bốn loại bài học)  
**Tệp nguồn Backend chính:**  
- Roadmap: `server/src/user/roadmap/roadmap.user.js`  
- Flashcard: `server/src/user/flashcard/flashcard.user.js`  
- Payment: `server/src/user/payment/payment.service.js` & `server/src/user/payment/payment.router.js`  
- Bài học: `server/src/user/lesson/lesson.user.js`  
**Tệp kiểm thử:**  
- `server/src/user/roadmap/test/roadmap.user.test.js`  
- `server/src/user/flashcard/test/flashcard.user.test.js`  
- `server/src/user/lesson/test/lesson.user.test.js`  

---

# MỤC LỤC
- [A. HỆ QUY TẮC NGHIỆP VỤ & BẤT BIẾN CỐT LÕI](#a-hệ-quy-tắc-nghiệp-vụ--bất-biến-cốt-lõi)
  - [1. Quy ước kết nối & Xác thực chuẩn](#1-quy-ước-kết-nối--xác-thực-chuẩn)
  - [2. Cấu trúc Lộ trình nghề nghiệp chuẩn (Curated Curriculum)](#2-cấu-trúc-lộ-trình-nghề-nghiệp-chuẩn)
  - [3. Hệ 4 trạng thái Node & Bất biến cờ REVIEW (Critical Invariant)](#3-hệ-4-trạng-thái-node--bất-biến-cờ-review)
  - [4. Hệ thống Quy tắc Liên kết giữa Roadmap và Flashcard](#4-hệ-thống-quy-tắc-liên-kết-giữa-roadmap-và-flashcard)
  - [5. Thuật toán Đề xuất 4 khóa học chưa sở hữu theo Node (Sales Upsell)](#5-thuật-toán-đề-xuất-4-khóa-học-chưa-sở-hữu-theo-node)
  - [6. Quy chuẩn Luồng Thanh toán Toàn diện (Payment Lifecycle & TTL 15 Phút)](#6-quy-chuẩn-luồng-thanh-toán-toàn-diện)
- [B. TÀI LIỆU CHI TIẾT API ROADMAP](#b-tài-liệu-chi-tiết-api-roadmap)
  - [B.1. Lấy danh sách nghề nghiệp (`GET /careers`)](#b1-lấy-danh-sách-nghề-nghiệp)
  - [B.2. Lấy cấu trúc lộ trình mẫu (`GET /template/:categoryId`)](#b2-lấy-cấu-trúc-lộ-trình-mẫu)
  - [B.3. Chọn và kích hoạt lộ trình học (`POST /select`)](#b3-chọn-và-kích-hoạt-lộ-trình-học)
  - [B.4. Lấy lộ trình cá nhân của học viên (`GET /my-roadmap`)](#b4-lấy-lộ-trình-cá-nhân-của-học-viên)
  - [B.5. Lấy đề thi kiểm tra giai đoạn (`GET /stage-test/:stageId`)](#b5-lấy-đề-thi-kiểm-tra-giai-đoạn)
  - [B.6. Nộp bài kiểm tra giai đoạn & phân rã điểm (`POST /stage-test/:stageId/submit`)](#b6-nộp-bài-kiểm-tra-giai-đoạn--phân-rã-điểm)
  - [B.7. Đồng bộ tiến độ từ các khóa học đã mua (`POST /sync-course`)](#b7-đồng-bộ-tiến-độ-từ-các-khóa-học-đã-mua)
  - [B.8. Đề xuất 4 khóa học chưa sở hữu theo Node (`GET /nodes/:nodeId/recommended-courses`)](#b8-đề-xuất-4-khóa-học-chưa-sở-hữu-theo-node)
  - [B.9. Xem lịch sử làm bài kiểm tra giai đoạn (`GET /history`)](#b9-xem-lịch-sử-làm-bài-kiểm-tra-giai-đoạn)
- [C. TÀI LIỆU CHI TIẾT API FLASHCARD](#c-tài-liệu-chi-tiết-api-flashcard)
  - [C.1. Lấy danh sách bộ flashcard của người dùng (`GET /api/user/flashcards`)](#c1-lấy-danh-sách-bộ-flashcard)
  - [C.2. Tạo bộ flashcard mới độc lập (`POST /api/user/flashcards`)](#c2-tạo-bộ-flashcard-mới-độc-lập)
  - [C.3. Tạo bộ flashcard ôn tập từ Node Roadmap (`POST /api/user/flashcards/from-roadmap`)](#c3-tạo-bộ-flashcard-ôn-tập-từ-node-roadmap)
  - [C.4. Bắt đầu phiên học flashcard theo 3 chế độ (`POST /:id/session`)](#c4-bắt-đầu-phiên-học-flashcard)
  - [C.5. Xem chi tiết bộ thẻ & lọc thẻ theo chế độ (`GET /:id`)](#c5-xem-chi-tiết-bộ-thẻ--lọc-thẻ)
  - [C.6. Chỉnh sửa bộ thẻ & Chặn xóa dưới 5 thẻ Roadmap (`PUT /:id`)](#c6-chỉnh-sửa-bộ-thẻ)
  - [C.7. Xem thống kê tiến độ bộ thẻ (`GET /:id/stats`)](#c7-xem-thống-kê-tiến-độ-bộ-thẻ)
  - [C.8. Cập nhật trạng thái thẻ khi học (`PATCH /:id/cards/:cardId/status`)](#c8-cập-nhật-trạng-thái-thẻ)
  - [C.9. Đồng bộ thủ công kết quả Flashcard vào Roadmap (`POST /sync-roadmap/:nodeId`)](#c9-đồng-bộ-thủ-công-kết-quả-flashcard-vào-roadmap)
- [D. TÀI LIỆU CHI TIẾT API THANH TOÁN (PAYMENT)](#d-tài-liệu-chi-tiết-api-thanh-toán-payment)
  - [D.1. Khởi tạo phiên thanh toán](#payment-1)
  - [D.2. Kiểm tra trạng thái giao dịch](#payment-2)
  - [D.3. Webhook và VNPay Return/IPN](#payment-3)
  - [D.4. VNPay Return Callback](#payment-4)
  - [D.5. VNPay Server-to-Server IPN](#payment-5)
  - [D.6. Webhook Stripe Quốc Tế](#payment-6)
  - [D.7. Thử lại trên cùng đơn](#payment-7)
  - [D.8. Phạm vi và yêu cầu vận hành](#payment-8)
  - [D.9. Luồng và trạng thái](#payment-9)
  - [D.10. Mã định danh và chống trùng](#payment-10)
  - [D.11. Ghi nhận tiền và fulfillment có thể phục hồi](#payment-11)
  - [D.12. Hàm, phụ thuộc và cấu hình](#payment-12)
  - [D.13. Lỗi, kiểm thử và giới hạn tích hợp](#payment-13)
  - [D.14. Inbox và email biên nhận](#payment-14)
- [E. MÔ TẢ CÁC HÀM BACKEND NỘI BỘ (BACKEND FUNCTION REFERENCE)](#e-mô-tả-các-hàm-backend-nội-bộ)
  - [E.1. Nhóm hàm Roadmap (`roadmap.user.js`)](#e1-nhóm-hàm-roadmap)
  - [E.2. Nhóm hàm Flashcard (`flashcard.user.js`)](#e2-nhóm-hàm-flashcard)
  - [E.3. Nhóm hàm Thanh toán (`payment.service.js`)](#e3-nhóm-hàm-thanh-toán)
  - [E.4. Nhóm hàm Gợi ý khóa học cho giỏ hàng (`rcm_course.js`)](#e4-nhóm-hàm-gợi-ý-khóa-học-cho-giỏ-hàng)
  - [E.5. Nhóm hàm Khóa học, Học thử & Đánh giá (`course.user.js`)](#e5-nhóm-hàm-khóa-học-học-thử--đánh-giá)
- [F. BẢNG TỔNG HỢP TOÀN BỘ ENDPOINTS & MÃ LỖI](#f-bảng-tổng-hợp-toàn-bộ-endpoints--mã-lỗi)
- [G. TÀI LIỆU CHI TIẾT API KHÓA HỌC (COURSE CARDS)](#g-tài-liệu-chi-tiết-api-khóa-học)
- [H. TÀI LIỆU CHI TIẾT CHI TIẾT KHÓA HỌC & HỌC THỬ (COURSE DETAIL & PREVIEW PLAYER)](#h-tài-liệu-chi-tiết-chi-tiết-khóa-học--học-thử)
  - [H.1. Chi tiết khóa học - Landing Page (`GET /:id/detail`)](#h1-chi-tiết-khóa-học---landing-page)
  - [H.2. Màn hình học thử - Free Trial Player (`GET /:id/preview`)](#h2-màn-hình-học-thử---free-trial-player)
  - [H.3. Đánh giá học viên kèm sắp xếp & lọc theo sao (`GET /:id/reviews`)](#h3-đánh-giá-học-viên-kèm-sắp-xếp--lọc-theo-sao)
  - [H.4. Phân quyền phát video học thử (`GET /:id/lessons/:lessonId/stream`)](#h4-phân-quyền-phát-video-học-thử)
- [I. TÀI LIỆU CHI TIẾT API GIỎ HÀNG (SHOPPING CART)](#i-tài-liệu-chi-tiết-api-giỏ-hàng-shopping-cart)
  - [I.1. Lấy thông tin & Tính toán chi tiết giỏ hàng (`GET /api/user/cart`)](#i1-lấy-thông-tin--tính-toán-chi-tiết-giỏ-hàng)
  - [I.2. Kiểm tra mã giảm giá Voucher (`POST /api/user/cart/voucher/validate`)](#i2-kiểm-tra-mã-giảm-giá-voucher)
  - [I.3. Đồng bộ giỏ hàng từ khách sang tài khoản (`POST /api/user/cart/merge`)](#i3-đồng-bộ-giỏ-hàng-từ-khách-sang-tài-khoản)
  - [I.4. Thêm khóa học vào giỏ hàng (`POST /api/user/cart`)](#i4-thêm-khóa-học-vào-giỏ-hàng)
  - [I.5. Xóa khóa học khỏi giỏ hàng (`DELETE /api/user/cart`)](#i5-xóa-khóa-học-khỏi-giỏ-hàng)
- [J. TÀI LIỆU CHI TIẾT API KHÓA HỌC YÊU THÍCH (FAVORITES / WISHLIST)](#j-tài-liệu-chi-tiết-api-khóa-học-yêu-thích-favorites--wishlist)
  - [J.1. Lấy danh sách khóa học yêu thích kèm bộ lọc & phân trang (`GET /api/user/favorites`)](#j1-lấy-danh-sách-khóa-học-yêu-thích-kèm-bộ-lọc--phân-trang)
  - [J.2. Lấy nhanh danh sách ID khóa học đã thích (`GET /api/user/favorites/ids`)](#j2-lấy-nhanh-danh-sách-id-khóa-học-đã-thích)
  - [J.3. Kiểm tra trạng thái yêu thích của 1 khóa học (`GET /api/user/favorites/check/:courseId`)](#j3-kiểm-tra-trạng-thái-yêu-thích-của-1-khóa-học)
  - [J.4. Chuyển đổi trạng thái Yêu thích Toggle (`POST /api/user/favorites/toggle`)](#j4-chuyển-đổi-trạng-thái-yêu-thích-toggle)
  - [J.5. Thêm khóa học vào danh sách yêu thích (`POST /api/user/favorites`)](#j5-thêm-khóa-học-vào-danh-sách-yêu-thích)
  - [J.6. Đồng bộ danh sách yêu thích từ máy khách (`POST /api/user/favorites/sync`)](#j6-đồng-bộ-danh-sách-yêu-thích-từ-máy-khách)
  - [J.7. Xóa khóa học khỏi yêu thích (`DELETE /api/user/favorites/:courseId`)](#j7-xóa-khóa-học-khỏi-yêu-thích)
- [K. TÀI LIỆU KỸ THUẬT API MODULE BÀI HỌC & MÀN HÌNH HỌC TẬP (CURRICULUM & STUDY)](#k-tài-liệu-kỹ-thuật-api-module-bài-học--màn-hình-học-tập)
  - [K.1. Truy xuất toàn bộ dữ liệu màn hình học tập (`GET /study/:courseId`)](#k1-truy-xuất-toàn-bộ-dữ-liệu-màn-hình-học-tập)
  - [K.2. Cập nhật tiến độ bài học (`PUT /:lessonId/progress`)](#k2-cập-nhật-tiến-độ-bài-học)
  - [K.3. Truy vấn Tab Tổng quan khóa học (`GET /overview/:courseId`)](#k3-truy-vấn-tab-tổng-quan-khóa-học)
  - [K.4. Lấy danh sách thảo luận khóa học (`GET /discussions/:courseId`)](#k4-lấy-danh-sách-thảo-luận-khóa-học)
  - [K.5. Đăng thảo luận mới hoặc trả lời (`POST /discussions/:courseId`)](#k5-đăng-thảo-luận-mới-hoặc-trả-lời)
  - [K.6. Chỉnh sửa thảo luận (`PUT /discussions/:id`)](#k6-chỉnh-sửa-thảo-luận)
  - [K.7. Thích / Bỏ thích thảo luận (`POST /discussions/:id/like`)](#k7-thích--bỏ-thích-thảo-luận)
  - [K.8. Báo cáo vi phạm thảo luận (`POST /discussions/:id/report`)](#k8-báo-cáo-vi-phạm-thảo-luận)
  - [K.9. Lấy danh sách hỏi đáp 1-1 (`GET /qna/:courseId`)](#k9-lấy-danh-sách-hỏi-đáp-1-1)
  - [K.10. Gửi câu hỏi Q&A mới (`POST /qna/:courseId`)](#k10-gửi-câu-hỏi-qa-mới)
  - [K.11. Phản hồi câu hỏi Q&A (`POST /qna/:id/reply`)](#k11-phản-hồi-câu-hỏi-qa)
  - [K.12. Chỉnh sửa nội dung Q&A (`PUT /qna/:id`)](#k12-chỉnh-sửa-nội-dung-qa)
  - [K.13. Lấy kho tài liệu khóa học (`GET /documents/:courseId`)](#k13-lấy-kho-tài-liệu-khóa-học)
  - [K.14. Tải tài liệu khóa học (`GET /documents/:id/download`)](#k14-tải-tài-liệu-khóa-học)
  - [K.15. Bốn loại bài học: bài đọc, video, quiz và lab](#k15-bốn-loại-bài-học-bài-đọc-video-quiz-và-lab)
- [L. TÀI LIỆU KỸ THUẬT API MODULE BÁO CÁO VI PHẠM (CONTENT REPORT MODULE)](#l-tài-liệu-kỹ-thuật-api-module-báo-cáo-vi-phạm-content-report-module)
  - [L.1. Gửi báo cáo vi phạm (`POST /api/user/reports`)](#l1-gửi-báo-cáo-vi-phạm)
  - [L.2. Kiểm tra trạng thái đã báo cáo (`GET /api/user/reports/check`)](#l2-kiểm-tra-trạng-thái-đã-báo-cáo)
  - [L.3. Lấy danh sách ID đã báo cáo để ẩn trên FE (`GET /api/user/reports/hidden-ids`)](#l3-lấy-danh-sách-id-đã-báo-cáo-để-ẩn-trên-fe)

---

# A. HỆ QUY TẮC NGHIỆP VỤ & BẤT BIẾN CỐT LÕI

### 1. Quy ước kết nối & Xác thực chuẩn
* **Tiền tố Endpoint (Base URLs):**
  * Roadmap: `/api/user/roadmap` (hoặc `/api/v1/roadmap`)
  * Flashcard: `/api/user/flashcards` (hoặc `/api/v1/user/flashcards`, `/api/flashcards`)
  * Payment: `/api/payment` (hoặc `/api/user/payment`, `/api/v1/payment`)
* **Header bảo mật (dành cho API học viên đã đăng nhập):**
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: application/json
  ```

---

### 2. Cấu trúc Lộ trình nghề nghiệp chuẩn
* **Triệt tiêu sinh lộ trình động:** Xóa bỏ hoàn toàn việc tự sinh ngẫu nhiên từ thẻ tag (`generateDynamicTemplateForCategory`). Tất cả lộ trình đều tuân theo giáo trình chuẩn hóa (Curated Curriculum) có ngân hàng đề thi trong `roadmap_stage_questions`.
* **Phân cấp 3 tầng:** Nghề nghiệp (`category_id`) $\rightarrow$ Giai đoạn (`stage_id`) $\rightarrow$ Node kỹ năng (`node_id`).

---

### 3. Hệ 4 trạng thái Node & Bất biến cờ REVIEW

Ngoại lệ tự đánh dấu trước đánh giá: khi node chưa có kết quả test/khóa học, học viên được lưu một trong bốn trạng thái qua B.4a. Trạng thái này không thay đổi điểm. Review tự chọn không phải cờ review bắt buộc; sau khi đã có kết quả học hoặc review bắt buộc, hệ thống quản lý trạng thái.

Mỗi Node kỹ năng trên Roadmap có 1 trong 4 trạng thái độc quyền:
1. `not_started`: Chưa bắt đầu (Điểm = 0%, chưa làm test và chưa học khóa học).
2. `in_progress`: Đang học (Điểm tích lũy từ $40\%$ đến $79\%$).
3. `completed`: Đã làm chủ (Điểm tích lũy $\ge 80\%$).
4. `review`: Cần ôn tập lại (Làm rớt câu hỏi của node đó trong bài test giai đoạn với điểm node $< 40\%$).

> [!CAUTION]
> **QUY TẮC BẤT BIẾN CỜ REVIEW (REVIEW INVARIANT RULE):**  
> Khi một Node đã rơi vào trạng thái `review` (cờ `is_review: true`), Node này **KHÔNG BAO GIỜ** được phép tự động chuyển về `completed` hay `in_progress` dù học viên có học bao nhiêu khóa học bên ngoài hay làm lại bài test giai đoạn.  
> 
> **CÁCH DUY NHẤT ĐỂ GIẢI TỎA CỜ REVIEW:**  
> Học viên bắt buộc phải sử dụng module Flashcard:  
> 1. Tạo bộ Flashcard liên kết với `node_id` đó có **ít nhất 5 thẻ** (`total_cards >= 5`).  
> 2. Thực hiện học và **hoàn thành hết 100% tất cả các thẻ** (`learned_cards === total_cards`, $100\%$ thẻ chuyển sang trạng thái "Đã học").  
> 
> Khi thỏa mãn đồng thời cả 2 điều kiện, cờ `is_review` mới được gỡ bỏ (`is_review: false`), Node được đưa về `completed` (nếu điểm $\ge 80$) hoặc `in_progress` và tính lại tiến độ Roadmap.

---

### 4. Hệ thống Quy tắc Liên kết giữa Roadmap và Flashcard

Hệ thống thiết lập 6 quy tắc ràng buộc chặt chẽ giữa Roadmap và Flashcard:

1. **Nút bấm Tạo Flashcard từ Node Roadmap (`POST /from-roadmap`):**
   * Khi học viên xem chi tiết một Node kỹ năng (đặc biệt là node đang bị `review`), ấn nút "Tạo Flashcard" sẽ tự động tạo bộ thẻ với:
     * Tiêu đề: Tên node kỹ năng (vd: `HTML5 & Semantic Markup`).
     * Mô tả: `Ôn tập "<Tên node>"`.
     * Gắn kết: `node_id` và `roadmap_id`.
     * Trạng thái mặc định ban đầu của toàn bộ thẻ: `"chưa học"`.
2. **Quy tắc Chống xóa Thẻ dưới 5 thẻ (`ROADMAP_FLASHCARD_MIN_CARDS_VIOLATION`):**
   * Đối với bộ Flashcard thông thường không nối Roadmap: Cho phép thêm bớt số lượng tùy ý.
   * Đối với bộ Flashcard ĐƯỢC LIÊN KẾT VỚI ROADMAP (`node_id` tồn tại): Hệ thống **CHẶN XÓA BỚT THẺ** nếu số lượng thẻ trong bộ giảm xuống dưới 5 thẻ (`sourceCards.length < 5`). Yêu cầu tối thiểu ít nhất 5 thẻ để đảm bảo khối lượng kiến thức ôn tập.
3. **Quy tắc Chống xóa Bộ Flashcard nối với Roadmap:**
   * Những bộ Flashcard đang đóng vai trò giải tỏa cờ `review` của Roadmap được bảo vệ, ngăn chặn xóa nhầm để bảo toàn lịch sử ôn tập và tính toàn vẹn của Lộ trình học.
4. **Hỗ trợ Truy xuất Bộ Flashcard theo Node kỹ năng (`node_id`):**
   * Mọi bản ghi Flashcard lưu rõ `node_id` và cờ `is_qualified_for_roadmap` (đủ $\ge 5$ thẻ và đã học $100\%$).
   * Cho phép Frontend truy xuất ngay bộ thẻ liên kết khi học viên nhấp vào Node kỹ năng trên Roadmap, không bắt học viên phải tự tìm kiếm trong kho thẻ cá nhân.
5. **Quy tắc Reset Toàn Bộ Thẻ khi Chỉnh sửa (`PUT /:id`):**
   * Bất cứ khi nào học viên chỉnh sửa nội dung danh sách thẻ, toàn bộ các thẻ trong bộ đó **BẮT BUỘC ĐƯỢC CHUYỂN VỀ TRẠNG THÁI "CHƯA HỌC"**. Điều này ngăn chặn việc học viên chỉnh sửa thẻ để gian lận giữ trạng thái "Đã học".
6. **3 Chế độ học Flashcard chuyên biệt:**
   * **`order` (Theo thứ tự):** Chỉ áp dụng với các thẻ `chưa học` và `ôn tập` (loại trừ thẻ `Đã học`), sắp xếp theo thứ tự tạo.
   * **`random` (Ngẫu nhiên):** Chỉ áp dụng với thẻ `chưa học` và `ôn tập`, xáo trộn thứ tự bằng thuật toán Fisher-Yates.
   * **`restart` (Học lại từ đầu):** Đặt lại toàn bộ thẻ trong CSDL về `chưa học` và hiển thị theo thứ tự.

---

### 5. Thuật toán Đề xuất 4 khóa học chưa sở hữu theo Node

Để tối ưu hóa tỷ lệ chuyển đổi bán hàng (Upsell Conversion) khi học viên mở xem một Node:
* **Loại trừ tuyệt đối:** Chỉ lấy các khóa học mà học viên **CHƯA MUA** (loại bỏ khỏi `user_courses` và `user_enrollments`).
* **Trọng số khớp Tags (+100đ):** Khóa học trùng tag với `node.tags` được cộng +100đ cho tag đầu tiên, +50đ cho các tag tiếp theo.
* **Trọng số khớp Cấp độ (+30đ):** Khóa học cùng level (`beginner`, `intermediate`, `advanced`) cộng +30đ.
* **Trọng số cùng Ngành (+20đ):** Khóa học cùng `category_id` cộng +20đ.
* **Độ uy tín:** Cộng điểm từ rating sao (`rating * 4`) và số lượng học viên (`total_students / 2000`).
* **Đầu ra sạch sẽ:** Tuân thủ chuẩn Thẻ Khóa Học (`CourseCardDto`), **tuyệt đối không chứa trường rác `recommendation_reason`**.

---

### 6. Quy chuẩn Luồng Thanh toán Toàn diện

Backend lấy giá/voucher từ DB, tạo order/transaction nguyên tử với TTL 15 phút. Bắt buộc `Idempotency-Key`; retry giữ DH, đổi GD và không gia hạn đơn. Chỉ webhook/IPN đã xác minh được ghi tiền; VNPay Return không cấp quyền.

Luồng `pending` → `paid` → `success`: paid là nhận tiền, success chỉ khi fulfillment commit. Tiền sai/đến muộn cần `needs_review`; phiên chưa nhận tiền quá hạn là `expired`. Receipt/tiền ghi trước; fulfillment chạy transaction riêng để cấp quyền trong `user_enrollments`/`user_courses`, dọn đúng `user_cart_items`, hoàn tất order và tạo inbox. Lỗi rollback fulfillment, giữ paid để recovery. MongoDB cần transaction; không fallback ghi rời. Email gửi sau commit theo tùy chọn hóa đơn/thông báo. Xem D.

---

# B. TÀI LIỆU CHI TIẾT API ROADMAP

## B.1. Lấy danh sách nghề nghiệp
* **Method:** `GET` | **URL:** `/api/user/roadmap/careers` | **Auth:** Public
* **Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "category_id": 1,
      "career_name": "Frontend Developer",
      "description": "Lộ trình phát triển giao diện Web từ cơ bản đến tối ưu hiệu năng.",
      "total_stages": 3,
      "total_nodes": 10,
      "has_custom_template": true
    }
  ]
}
```

## B.2. Lấy cấu trúc lộ trình mẫu
* **Method:** `GET` | **URL:** `/api/user/roadmap/template/:categoryId` | **Auth:** Public
* **Response (200 OK):** Cấu trúc chuẩn các Stage và Node kèm tags, level, description.

## B.3. Chọn và kích hoạt lộ trình học
* **Method:** `POST` | **URL:** `/api/user/roadmap/select` | **Auth:** Bearer Token
* **Body:** `{ "category_id": 1 }`
* **Response (200 OK):** Kích hoạt lộ trình cho học viên, đặt `is_active = true`.

### B.3a. Hủy chọn lộ trình, giữ nguyên tiến độ
* **Method:** `POST` | **URL:** `/api/user/roadmap/unselect` (alias `/api/v1/roadmap/unselect`).
* **Auth:** Bearer Token, cùng middleware `requireAuth` với `/select`; danh tính lấy từ phiên, không nhận `userId` từ client.
* **Body JSON:** `{ "category_id": 1 }`, bắt buộc là số nguyên dương an toàn.
* **Response 200:** `{ "success": true, "message": "Đã hủy chọn lộ trình. Tiến độ học của bạn được giữ lại.", "data": { "category_id": 1, "is_active": false, "changed": true } }`.
* Chỉ vô hiệu hóa bản ghi đang active của chính học viên và category được gửi. Không xóa node, điểm, cờ review, lịch sử test hoặc flashcard. Chọn lại qua `/select` khôi phục lộ trình đã lưu.
* Idempotent: nếu không có bản ghi active phù hợp (kể cả category chưa từng chọn), trả 200 với `changed: false`; không ảnh hưởng lộ trình khác.
* **400:** `INVALID_CATEGORY_ID`, `field: category_id`; **401:** chưa đăng nhập/phiên không hợp lệ; lỗi CSDL theo xử lý lỗi chung của server. FE giữ trạng thái khi request lỗi, hiển thị thông báo và cho thử lại; không tự retry.
* **Handler:** `unselectUserRoadmap(userId, categoryId)` trong `roadmap.user.js`; thao tác cập nhật có điều kiện theo `user_id`, `category_id`, `is_active: true`.

## B.4. Lấy lộ trình cá nhân của học viên
* **Method:** `GET` | **URL:** `/api/user/roadmap/my-roadmap` | **Auth:** Bearer Token
* **Response (200 OK):** Trả về toàn bộ danh sách Node kèm trạng thái cá nhân (`not_started`, `in_progress`, `completed`, `review`), điểm số, cờ `is_review` và tiến độ % lộ trình.

### B.4a. Mục tiêu kỹ năng và trạng thái tự chọn

* Node trong template và lộ trình cá nhân có `outcomes: string[]`. Dữ liệu template CSDL cũ được chuyển từ `topics` bằng script chuẩn bị; các node legacy có nội dung mục tiêu được biên soạn sẵn trong backend. FE hiển thị trực tiếp, không tự sinh mục tiêu.
* Stage có `test_available: boolean`, chỉ true khi bộ đề đã lưu đáp ứng đúng node/tag và đủ tối thiểu 5 câu cho mỗi tag đánh giá của mỗi node. Nhãn nghề nghiệp không phải tag đánh giá. FE không mời làm đề chưa sẵn sàng.
* Node của `my-roadmap` có `manual_status_allowed: boolean`, `status_lock_reason: null | "REVIEW_REQUIRED" | "LEARNING_RESULT_EXISTS"` và `status_source: null | "manual" | "test" | "course"`.
* **API lưu:** `PATCH /api/user/roadmap/nodes/:nodeId/status` (alias `/api/v1/roadmap/nodes/:nodeId/status`), Bearer, JSON `{ "status": "not_started" | "in_progress" | "completed" | "review" }`. Backend lấy userId từ phiên, chỉ sửa node trong lộ trình đang active của chính user.
* Chỉ cho chọn khi `last_quiz_score` và `course_score` chưa được ghi, điểm chưa > 0 và không có review bắt buộc. Kết quả test 0 điểm cũng khóa chọn thủ công. Không nhận điểm, userId hay cờ review từ FE.
* Tự chọn không sửa điểm. Chọn review thủ công ghi `status_source: "manual", is_review: false`; người dùng vẫn được đổi lại khi chưa có kết quả học. Review bắt buộc do kết quả hệ thống tiếp tục cần flashcard để gỡ.
* **200:** `{ "success": true, "message": "Đã lưu trạng thái kỹ năng.", "data": { "node_id": "...", "status": "completed", "status_source": "manual", "is_review": false, "manual_status_allowed": true, "status_lock_reason": null, "completed_nodes": 1, "total_nodes": 10, "progress_percentage": 10 } }`.
* **400:** `INVALID_NODE_STATUS`; **401:** chưa đăng nhập; **404:** `ACTIVE_NODE_NOT_FOUND`; **409:** `REVIEW_REQUIRED`, `LEARNING_RESULT_EXISTS` hoặc `NODE_UPDATE_CONFLICT`. FE không đổi state khi request ghi thất bại, không tự retry. Handler dùng cập nhật có điều kiện để phát hiện dữ liệu thay đổi đồng thời.

## B.5. Lấy đề thi kiểm tra giai đoạn
* **Method:** `GET` | **URL:** `/api/user/roadmap/stage-test/:stageId` | **Auth:** Bearer Token
* Đọc ngân hàng đã lưu từ CSDL; lấy đề và chấm bài dùng chung bộ kiểm tra cấu hình stage/node/tag, kể cả template CSDL ngoài legacy. Các câu không hợp lệ không được đưa vào đề. Không tạo câu/đáp án theo request học viên.
* Nếu dữ liệu chưa sẵn sàng, trả **503 STAGE_TEST_UNAVAILABLE** với thông báo bài kiểm tra đang được chuẩn bị; chi tiết thiếu tag chỉ ghi nội bộ. FE dùng `test_available` để không đề xuất đề chưa đủ.
* Chuẩn bị CSDL: chạy `node scripts/prepare_roadmap_data.js --summary` trong `server/`. Script không xóa dữ liệu hoặc tự sinh câu hỏi chung chung; chỉ chuẩn hóa tag xác định được từ node và nạp dữ liệu đã biên soạn. Giai đoạn thiếu nội dung phải được bổ sung ngân hàng câu hỏi trước khi mở test.
* **Bảo mật:** Đáp án đúng `is_correct` bị **ẨN HOÀN TOÀN** khỏi phản hồi.

* Mỗi tag cần ít nhất 5 câu; trả toàn bộ đề, không cắt còn 10 câu. Câu có `skill_tag` khớp tag node; FE đọc `total_questions`. Các lỗi 404/409 ngân hàng đề tại T.10–T.11 của file 3 là lịch sử; giữ hợp đồng 503 từ bộ kiểm tra cấu hình mới ở B.5.

## B.6. Nộp bài kiểm tra giai đoạn & phân rã điểm
* **Method:** `POST` | **URL:** `/api/user/roadmap/stage-test/:stageId/submit` | **Auth:** Bearer Token
* **Body:**
```json
{
  "answers": [
    { "question_id": "fe-s1-q1", "selected_option": "B" },
    { "question_id": "fe-s1-q2", "selected_option": "A" }
  ]
}
```
* **Xử lý:** Phân rã điểm theo Node, áp dụng EWMA ($\alpha = 0.6$). Nếu điểm node $< 40\%$, đánh dấu cờ `review`.

* User phải có roadmap active và stage thuộc roadmap đó. Gửi đúng một đáp án cho mỗi câu của toàn bộ đề; từ chối thiếu câu, ID trùng, câu ngoài stage, sai kiểu hoặc option không tồn tại trước khi ghi. Chấm theo cả `stage_id`/`question_id`.
* `detailed_results` chỉ gồm `question_id`, `node_id`, `selected_option`; không trả `correct_option`, `explanation`, `is_correct`. Giữ ngưỡng đạt 70% và EWMA. Lỗi 400: `INVALID_STAGE_ANSWERS`, `STAGE_ANSWER_SET_INVALID`, `STAGE_ANSWER_INVALID`; 404: `ACTIVE_ROADMAP_NOT_FOUND`, `STAGE_NOT_FOUND`.

## B.7. Đồng bộ tiến độ từ các khóa học đã mua
* **Method:** `POST` | **URL:** `/api/user/roadmap/sync-course` | **Auth:** Bearer Token
* **Xử lý:** Ghép nối tags của các khóa học đã ghi danh vào Node kỹ năng, bảo toàn tuyệt đối không gỡ cờ `review`.

* Ưu tiên `user_course_progress.progress_percentage`; chỉ fallback `user_enrollments.progress_percentage` khi chưa có bản ghi progress. Giữ cờ review.

## B.8. Đề xuất 4 khóa học chưa sở hữu theo Node
* **Method:** `GET` | **URL:** `/api/user/roadmap/nodes/:nodeId/recommended-courses` | **Auth:** Bearer Token
* **Response (200 OK):**
```json
{
  "success": true,
  "node_id": "fe-node-react",
  "total": 4,
  "data": [
    {
      "id": "673f1a2b9c1d2e3f4a5b6c7d",
      "slug": "reactjs-chuyen-sau-2026",
      "title": "ReactJS Chuyên Sâu & Tối Ưu Hiệu Năng",
      "thumbnail_url": "https://img.thinkup.vn/react.jpg",
      "instructor_name": "Nguyễn Văn A",
      "instructor_avatar": "https://img.thinkup.vn/avatar.jpg",
      "rating": 4.9,
      "rating_count": 128,
      "total_students": 3200,
      "tags": ["ReactJS", "Frontend"],
      "original_price": 1200000,
      "sale_price": 790000,
      "discount_amount": 410000,
      "discount_percentage": 34,
      "formatted_price": "790.000 ₫",
      "formatted_original_price": "1.200.000 ₫",
      "is_in_wishlist": false,
      "is_in_cart": false,
      "is_purchased": false,
      "level": "intermediate",
      "duration_minutes": 1800,
      "is_free": false
    }
  ]
}
```

## B.9. Xem lịch sử làm bài kiểm tra giai đoạn
* **Method:** `GET` | **URL:** `/api/user/roadmap/history` | **Auth:** Bearer Token

---

# C. TÀI LIỆU CHI TIẾT API FLASHCARD

## C.1. Lấy danh sách bộ flashcard
* **Method:** `GET` | **URL:** `/api/user/flashcards` | **Auth:** Bearer Token
* **Response (200 OK):**
```json
{
  "status": "success",
  "total": 3,
  "data": [
    {
      "id": "6740a1b2c3d4e5f6a7b8c9d0",
      "title": "HTML5 & Semantic Markup",
      "description": "Ôn tập \"HTML5 & Semantic Markup\"",
      "total_cards": 8,
      "learned_cards": 8,
      "review_cards": 0,
      "not_learned_cards": 0,
      "progress_percentage": 100,
      "learning_progress": "8/8",
      "created_at": "23/10/2026",
      "node_id": "fe-node-html",
      "roadmap_id": "roadmap-frontend",
      "is_qualified_for_roadmap": true
    }
  ]
}
```

## C.2. Tạo bộ flashcard mới độc lập
* **Method:** `POST` | **URL:** `/api/user/flashcards` | **Auth:** Bearer Token
* **Body:**
```json
{
  "title": "Từ vựng JavaScript Core",
  "description": "Bộ thẻ ghi nhớ các khái niệm cốt lõi",
  "cards": [
    {
      "knowledge": "Closure là gì?",
      "description": "Hàm có khả năng ghi nhớ phạm vi từ vựng (lexical scope) nơi nó được khai báo.",
      "code": "function makeCounter() { let count = 0; return () => ++count; }",
      "note": "Rất thường gặp trong phỏng vấn"
    }
  ]
}
```

## C.3. Tạo bộ flashcard ôn tập từ Node Roadmap
* **Method:** `POST` | **URL:** `/api/user/flashcards/from-roadmap` | **Auth:** Bearer Token
* **Mục đích:** Nhấn nút tạo từ Node trên Roadmap. Tự động lấy tên node làm tiêu đề và mô tả `Ôn tập "<Tên node>"`.
* **Body:**
```json
{
  "node_id": "fe-node-html",
  "title": "HTML5 & Semantic Markup",
  "roadmap_id": "roadmap-frontend",
  "cards": [
    {
      "knowledge": "Semantic Tag <article> và <section> khác nhau thế nào?",
      "description": "<article> là nội dung độc lập, tái sử dụng được. <section> là nhóm nội dung theo chủ đề.",
      "code": "<article><h1>Tin tức</h1><section>Nội dung</section></article>",
      "note": "Tối ưu điểm SEO"
    }
  ]
}
```

## C.4. Bắt đầu phiên học flashcard
* **Method:** `POST` | **URL:** `/api/user/flashcards/:id/session` | **Auth:** Bearer Token
* **Body:** `{ "mode": "order" }` (Hỗ trợ: `order` | `random` | `restart`)
* **Quy tắc:**
  * `order`: Lọc thẻ chưa học & cần ôn tập, giữ thứ tự người dùng tạo.
  * `random`: Lọc thẻ chưa học & cần ôn tập, xáo trộn bằng Fisher-Yates.
  * `restart`: Chuyển toàn bộ thẻ trong CSDL về `chưa học` và bắt đầu học theo thứ tự.
* **Response (200 OK):**
```json
{
  "status": "success",
  "message": "Đã khởi tạo phiên học với chế độ: order",
  "data": {
    "session_id": "session_1729674000000",
    "list_id": "6740a1b2c3d4e5f6a7b8c9d0",
    "title": "HTML5 & Semantic Markup",
    "mode": "order",
    "total_cards_in_list": 8,
    "total_cards_to_learn": 5,
    "learned_cards_excluded": 3,
    "cards_to_learn": [ ... ]
  }
}
```

## C.5. Xem chi tiết bộ thẻ & lọc thẻ
* **Method:** `GET` | **URL:** `/api/user/flashcards/:id?mode=order&filter_active=true` | **Auth:** Bearer Token

## C.6. Chỉnh sửa bộ thẻ & Chặn xóa dưới 5 thẻ Roadmap
* **Method:** `PUT` | **URL:** `/api/user/flashcards/:id` | **Auth:** Bearer Token
* **Body:** `{ "title": "HTML5 Nâng Cao", "cards": [ ... ] }`
* **Ràng buộc:**
  * Nếu bộ thẻ nối Roadmap (`node_id` tồn tại): Số lượng `cards` **phải $\ge 5$**. Nếu gửi $< 5$ thẻ $\rightarrow$ Trả mã lỗi 400 `ROADMAP_FLASHCARD_MIN_CARDS_VIOLATION`.
  * Khi sửa: gửi `card_id` của thẻ hiện có để giữ nguyên ID và trạng thái học trong database, kể cả khi sửa nội dung hoặc đổi thứ tự. Thẻ mới không gửi ID, mặc định `chưa học`. Không tin trường `status` do client gửi. Nếu không gửi `cards`, giữ nguyên toàn bộ thẻ và trạng thái.
  * ID không thuộc bộ thẻ hoặc bị trùng: 400 `INVALID_FLASHCARD_ID`. Bộ thẻ thay đổi đồng thời: 409 `FLASHCARD_UPDATE_CONFLICT`; tải lại trước khi lưu.

### C.6a. Xóa bộ flashcard
* **Method:** `DELETE` | **URL:** `/api/user/flashcards/:id` | **Auth:** Bearer Token.
* Không có body. Chỉ chủ sở hữu được xóa. Bộ không tồn tại hoặc không thuộc người gọi trả 404 `FLASHCARD_NOT_FOUND`.
* Nếu node liên kết còn yêu cầu ôn tập bắt buộc (`is_review: true`, hoặc `status: review` không phải tự chọn), trả 409 `ROADMAP_FLASHCARD_DELETE_FORBIDDEN`. Kiểm tra cả node đã lưu trữ từ giáo trình cũ; không thay đổi trạng thái hay điểm roadmap khi xóa bộ thẻ.
* Xóa thành công: `{ "status": "success", "message": "Đã xóa bộ flashcard.", "data": { "id": "<listId>", "deleted": true } }`.
* Kiểm tra bảo vệ và xóa thực hiện trong cùng transaction MongoDB; yêu cầu replica set/sharded cluster.

## C.7. Xem thống kê tiến độ bộ thẻ
* **Method:** `GET` | **URL:** `/api/user/flashcards/:id/stats` | **Auth:** Bearer Token

## C.8. Cập nhật trạng thái thẻ khi học
* **Method:** `PATCH` | **URL:** `/api/user/flashcards/:id/cards/:cardId/status` | **Auth:** Bearer Token
* **Body:** `{ "action": "đã học" }` (hoặc `chưa nhớ`, `cycle`)
* **Cơ chế tự động:** Nếu bộ thẻ liên kết với Roadmap và sau cập nhật thẻ này đạt đủ $\ge 5$ thẻ và $100\%$ hoàn thành $\rightarrow$ Hệ thống tự động kích hoạt gỡ cờ `review` của Node trên Roadmap!
* **Response (200 OK):**
```json
{
  "status": "success",
  "message": "Cập nhật trạng thái thẻ thành công.",
  "data": {
    "card_id": "card_0",
    "new_status": "Đã học",
    "stats": {
      "total_cards": 5,
      "learned_cards": 5,
      "review_cards": 0,
      "not_learned_cards": 0,
      "progress_percentage": 100
    },
    "roadmap_sync": {
      "updated": true,
      "node_status": "completed",
      "target_node_title": "HTML5 & Semantic Markup",
      "overall_progress": 40
    }
  }
}
```

* `updateCardStatus` compare-and-set đúng thẻ theo chủ list/ID/trạng thái hiện tại, đọc lại và thử tối đa 5 lần; còn xung đột trả 409 `FLASHCARD_UPDATE_CONFLICT`. Thống kê/updated_card lấy sau ghi.
* Đổi card và đồng bộ Roadmap trong cùng `session.withTransaction()`, lỗi abort cả hai collection. Helper đồng bộ nhận DB/session tùy chọn, truyền cùng session. MongoDB cần replica set/sharded cluster.
* `roadmap_sync.new_status` khớp trạng thái đã ghi: score >=80 hoặc chưa có score là completed, thấp hơn 80 là in_progress. Giữ ngưỡng 5 thẻ và học đủ 100%.

## C.9. Đồng bộ thủ công kết quả Flashcard vào Roadmap
* **Method:** `POST` | **URL:** `/api/user/flashcards/sync-roadmap/:nodeId` | **Auth:** Bearer Token
* **Body:** `{ "list_id": "6740a1b2c3d4e5f6a7b8c9d0" }`

---

# D. TÀI LIỆU CHI TIẾT API THANH TOÁN (PAYMENT)

Đồng bộ từ S, W.2 và Y.6 của `api_user_3.md`. API `/simulate-success` đã bị loại bỏ (404).

<a id="payment-1"></a>

## D.1. Khởi tạo phiên thanh toán

**POST /api/payment/create-session**. Alias giữ nguyên /api/user/payment/create-session và /api/v1/payment/create-session. Cần đăng nhập. Cookie hợp lệ vẫn yêu cầu X-CSRF-Token theo mục Q của `api_user_3.md`.

```http
Content-Type: application/json
Idempotency-Key: checkout_20261030_001
```

```json
{
  "courseIds": ["COURSE_01", "COURSE_02"],
  "paymentMethod": "sepay",
  "voucherCode": "SAVE20"
}
```

courseIds bắt buộc 1–50 phần tử; có thể dùng courses:[{id:"..."}] để chuyển tiếp hợp đồng cũ. ID trùng/các alias cùng một khóa chỉ tính một lần. Chấp nhận course_id hoặc _id dạng ObjectId của course. Backend bỏ qua price, salePrice, originalPrice, title và voucherDiscount do client tự khai.

Phương thức chuẩn: sepay, vnpay, stripe. Alias bank-transfer→sepay, atm→vnpay, international→stripe. Phương thức khác bị từ chối. bankCode tùy chọn cho VNPay, dạng chữ hoa/số/underscore tối đa 30 ký tự. Không tin header X-Forwarded-For để tự xác định IP cổng; router dùng req.ip.

Giá chính thức: course.price, fallback original_price; giá gốc lấy original_price, fallback giá bán. Phải là số VND nguyên, không âm, trong giới hạn an toàn. Course cần published; khóa đã có trong user_courses hoặc user_enrollments bị từ chối 409 COURSE_ALREADY_OWNED. Không mua được khóa không tồn tại/ngừng bán hoặc có currency khác VND.

Voucher chỉ lấy từ platform_coupons/payment_vouchers, không chấp nhận mã demo hardcode. Kiểm tra trạng thái, thời hạn, min_order_value/minimum_amount, allowed_user_ids, usage_limit/quantity_limit, usage_count, discount_type percent/fixed, discount_value/percent_off và max_discount. usage_count bao gồm lượt đang giữ và đã dùng, tăng một lần trong transaction tạo đơn. Các voucher có course_ids/instructor_id/usage_limit_per_user hiện bị từ chối VOUCHER_SCOPE_UNSUPPORTED để tránh áp sai điều kiện chưa có hợp đồng nghiệp vụ; chưa triển khai loại voucher có phạm vi riêng. Giá trị đếm/giới hạn nên lưu dạng số trong database; backend không chuyển đổi schema cũ tự động.

Nếu tổng hợp lệ bằng 0: paymentMethod trả free, tự ghi nhận đơn miễn phí và chạy fulfillment nội bộ, không gọi webhook giả hay cổng ngân hàng.

201:

```json
{
  "success": true,
  "message": "Đã tạo đơn thanh toán.",
  "data": {
    "orderId": "DH2026103000000001",
    "transactionId": "GD2026103000000001",
    "amount": 400000,
    "currency": "VND",
    "status": "pending",
    "fulfillmentStatus": "pending",
    "expiresAt": "<ISO date>",
    "expiresInSeconds": 899,
    "paymentMethod": "sepay",
    "paymentUrl": "",
    "transferContent": "THINKUP GD2026103000000001",
    "bankInfo": {"bankId":"<configured>","accountNo":"<configured>","accountName":"<configured>"},
    "qrCodeUrl": "<QR URL>"
  }
}
```

bankInfo/qrCodeUrl chỉ có ở SePay. VNPay/Stripe trả paymentUrl. Stripe dùng một line item bằng chính tổng sau voucher, không cộng lại giá từ FE. Mã chống trùng gửi sang Stripe là thinkup-<GD>. Chỉ trả thành công với URL khi gateway initialization thành công; cổng lỗi trả 503 GATEWAY_UNAVAILABLE. Đơn pending có thể đã được tạo trước lỗi kết nối cổng: FE gửi lại cùng key để tiếp tục đúng phiên, không tự tạo nhiều key.

Stripe Session có thời hạn riêng phía Stripe, không cam kết bằng 15 phút nội bộ. Khoản tiền được xác nhận trả sau hạn nội bộ chuyển đối soát; hiện chưa gọi Stripe expire-session khi đơn nội bộ hết hạn.

<a id="payment-2"></a>

## D.2. Kiểm tra trạng thái giao dịch

**GET /api/payment/status/:transactionId** và các alias. Bắt buộc đăng nhập và đúng chủ sở hữu; mã không tồn tại hoặc không thuộc người gọi đều trả 404 PAYMENT_NOT_FOUND, tránh lộ giao dịch người khác. Cache-Control: no-store.

```json
{
  "success": true,
  "transactionId": "GD2026103000000001",
  "orderId": "DH2026103000000001",
  "status": "paid",
  "fulfillmentStatus": "pending",
  "amount": 400000,
  "currency": "VND",
  "paidAt": "<ISO date hoặc null>",
  "expiresAt": "<ISO date>",
  "remainingSeconds": 0
}
```

Polling có thể chuyển pending hết hạn sang expired và giải phóng lượt voucher đúng một lần. paid được thử fulfillment lại; nếu vẫn lỗi thì giữ paid, không báo success. Khi chưa triển khai FE hỗ trợ paid/needs_review, giao diện cũ có thể tiếp tục hiển thị chờ; cần nối lại theo bảng trạng thái D.9.

<a id="payment-3"></a>

## D.3. Webhook và VNPay Return/IPN

### SePay — POST /api/payment/webhook/sepay

Không cần phiên học viên, nhưng bắt buộc Authorization: Apikey <SEPAY_WEBHOOK_KEY> so sánh chính xác bằng timingSafeEqual. Thiếu cấu hình không được bỏ qua xác thực. Kiểm tra transferType=in, accountNumber trùng SEPAY_ACCOUNT_NO; nếu cấu hình SEPAY_GATEWAY_NAME thì gateway cũng phải khớp. Payload cần id nguyên dương, transferAmount, transactionDate dạng YYYY-MM-DD HH:mm:ss (UTC+7) và content có mã GD. Chuyển ra bị bỏ qua an toàn. Không ghi raw payload nhạy cảm vào receipt.

Giao dịch được xác thực nhưng content thiếu/nhiều mã hoặc mã đơn không tồn tại: lưu receipt needs_review, trả success:true để tránh lặp vô hạn. Webhook lặp dựa trên SePay id không cấp quyền thêm. Sai ngân hàng/chữ ký hoặc payload không hợp lệ bị từ chối.

### Stripe — POST /api/payment/webhook/stripe

server.js giữ đúng raw body trước khi JSON parser biến đổi, cho cả ba alias. Kiểm tra Stripe-Signature HMAC SHA-256 với STRIPE_WEBHOOK_SECRET, timestamp lệch tối đa 300 giây. Thiếu/sai/hết hạn chữ ký: 400 WEBHOOK_SIGNATURE_INVALID.

Chỉ xử lý checkout.session.completed và checkout.session.async_payment_succeeded. Backend truy vấn lại Checkout Session bằng STRIPE_SECRET_KEY, kiểm tra payment_status=paid, status=complete, session ID đã lưu ở transaction, client_reference_id, metadata transactionId/orderId. Đối chiếu amount_total/currency tại hàm ghi nhận chung. Các event khác và session chưa paid được ACK ignored, không cấp quyền. Không dùng payment_intent.succeeded làm đường cấp quyền thứ hai.

Nếu webhook đến trước lúc gateway_session_id được lưu, trả 503 GATEWAY_SESSION_MISMATCH để nhà cung cấp retry. Nếu initialization gặp lỗi sau khi Stripe đã tạo session, request cùng key dùng Stripe Idempotency-Key cố định để nhận lại phiên thay vì thu thêm tiền.

### VNPay

- GET /api/payment/vnpay/callback: kiểm tra chữ ký/merchant và kết quả, **không ghi nhận tiền hoặc cấp quyền**; redirect về FE với status=pending nếu thông báo hợp lệ.
- GET /api/payment/vnpay/ipn: sau xác minh mới gọi ghi nhận tiền.
- Encode query đúng một lần; ký HMAC SHA-512, không sửa object query đầu vào; không dùng DEMO_SECRET/merchant demo mặc định.
- Đối chiếu merchant, mã GD, số tiền nguyên theo đơn vị nhân 100, TransactionNo và PayDate UTC+7. Tiền không khớp được giữ để đối soát, không cấp quyền.
- IPN trả RspCode 00 khi đã ghi nhận (bao gồm nhận tiền cần đối soát), 02 khi tham chiếu đã được ghi nhận trước đó, 01 khi không có đơn đối chiếu, 97 khi chữ ký sai, 99 khi chưa xử lý được. Đây là chính sách ACK để lưu khoản tiền cần xử lý; không coi mọi RspCode 00 là đơn đã được cấp quyền.

Đã loại bỏ POST /simulate-success; mọi môi trường đều không có HTTP endpoint cho học viên tự đánh dấu đã thanh toán.

<a id="payment-4"></a>

## D.4. VNPay Return Callback

`GET /api/payment/vnpay/callback`: chỉ xác minh và redirect, không ghi nhận tiền/cấp quyền. Xem D.3.

<a id="payment-5"></a>

## D.5. VNPay Server-to-Server IPN

`GET /api/payment/vnpay/ipn`: xác minh chữ ký/merchant trước khi ghi nhận tiền. Xem D.3.

<a id="payment-6"></a>

## D.6. Webhook Stripe Quốc Tế

`POST /api/payment/webhook/stripe`: cần raw body, chữ ký hợp lệ và đối chiếu Checkout Session. Xem D.3.

<a id="payment-7"></a>

## D.7. Thử lại trên cùng đơn

**POST /api/payment/retry/:orderId** (cùng các alias /api/user/payment và /api/v1/payment). Cần đăng nhập, key mới cho hành động thử lại.

```http
Idempotency-Key: retry_20261030_0001
Content-Type: application/json
```

```json
{"paymentMethod":"stripe"}
```

Chỉ đơn pending thuộc người gọi và còn hạn mới được thử lại. Tạo GD mới, giữ DH, bản chụp giá và thời hạn của đơn gốc; không kéo dài 15 phút và không giữ voucher thêm lần nữa. Lần pending cũ chuyển cancelled, quyền giữ voucher được chuyển sang lần mới. Cùng key retry trả lại lần đã tạo; key khác có thể tạo lần mới và thay thế pending hiện tại. Order hết hạn/đã nhận tiền/đã hoàn tất: 409 ORDER_NOT_PAYABLE. Nếu khách vẫn trả tiền theo lần cancelled cũ thì khoản tiền được lưu needs_review; không cấp trùng và không tự hoàn tiền.

Chưa gọi API đóng phiên cổng cũ khi đổi lần thanh toán; FE phải ngừng hiển thị và cảnh báo không dùng QR/URL cũ.

<a id="payment-8"></a>

## D.8. Phạm vi và yêu cầu vận hành

File xử lý: src/user/payment/payment.service.js, payment.router.js và gateways/sepay.service.js, gateways/vnpay.service.js, gateways/stripe.service.js. File kiểm thử độc lập: src/user/payment/test/payment.test.js. server.js chỉ bổ sung tích hợp raw body Stripe, CORS Idempotency-Key và tác vụ khôi phục payment.

**MongoDB phải hỗ trợ multi-document transaction (replica set/Atlas hoặc sharded cluster phù hợp).** Backend dùng db.client.startSession().withTransaction() của driver hiện có. Không fallback sang ghi nhiều collection không nguyên tử. Thiếu khả năng transaction: 503 PAYMENT_STORAGE_UNAVAILABLE. Không thay đổi db.js hay triển khai replica set tự động.

Sử dụng các collection hiện có: orders, payment_transactions, courses, users, platform_coupons, payment_vouchers, user_enrollments, user_courses và user_cart_items. Bổ sung metadata nghiệp vụ trong các document payment/order: request_hash, fulfillment_status, gateway_session_id/payment_url, voucher_id/voucher_collection/voucher_reserved/voucher_released, review_reason, email_status và lease gửi email. Không thêm collection/index. Bản ghi receipt ở payment_transactions có record_type=gateway_receipt và linked_transaction_id, không có user_id/transaction_id của giao dịch người mua nên không lẫn vào lịch sử mua hàng theo user_id.

<a id="payment-9"></a>

## D.9. Luồng và trạng thái

1. Xác thực User từ session/cookie hoặc Bearer hiện có.
2. Backend đọc giá từ courses, kiểm tra published, quyền sở hữu, tính tổng và voucher từ database.
3. Tạo đồng thời order và transaction bằng MongoDB transaction, giữ lượt voucher trong usage_count.
4. Tạo QR hoặc phiên cổng từ số tiền đã chốt; không fallback sang cổng khác khi lỗi.
5. Chỉ adapter đã xác minh webhook/IPN được ghi nhận tiền. Return URL không cấp quyền học.
6. Ghi receipt và trạng thái paid trước; cấp quyền học/dọn giỏ hàng/hoàn tất order trong transaction riêng có thể thử lại.
7. Gửi email biên lai sau khi quyền đã commit; email lỗi không thu hồi khóa học.

| Trạng thái transaction | Ý nghĩa FE |
| --- | --- |
| pending | Đang chờ thanh toán |
| paid | Đã xác minh nhận tiền, đang chờ/khôi phục cấp quyền; chưa hiển thị hoàn tất |
| success | Cấp quyền và cập nhật order đã commit; fulfillmentStatus=completed |
| expired | Phiên quá 15 phút khi vẫn chưa ghi nhận tiền |
| cancelled | Lần thanh toán cũ được thay bằng lần thử mới |
| needs_review | Có khoản tiền/thông tin cần đối soát, không tự động cấp quyền |

Order tương ứng dùng pending, paid, completed, expired, needs_review. success chỉ dành cho transaction đã hoàn tất fulfillment. Không sử dụng query status=success trên URL làm bằng chứng thanh toán.

Tiền thiếu, thừa, khác tiền tệ, đến sau hạn, giao dịch cũ/cancelled hoặc tài khoản bị khóa được giữ để đối soát. Khoản chuyển SePay thiếu/mơ hồ mã GD hoặc tham chiếu đơn không tồn tại cũng được lưu receipt; không âm thầm bỏ tiền. Chưa có API admin xử lý đối soát/hoàn tiền và không tự gọi hoàn tiền. Thanh toán đúng trước hạn nhưng webhook đến trễ có thể xử lý theo thời điểm nhà cung cấp; nếu lượt voucher đã được giải phóng thì chuyển needs_review để tránh cấp ưu đãi vượt giới hạn.

<a id="payment-10"></a>

## D.10. Mã định danh và chống trùng

| Mã | Cách dùng |
| --- | --- |
| orderId / order_id | Giữ chuẩn DH + ngày YYYYMMDD + sequence 8 số hiện có |
| transactionId / transaction_id | Giữ chuẩn GD + ngày + sequence 8 số; một lần thử thanh toán |
| Idempotency-Key | Header do FE sinh cho hành động tạo đơn/thử lại; 16–128 ký tự A–Z/a–z/0–9/_/- |
| request_hash | SHA-256 dữ liệu nghiệp vụ để cùng key không thể được dùng cho nội dung khác |
| gateway_transaction_no | SePay id, VNPay TransactionNo, Stripe Checkout Session ID đã đối chiếu |
| gateway_event_id | Định danh sự kiện nếu có; Stripe event.id |
| receipt _id | SHA-256 của cổng và gateway reference, dựa vào unique _id MongoDB để chống dùng một khoản tiền cho hai đơn |

Cùng user/key/nội dung: trả lại phiên hiện có, không giữ voucher hay tạo đơn thêm. Cùng key nhưng đổi khóa học/cổng/voucher: 409 IDEMPOTENCY_CONFLICT. Đơn hết hạn muốn mua lại cần key mới và giá được tính lại. Retry trong hạn có API riêng bên dưới để giữ mã DH, đổi mã GD.

<a id="payment-11"></a>

## D.11. Ghi nhận tiền và fulfillment có thể phục hồi

fulfillPaymentSuccess nhận transactionId, gateway, gatewayTransactionNo, gatewayEventId, paidAmount, currency, paidAt từ adapter backend đã xác minh; không gắn trực tiếp request body người dùng vào hàm này. Hàm không tự xác minh chữ ký nhà cung cấp, trách nhiệm đó thuộc adapter.

Một transaction MongoDB ghi receipt có _id xác định và chuyển payment/order sang paid hoặc needs_review. Ref đã gắn đơn khác trả 409 GATEWAY_REPLAY, sai cổng trả 409 GATEWAY_MISMATCH. Cùng ref/nội dung được nhận lại an toàn. Receipt không có số tiền dương/thời gian hợp lệ bị từ chối, không tự thay số tiền thiếu bằng số tiền đơn.

completePaidOrder(transactionId,options) chạy transaction khác để:

1. Kiểm tra paid và tài khoản còn được phép nhận quyền.
2. Kiểm tra lại quyền đã được cấp bởi đơn khác trong thời gian chờ: nếu có thì chuyển course_already_owned để đối soát, không ghi đè tiến độ. Nếu đủ điều kiện, upsert quyền bằng _id xác định ở user_enrollments và user_courses cho tương thích các phần đọc hiện tại; giữ nguyên progress và dữ liệu enrollment của chính đơn đã có, không reset về 0.
3. Xóa đúng khóa đã mua khỏi user_cart_items của đúng user bằng điều kiện $and, không xóa giỏ người khác.
4. Đổi order thành completed và transaction thành success/fulfillment_status=completed cùng lúc.

Nếu một bước lỗi thì toàn bộ fulfillment rollback, tiền/receipt đã ghi trước đó vẫn tồn tại ở paid. Webhook lặp, polling hoặc worker sẽ thử lại. Giao dịch legacy không có request_hash/fulfillment_status của quote an toàn mới không được tự cấp quyền, chuyển legacy_unverified_quote để đối soát. Không tự migrate các đơn cũ đã success hoặc sửa quyền học cũ.

recoverPayments(options) chạy khi server khởi động trực tiếp/production, mỗi 60 giây với chống chồng lặp trong một tiến trình. Mỗi lượt lấy tối đa 50 pending đã hết hạn, 50 paid và 50 success đang chờ email. Có thể có nhiều instance; transaction và claim gửi email kiểm soát cạnh tranh giữa các instance.

Email dùng lease 60 giây, thất bại hẹn thử lại sau 5 phút. Đây là gửi ít nhất một lần: nếu SMTP đã nhận thư nhưng tiến trình chết trước khi ghi sent thì có thể gửi trùng sau lease. Chưa có nhà cung cấp email hỗ trợ idempotency nên không cam kết exactly-once cho email. Biên lai HTML hiện có không được tuyên bố là hóa đơn điện tử hợp pháp đã phát hành.

<a id="payment-12"></a>

## D.12. Hàm, phụ thuộc và cấu hình

| Hàm | Đầu vào / đầu ra |
| --- | --- |
| createPaymentSession(params,options) | params có userId/courseIds hoặc courses/paymentMethod/voucherCode/idempotencyKey; trả sessionView |
| retryPaymentSession(params,options) | userId/orderId/idempotencyKey/paymentMethod; trả sessionView của GD mới |
| checkPaymentStatus(transactionId,userId,options) | Kiểm tra chủ giao dịch, expiry, thử phục hồi paid; trả document nội bộ |
| fulfillPaymentSuccess(params,options) | Ghi khoản tiền đã xác minh; trả success/alreadyProcessed/orderId/transactionId/status/fulfillmentStatus, hoặc unmatched |
| completePaidOrder(transactionId,options) | Cấp quyền và hoàn tất dữ liệu nguyên tử; không nhận dữ liệu tiền từ FE |
| recordUnmatchedTransfer(params,options) | Ghi chuyển khoản SePay thiếu mã để đối soát |
| recoverPayments(options) | Trả checked/failed; helper nội bộ, không mở API công khai |
| paymentTransaction(db,work) | Chạy work(session) trong MongoDB transaction, không fallback ghi rời |
| createPaymentRouter(express,requireAuth,options) | Router với dependency injection phục vụ kiểm thử; server không nhận options từ body |
| verifyStripeEvent(rawBody,signature,now) | Trả event đã kiểm tra chữ ký/timestamp hoặc lỗi |
| stripeRequest(path,request,options) | REST Stripe với timeout 10 giây và lỗi đã chuẩn hóa |
| createStripeCheckoutSession(params,options) | Trả sessionId/url từ tổng đơn chính thức |
| canonicalVnpay(params) | Chuỗi ký encode đúng một lần |
| verifyVnpayCallback(params,options) | settle=false mặc định chỉ xác minh; settle=true cho IPN |
| handleSepayWebhook(payload,authorization,options) | Xác thực SePay rồi ghi tiền hoặc chuyển đối soát |

options.db/options.generateIds/options.fetch/options.sendEmail chỉ là dependency backend/test, không phải đầu vào HTTP.

Cấu hình cần có:

- SePay: SEPAY_BANK_ID, SEPAY_ACCOUNT_NO, BANK_ACCOUNT_HOLDER, SEPAY_WEBHOOK_KEY; SEPAY_GATEWAY_NAME tùy chọn để kiểm tra tên ngân hàng trong webhook.
- Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CLIENT_URL. Các phương thức khả dụng để Stripe quyết định theo cấu hình merchant, không hardcode PayPal/VND khi chưa biết hỗ trợ.
- VNPay: VNP_TMN_CODE/VNPAY_TMN_CODE, VNP_HASH_SECRET/VNPAY_HASH_SECRET, VNP_RETURN_URL/VNPAY_RETURN_URL; VNP_URL/VNPAY_URL tùy chọn, mặc định endpoint sandbox. Production cần đặt URL cổng thật và Return URL HTTPS đúng backend callback.
- MongoDB có transaction; SMTP theo cấu hình hiện có trong db.js.

Chưa sửa giá trị môi trường. Thiếu cấu hình: 503 PAYMENT_NOT_CONFIGURED. Không dùng số tài khoản giả hay khóa demo làm fallback.

<a id="payment-13"></a>

## D.13. Lỗi, kiểm thử và giới hạn tích hợp

Các code chính: PAYMENT_INVALID (400), IDEMPOTENCY_REQUIRED (400), IDEMPOTENCY_CONFLICT (409), COURSE_UNAVAILABLE (400), COURSE_ALREADY_OWNED (409), VOUCHER_INVALID (400), VOUCHER_CHANGED (409), VOUCHER_SCOPE_UNSUPPORTED (400), ORDER_NOT_PAYABLE (409), PAYMENT_NOT_FOUND (404), GATEWAY_REPLAY/GATEWAY_MISMATCH (409), WEBHOOK_UNAUTHORIZED (401), WEBHOOK_SIGNATURE_INVALID (400), PAYMENT_NOT_CONFIGURED/PAYMENT_STORAGE_UNAVAILABLE/GATEWAY_UNAVAILABLE (503). Lỗi hệ thống chưa chuẩn hóa tại router payment trả thông báo chung PAYMENT_INTERNAL_ERROR, không trả chi tiết DB/nhà cung cấp.

Đã thay bộ test payment dùng database thật bằng các kiểm thử hợp đồng mới, database trong bộ nhớ hỗ trợ snapshot/rollback và khóa transaction mô phỏng; HTTP dùng router payment thật, không bypass logic nghiệp vụ.

```text
node --test server/src/user/payment/test/payment.test.js server/src/user/auth/test/auth-security.user.test.js server/src/user/auth/test/cookie.user.test.js
```

Kết quả: 44/44 bài đạt (21 payment + 23 auth/cookie), exit code 0. Payment bao phủ tính tiền từ DB, bỏ giá/voucher client, TTL, idempotency đồng thời, đầu vào sai, thiếu cấu hình/transaction, voucher giữ/giải phóng/rollback, đơn miễn phí, cấp quyền trùng/phục hồi/giữ tiến độ, đúng giỏ hàng, đến muộn/lệch tiền/khác tiền tệ, replay/sai cổng, chủ giao dịch, tài khoản khóa, retry cùng DH, SePay, VNPay encoding và Return/IPN, Stripe signature/raw body/timestamp/đối soát/session chưa paid, email thử lại, HTTP auth/status và bỏ simulation, chuyển khoản không có mã.

Chưa chạy MongoDB replica set thật, cổng sandbox/live, SMTP thật hoặc trình duyệt frontend. Mô phỏng transaction không thay thế kiểm thử isolation/write conflict/retry của MongoDB thật. Cần kiểm chứng lại VNPay/SePay/Stripe theo cấu hình merchant trước khi nhận tiền thật. Ghi chú lịch sử tại lượt S (History/Billing có cập nhật tiếp ở T.19, T.20, X và Y của file 3): các bộ lọc trạng thái cũ có thể chưa chấp nhận paid/needs_review; hợp đồng phần này là đầu vào để FE và phần lịch sử tích hợp sau. Chưa có admin reconciliation/refund, API hủy đơn chủ động, TTL migration, hoặc đóng Stripe Session cũ khi retry/hết hạn.

<a id="payment-14"></a>

## D.14. Inbox và email biên nhận

`sendPaymentReceipt` trong Payment kiểm tra `invoiceEmail` trước mỗi lần gửi/thử lại, sau đó kiểm tra `getNotificationDeliveryPolicy(userId,'transactions',options)`:

- invoiceEmail=false: ngừng gửi biên nhận, kể cả lần thử lại đang chờ.
- Notification email=false: ngừng email biên nhận dù invoiceEmail=true.
- DND đang bật: hoãn email, giữ pending để recovery kiểm tra lại; DND vô thời hạn tiếp tục hoãn.
- Bật lại email chỉ áp dụng cho lần gửi đủ điều kiện mới; không tự gửi bù lịch sử đã đánh dấu suppressed.
- Lỗi preferences/email không hủy giao dịch success hoặc thu hồi khóa học đã cấp.

Hoàn tất đơn vẫn tạo inbox theo sự kiện `order-completed:<orderId>` trong luồng fulfillment, độc lập lựa chọn email. Inbox lưu cùng transaction nghiệp vụ để tránh tin thành công khi cấp quyền thất bại. Không thay đổi xác minh tiền, số tiền, giá khóa học, trạng thái giao dịch hay quyền khóa học. Email bảo mật dùng chính sách bắt buộc riêng, không chịu công tắc hóa đơn.

Xem mục W của `api_user_3.md` để biết chống trùng, rollback, recovery và các điểm phát sự kiện ở Blog/Onboarding/Studyroom/Account Security.

---

# E. MÔ TẢ CÁC HÀM BACKEND NỘI BỘ

### E.1. Nhóm hàm Roadmap (`roadmap.user.js`)
* `getCareerRoadmapsList()`: Lấy danh sách nghề nghiệp chuẩn.
* `getRoadmapTemplate(categoryId)`: Lấy cấu trúc giáo trình kiểm duyệt.
* `selectUserRoadmap(userId, categoryId)`: Kích hoạt lộ trình học.
* `getMyRoadmap(userId)`: Lấy lộ trình cá nhân và tiến độ.
* `getStageTestQuestions(stageId)`: Lấy đề thi giai đoạn (ẩn đáp án đúng).
* `submitStageTest(userId, stageId, answers)`: Chấm điểm bài test, tính EWMA ($\alpha = 0.6$), gắn cờ review nếu điểm node $< 40\%$.
* `syncCourseProgressToRoadmap(userId)`: Đồng bộ tiến độ từ các khóa học đã ghi danh vào node (bảo toàn cờ review).
* `getNodeCourseRecommendations(userId, nodeId, options)`: Gợi ý 4 khóa học chưa sở hữu theo Node (loại bỏ trường rác `recommendation_reason`).
* `determineNodeStatus(currentStatus, score, wasFailedInTest)`: Giữ nguyên cờ `review` nếu node đã bị review.

### E.2. Nhóm hàm Flashcard (`flashcard.user.js`)
* `getFlashcardLists(userId)`: Truy xuất tất cả bộ thẻ kèm tiến độ x/x, cờ `node_id`, `roadmap_id`.
* `createFlashcardList(userId, payload)`: Tạo bộ thẻ độc lập.
* `createReviewFlashcardListFromRoadmapNode(userId, payload)`: Tạo bộ thẻ ôn tập từ Node Roadmap (tiêu đề node, mô tả `Ôn tập "<tên node>"`).
* `startLearningSession(listId, userId, options)`: Tạo phiên học theo 3 chế độ (`order`, `random`, `restart`), loại trừ thẻ "Đã học".
* `getFlashcardsInList(listId, userId, options)`: Lấy chi tiết thẻ và hỗ trợ lọc thẻ chưa học.
* `updateFlashcardList(listId, userId, payload)`: Chỉnh sửa bộ thẻ. Chặn xóa thẻ nếu gắn Roadmap và số thẻ $< 5$. Giữ trạng thái thẻ cũ theo ID từ database; chỉ thẻ mới có trạng thái `chưa học`.
* `deleteFlashcardList(listId, userId)`: Xóa bộ thẻ của chính người dùng; bảo vệ bộ thẻ liên kết với node còn ôn tập bắt buộc.
* `updateCardStatus(listId, cardId, userId, action)`: Đổi trạng thái thẻ ("Đã học", "ôn tập", "chưa học", hoặc xoay vòng cycle).
* `getFlashcardListStats(listId, userId)`: Thống kê số lượng thẻ theo từng trạng thái.
* `checkAndUpdateRoadmapFromFlashcard(userId, nodeId, listId, options={})`: **Cơ chế duy nhất giải tỏa cờ review** khi bộ thẻ có $\ge 5$ thẻ và đã học hoàn thành $100\%$.
* `calculateFlashcardStats(cards)`: Tiện ích tính tỷ lệ tiến độ và % thẻ đã học.

### E.3. Nhóm hàm Thanh toán (`payment.service.js` & Cổng đối tác)

| Hàm | Đầu vào / đầu ra |
| --- | --- |
| createPaymentSession(params,options) | params có userId/courseIds hoặc courses/paymentMethod/voucherCode/idempotencyKey; trả sessionView |
| retryPaymentSession(params,options) | userId/orderId/idempotencyKey/paymentMethod; trả sessionView của GD mới |
| checkPaymentStatus(transactionId,userId,options) | Kiểm tra chủ giao dịch, expiry, thử phục hồi paid; trả document nội bộ |
| fulfillPaymentSuccess(params,options) | Ghi khoản tiền đã xác minh; trả success/alreadyProcessed/orderId/transactionId/status/fulfillmentStatus, hoặc unmatched |
| completePaidOrder(transactionId,options) | Cấp quyền và hoàn tất dữ liệu nguyên tử; không nhận dữ liệu tiền từ FE |
| recordUnmatchedTransfer(params,options) | Ghi chuyển khoản SePay thiếu mã để đối soát |
| recoverPayments(options) | Trả checked/failed; helper nội bộ, không mở API công khai |
| paymentTransaction(db,work) | Chạy work(session) trong MongoDB transaction, không fallback ghi rời |
| createPaymentRouter(express,requireAuth,options) | Router với dependency injection phục vụ kiểm thử; server không nhận options từ body |
| verifyStripeEvent(rawBody,signature,now) | Trả event đã kiểm tra chữ ký/timestamp hoặc lỗi |
| stripeRequest(path,request,options) | REST Stripe với timeout 10 giây và lỗi đã chuẩn hóa |
| createStripeCheckoutSession(params,options) | Trả sessionId/url từ tổng đơn chính thức |
| canonicalVnpay(params) | Chuỗi ký encode đúng một lần |
| verifyVnpayCallback(params,options) | settle=false mặc định chỉ xác minh; settle=true cho IPN |
| handleSepayWebhook(payload,authorization,options) | Xác thực SePay rồi ghi tiền hoặc chuyển đối soát |

options.db/options.generateIds/options.fetch/options.sendEmail chỉ là dependency backend/test, không phải đầu vào HTTP.

Cấu hình cần có:

- SePay: SEPAY_BANK_ID, SEPAY_ACCOUNT_NO, BANK_ACCOUNT_HOLDER, SEPAY_WEBHOOK_KEY; SEPAY_GATEWAY_NAME tùy chọn để kiểm tra tên ngân hàng trong webhook.
- Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CLIENT_URL. Các phương thức khả dụng để Stripe quyết định theo cấu hình merchant, không hardcode PayPal/VND khi chưa biết hỗ trợ.
- VNPay: VNP_TMN_CODE/VNPAY_TMN_CODE, VNP_HASH_SECRET/VNPAY_HASH_SECRET, VNP_RETURN_URL/VNPAY_RETURN_URL; VNP_URL/VNPAY_URL tùy chọn, mặc định endpoint sandbox. Production cần đặt URL cổng thật và Return URL HTTPS đúng backend callback.
- MongoDB có transaction; SMTP theo cấu hình hiện có trong db.js.

Chưa sửa giá trị môi trường. Thiếu cấu hình: 503 PAYMENT_NOT_CONFIGURED. Không dùng số tài khoản giả hay khóa demo làm fallback.

* `sendPaymentReceipt`: kiểm tra invoiceEmail và chính sách thông báo trước mỗi lần gửi/thử lại; xem D.14.

---

# E.4. GỢI Ý KHÓA HỌC CHO GIỎ HÀNG (`rcm_course.js`)
File: `server/src/user/course/rcm_course.js` (test: `server/src/user/course/test/rcm_course.test.js`). Các hàm recommendation dùng chung lõi `rankCatalog`; Home hiện gọi `getPersonalizedCourseFeed` trực tiếp từ handler Home, không mở endpoint recommendation mới.

* `getRecommendedCourses({ userId, guestCartIds, limit, dbInstance })` → `Promise<{ budget, blend, recommendations }>`
  * `userId` (`string|null`): học viên đăng nhập; `null` = khách. Phải lấy từ JWT, không tin dữ liệu client.
  * `guestCartIds` (`string[]`): `course_id` trong giỏ tạm của khách (chỉ dùng khi `userId = null`).
  * `limit` (`number|string`, mặc định `4`, tối đa `12`).
  * `budget`: `{ reference_price: number, source: 'cart' | 'purchased' | null }`.
  * `recommendations`: thẻ khóa học **đầy đủ trường** y hệt `getCourseCards`, thêm `recommendation_method` (`rules`/`ml`, xem E.4a), (gồm `action_state`, `action_label`, `is_in_wishlist`, `duration_formatted`, `tag_names`...) kèm `recommend_score` và `score_breakdown { tag, cooccurrence, budget, popularity }`.
  * Loại trừ tuyệt đối khóa đã mua và khóa đang trong giỏ. Lỗi `400` (có `field`) khi `userId`/`guestCartIds`/`limit` sai.
* `getPersonalizedCourseFeed({ userId, page, limit, dbInstance })` → `Promise<{ pagination, blend, preferences, courses }>`: danh sách khóa học trang chủ cá nhân hóa. Home gọi hàm này nội bộ với `page: 1`, `limit: 5`; `userId` bắt buộc và do handler lấy từ JWT; `limit` mặc định `12`, tối đa `50`; không loại khóa nào (thẻ có `action_state`); mỗi thẻ đầy đủ trường kèm `recommend_score`, `recommendation_method`, `score_breakdown`. `pagination` cùng cấu trúc `getCourseCards`.
* `blend: { behavior_weight (0..1), interactions }`: **cơ chế chuyển từ onboarding sang hành vi.** `behavior_weight = min(1, (số khóa trong giỏ + đã mua) / 5)`. Hồ sơ tag = `(1 - w) × tag onboarding + w × tag hành vi` (mỗi nguồn chuẩn hóa tổng 1; giỏ ×3, đã mua ×2). Người dùng mới (w = 0) xếp hoàn toàn theo onboarding (giải quyết cold start); từ 5 tương tác trở lên (w = 1) xếp hoàn toàn theo hành vi. Thiếu nguồn nào thì dùng nguồn còn lại.
* **Điểm tối đa 280:** Tag 100 + Co-occurrence 80 (học viên khác cùng sở hữu khóa trong giỏ/đã mua) + Ngân sách 50 (giá ≤ 1.3× giá TB các khóa có phí trong giỏ = tối đa, về 0 tại 2.5×; khóa miễn phí = 40; không có giá tham chiếu = 0) + Phổ biến 40 (rating, lượt học, lượt đánh giá) + Trình độ onboarding 10 × (1 − w).
* **Hiệu năng:** chấm điểm trên danh mục nhẹ (chỉ projection trường cần, gắn tag bằng 1 truy vấn batch, cache trong bộ nhớ 60 giây theo kết nối DB; `clearRecommendationCache()` để xóa); chỉ làm giàu thẻ đầy đủ cho các khóa được chọn (≤ `limit`) qua `getSingleCourseCard`, tự dự phòng `getCourseCards` nếu thẻ không khớp khóa mong muốn. Các truy vấn độc lập chạy song song.
* Hàm tính điểm thuần (export để kiểm thử): `normalizeLimit`, `computeBudget`, `computeBudgetScore`, `computeTagScore`, `computePopularityScore`, `computeBehaviorWeight`, `blendTagAffinity`, `computeLevelScore`.
* Phụ thuộc: `getCourseCards`, `getSingleCourseCard` (`course.user.js`), collections `courses`, `course_tags`, `user_cart_items`, `user_courses`, `user_enrollments`, `student_onboarding_answers`.
* Kiểm thử: đã chạy các case hàm thuần (gồm trộn/level) và TC-RCM-01..06, TC-FEED-01..02 (DB thật, tự dọn), tất cả đều qua; chưa có case riêng cho co-occurrence với dữ liệu mua chéo.
* Giới hạn: hiện không dùng `category_id` (danh mục nhẹ không lấy), chỉ dùng onboarding tag và level; cache danh mục có thể trễ tối đa 60 giây khi khóa học/tag đổi. Home dùng chung lõi này; endpoint recommendation độc lập vẫn chưa được đăng ký.

---

### E.4a. Xếp hạng rules / ML

| Tên hàm / thành phần | Vị trí | Vai trò |
| :--- | :--- | :--- |
| `trainCourseRanker(events, options)` | `server/src/user/course/ml/course_ranker.js` | Huấn luyện logistic regression có regularization. Trả về mô hình hoặc `null` nếu không đủ mẫu và cả hai lớp nhãn. |
| `scoreCourseWithModel(model, features)` | `server/src/user/course/ml/course_ranker.js` | Trả xác suất phù hợp trong khoảng 0–1; trả `null` nếu mô hình không hợp lệ. |
| `createSyntheticCourseEvents(options)` | `server/src/user/course/ml/course_ranker.js` | Sinh dữ liệu giả dùng riêng cho kiểm thử; không ghi vào MongoDB. |
| `getMlFeatures(scoreBreakdown, behaviorWeight)` | `server/src/user/course/rcm_course.js` | Chuẩn hóa các điểm quy tắc thành sáu đặc trưng đầu vào cho mô hình. |
| `fetchCourseFeedback(db, now)` | `server/src/user/course/rcm_course.js` | Đọc tối đa 5.000 bản ghi mỗi nguồn từ giỏ hàng, đăng ký/mua, đánh giá và tiến độ; chỉ tạo nhãn tiêu cực từ đánh giá 1–2 sao. |
| `getCourseRanker(db, now, rankedById)` | `server/src/user/course/rcm_course.js` | Huấn luyện khi cache hết hạn và đủ tín hiệu; cache sự kiện 5 phút, mô hình 1 giờ trong bộ nhớ tiến trình. |
| `rankCatalog(...)` | `server/src/user/course/rcm_course.js` | Chấm điểm theo quy tắc; nếu mô hình sẵn sàng thì xếp hạng bằng ML, nếu không giữ thứ hạng quy tắc. |

#### Điều kiện bật ML

- Tối thiểu **200 cặp người dùng – khóa học có nhãn**.
- Có tối thiểu **30 nhãn tích cực** và **30 nhãn tiêu cực**.
- Tích cực hiện được suy ra từ giỏ hàng, đăng ký/mua, hoàn thành/tiến độ từ 80% trở lên hoặc đánh giá từ 4 sao.
- Tiêu cực chỉ được suy ra từ đánh giá 1–2 sao. Mẫu không có tương tác không bị mặc định là tiêu cực.
- Nếu chưa đạt một điều kiện nào, `trainCourseRanker` trả `null` và API tiếp tục xếp hạng bằng quy tắc.

Đây là ngưỡng khởi đầu để tránh bật quá sớm, chưa phải bằng chứng chất lượng mô hình. Mô hình hiện dùng đặc trưng xếp hạng được tính cho danh sách khóa trong request và dữ liệu nhãn hiện có; chưa lưu artifact mô hình bền vững giữa các lần khởi động server.

#### API hiện hữu và dữ liệu trả về

Không thêm endpoint mới. Các API gợi ý hiện có tiếp tục dùng hợp đồng response trước đó; mỗi khóa được bổ sung trường:

```json
{
  "recommendation_method": "rules"
}
```

Khi đạt điều kiện và mô hình hợp lệ, trường này có giá trị `"ml"`. `recommend_score` của `rules` vẫn là điểm tổng theo trọng số quy tắc; ở chế độ `ml`, điểm được đổi thành xác suất 0–100. Không nên so sánh trị tuyệt đối giữa hai chế độ; thứ tự trong mỗi danh sách mới là mục đích sử dụng.

#### Hiệu năng, lưu trữ và giới hạn triển khai

- Mô hình không cần thư viện hoặc API AI bên ngoài; huấn luyện và dự đoán bằng JavaScript trong backend, không phát sinh phí dịch vụ ML.
- Có giới hạn đọc tối đa 5.000 bản ghi mỗi nguồn và 10.000 mẫu huấn luyện; cache giúp giảm việc đọc và huấn luyện lặp lại trong cùng tiến trình.
- Cache bộ nhớ có thể mất khi Vercel khởi tạo lại hàm, và không được chia sẻ giữa các instance. Lúc cache lạnh, backend có thể phải đọc dữ liệu và huấn luyện lại; vì vậy chưa đảm bảo mô hình được duy trì bền vững qua nhiều tháng.
- MongoDB, Vercel và lưu lượng vẫn chịu giới hạn gói miễn phí của nhà cung cấp. “Không phí mô hình” không đồng nghĩa toàn hệ thống được bảo đảm miễn phí dài hạn.
- Các collection hiện được đọc ở chế độ chỉ đọc; không tạo collection, không ghi nhãn tổng hợp hay sửa schema. Dữ liệu giả chỉ chạy trong test.
- Chưa xác nhận test tích hợp với MongoDB do kết nối test treo tại môi trường thực thi. Cần kiểm chứng trên môi trường có DB và đánh giá chất lượng mô hình trên dữ liệu thật trước khi xem ML là bộ xếp hạng đáng tin cậy.

# E.5. KHÓA HỌC CHI TIẾT, HỌC THỬ & ĐÁNH GIÁ (`course.user.js`)
File: `server/src/user/course/course.user.js` (test: `server/src/user/course/test/course.user.test.js`). Đã đăng ký tập trung vào `createCourseRouter` và gắn trong `server.js`.

* `getCourseDetailLanding(courseIdentifier, userId, dbInstance)` → `Promise<object>`:
  * Lấy dữ liệu toàn diện cho trang Course Landing Page theo chuẩn UI/UX.
  * Phân rã Banner, Giá & Giảm giá, Bộ đếm ngược FOMO (`sale_ends_at`), Danh sách Coupons riêng của Giảng viên (`pricing.coupons`).
  * 3 Cam kết mua hàng (`purchase_highlights`: Truy cập trọn đời, Chứng chỉ hoàn thành, Thanh toán bảo mật).
  * Mô tả 3 cột chuẩn (`course_outcomes`: Mục tiêu, Kiến thức đạt được, Kỹ năng yêu cầu).
  * Cấu trúc đề cương (`sections`): Tự tính tổng thời lượng từng chương (`duration_formatted`), cờ khóa Accordion từ chương 2 (`is_chapter_locked`).
  * **Bảo mật Syllabus:** Ẩn toàn bộ link video bài học bị khóa (`can_preview_now: false`), chỉ mở cho bài video học thử (`is_free = 1`).
  * Giảng viên: kèm `positive_rating` (% đánh giá tích cực), `total_students`, `total_courses`.
  * Chứng chỉ mẫu kèm link xác minh (`verify_url: "thinkup.vn/verify"`).
* `getCoursePreviewData(courseIdentifier, userId, dbInstance)` → `Promise<object>`:
  * Lấy dữ liệu cho trình phát học thử (Free Trial Course Player).
  * Cấu hình Player: Tắt tính năng đánh dấu hoàn thành (`allow_mark_completed: false`), khóa Tab Hỏi đáp/Thảo luận (`allow_qa: false`), cung cấp cấu hình Upsell Popup khi hết bài học thử.
  * Danh sách bài học thử (`preview_lessons`) có đính kèm video URL Cloudinary chạy được ngay.
  * Danh sách tài liệu đính kèm (`resources`: Lead Magnet) cho phép tải trực tiếp file về máy.
* `getCourseReviews(courseId, { rating, sort, page, limit }, dbInstance)` → `Promise<object>`:
  * Lấy danh sách đánh giá kèm phân trang Ajax và lọc động.
  * Sắp xếp (`sort`): `newest` (Mới nhất), `highest` (Đánh giá cao nhất: 5 -> 1 sao), `lowest` (Đánh giá thấp nhất: 1 -> 5 sao).
  * Lọc theo sao (`rating`): `all` hoặc `1..5`.
  * Thống kê Dropdown (`filter_summary.filter_options`): Tự động đếm tổng số bài đánh giá của từng mức sao (vd: `5 sao (72)`, `4 sao (25)`).
  * Chuyển đổi mốc thời gian tự nhiên (`created_at_relative`: *"2 tuần trước"*, *"1 tháng trước"*).
* `formatTimeAgo(dateVal)` → `string`: Hàm tiện ích tính khoảng cách thời gian tương đối.

---

### E.6. Nhóm hàm Giỏ hàng (`cart.user.js`)
File: `server/src/user/cart/cart.user.js` (test: `server/src/user/cart/test/cart.user.test.js`). Đã đăng ký vào `createCartRouter` và gắn trong `server.js`.

* `formatVND(amount)` → `string`: Tiện ích định dạng tiền tệ Việt Nam Đồng (ví dụ: `499.000đ`).
* `checkCourseOwnership(db, userId, courseId)` → `Promise<boolean>`: Kiểm tra xem người dùng đã mua hoặc ghi danh khóa học hay chưa trong cả `user_courses` và `user_enrollments`.
* `validateVoucherLogic(db, rawCode, eligibleSubtotal, userId)` → `Promise<object>`: Kiểm tra hạn sử dụng, trạng thái kích hoạt, giới hạn lượt dùng của mã voucher trong `platform_coupons` / `payment_vouchers`, tính toán số tiền giảm giá và áp dụng trần giới hạn tối đa cùng nguyên tắc chống chiết khấu âm.
* `getCartDetails({ userId, guestCourseIds, selectedCourseIds, voucherCode })` → `Promise<object>`: Lấy chi tiết đầy đủ các khóa học trong giỏ hàng (hỗ trợ cả khách vãng lai và học viên đăng nhập), tính tổng phụ, chiết khấu và tổng thanh toán.
* `mergeGuestCartLogic(userId, guestCourseIds)` → `Promise<object>`: Đồng bộ danh sách khóa học tạm từ LocalStorage vào MongoDB sau khi người dùng đăng nhập. Tự động loại trừ các khóa đã sở hữu và chống trùng lặp.
* `addToCartLogic(userId, courseId)` → `Promise<object>`: Thêm 1 khóa học vào giỏ hàng. Chặn nghiêm ngặt nếu học viên đã sở hữu khóa học (`ALREADY_OWNED`). Đảm bảo Idempotent.
* `removeFromCartLogic(userId, courseId)` → `Promise<object>`: Xóa một khóa học khỏi giỏ hàng người dùng.
* `createCartRouter(express, requireAuth, optionalAuth)` → `express.Router`: Router khởi tạo toàn bộ 5 endpoints của phân hệ Giỏ hàng.

---

### E.7. Nhóm hàm Khóa học Yêu thích (`favorites.user.js`)
File: `server/src/user/favorites/favorites.user.js` (test: `server/src/user/favorites/test/favorites.user.test.js`). Đã đăng ký vào `createFavoritesRouter` và gắn trong `server.js`.

* `sortFavoriteCourses(items, sort)` → `Array<object>`: Sắp xếp danh sách khóa học yêu thích theo 8 chế độ (`newest`, `oldest`, `price_asc`, `price_desc`, `highest_rated`, `popular`, `title_asc`, `title_desc`).
* `getUserFavoriteCourseIds(userId, dbInstance)` → `Promise<string[]>`: Truy xuất nhanh mảng ID các khóa học đã thích với độ phức tạp $O(1)$ phục vụ gắn cờ Trái tim phía Frontend.
* `checkFavoriteStatus(userId, courseId, dbInstance)` → `Promise<boolean>`: Kiểm tra xem một khóa học cụ thể có nằm trong danh sách yêu thích của người dùng hay không.
* `addFavoriteCourse(userId, courseId, dbInstance)` → `Promise<object>`: Thêm khóa học vào danh sách yêu thích, kiểm tra khóa học hợp lệ và chống trùng lặp.
* `removeFavoriteCourse(userId, courseId, dbInstance)` → `Promise<object>`: Gỡ một khóa học khỏi danh sách yêu thích.
* `toggleFavoriteCourse(userId, courseId, dbInstance)` → `Promise<object>`: Nút bấm 1 chạm: nếu chưa thích thì thêm vào, nếu đã thích thì gỡ bỏ.
* `syncFavoritesLogic(userId, guestWishlistIds, dbInstance)` → `Promise<object>`: Đồng bộ các ID khóa học người dùng đã thích khi là khách vào CSDL sau khi đăng nhập.
* `getUserFavorites({ userId, sort, page, limit, search, category_id, level }, dbInstance)` → `Promise<object>`: Lấy danh sách khóa học yêu thích đầy đủ thông tin chuẩn `CourseCard` kèm phân trang và bộ lọc tìm kiếm.
* `clearUserFavorites(userId, dbInstance)` → `Promise<object>`: Xóa toàn bộ danh sách khóa học yêu thích của người dùng.
* `createFavoritesRouter(express, requireAuth, optionalAuth)` → `express.Router`: Router khởi tạo toàn bộ 8 endpoints của phân hệ Khóa học yêu thích.

---

# F. BẢNG TỔNG HỢP TOÀN BỘ ENDPOINTS & MÃ LỖI

| Phân hệ | Method | Endpoint | Quyền (Auth) | Mô tả tóm tắt |
| :--- | :--- | :--- | :---: | :--- |
| **Roadmap** | `GET` | `/api/user/roadmap/careers` | Public | Danh sách nghề nghiệp có lộ trình |
| **Roadmap** | `GET` | `/api/user/roadmap/template/:categoryId` | Public | Xem cấu trúc chi tiết lộ trình mẫu |
| **Roadmap** | `POST`| `/api/user/roadmap/select` | Học viên | Chọn và kích hoạt lộ trình học |
| **Roadmap** | `GET` | `/api/user/roadmap/my-roadmap` | Học viên | Lấy lộ trình cá nhân & tiến độ |
| **Roadmap** | `GET` | `/api/user/roadmap/stage-test/:stageId` | Học viên | Lấy đề thi kiểm tra giai đoạn (ẩn đáp án) |
| **Roadmap** | `POST`| `/api/user/roadmap/stage-test/:stageId/submit` | Học viên | Nộp bài test, tính EWMA, phân rã điểm |
| **Roadmap** | `POST`| `/api/user/roadmap/sync-course` | Học viên | Đồng bộ tiến độ từ khóa học đã mua |
| **Roadmap** | `GET` | `/api/user/roadmap/nodes/:nodeId/recommended-courses` | Học viên | **Đề xuất 4 khóa học chưa sở hữu theo Node** |
| **Roadmap** | `GET` | `/api/user/roadmap/history` | Học viên | Lịch sử nộp bài thi kiểm tra giai đoạn |
| **Flashcard** | `GET` | `/api/user/flashcards` | Học viên | Lấy danh sách bộ flashcard của người dùng |
| **Flashcard** | `POST`| `/api/user/flashcards` | Học viên | Tạo bộ flashcard mới |
| **Flashcard** | `POST`| `/api/user/flashcards/from-roadmap` | Học viên | **Tạo bộ flashcard ôn tập từ Node Roadmap** |
| **Flashcard** | `POST`| `/api/user/flashcards/:id/session` | Học viên | Bắt đầu học theo 3 mode (order, random, restart) |
| **Flashcard** | `GET` | `/api/user/flashcards/:id` | Học viên | Chi tiết bộ thẻ & lọc thẻ đang học |
| **Flashcard** | `PUT` | `/api/user/flashcards/:id` | Học viên | Sửa bộ thẻ, giữ trạng thái thẻ cũ, chặn dưới 5 thẻ Roadmap |
| **Flashcard** | `DELETE` | `/api/user/flashcards/:id` | Học viên | Xóa bộ thẻ; bảo vệ bộ thẻ đang ôn tập bắt buộc |
| **Flashcard** | `GET` | `/api/user/flashcards/:id/stats` | Học viên | Thống kê số lượng thẻ & tiến độ x/x |
| **Flashcard** | `PATCH`| `/api/user/flashcards/:id/cards/:cardId/status` | Học viên | Cập nhật trạng thái thẻ khi học (Đã học / Chưa nhớ / Cycle) |
| **Flashcard** | `POST`| `/api/user/flashcards/sync-roadmap/:nodeId` | Học viên | Đồng bộ kết quả Flashcard $\rightarrow$ Roadmap |
| **Payment** | `POST` | `/api/payment/retry/:orderId` | Học viên | Thử lại trên cùng đơn, bắt buộc key mới |
| **Payment** | `POST`| `/api/payment/create-session` | Học viên | **Khởi tạo thanh toán (TTL 15 phút, VietQR, VNPay, Stripe)** |
| **Payment** | `GET` | `/api/payment/status/:transactionId` | Học viên (đúng chủ sở hữu) | Kiểm tra trạng thái giao dịch & Countdown |
| **Payment** | `POST`| `/api/payment/webhook/sepay` | Webhook | Hứng biến động số dư VietQR tự động từ SePay |
| **Payment** | `GET` | `/api/payment/vnpay/callback` | Public | Return URL từ cổng VNPay |
| **Payment** | `GET` | `/api/payment/vnpay/ipn` | Webhook | Server IPN từ VNPay xác nhận giao dịch |
| **Payment** | `POST`| `/api/payment/webhook/stripe` | Webhook | Webhook thanh toán thẻ quốc tế Stripe |
| **Course** | `GET` | `/api/courses` (alias `/api/user/courses`) | Tuỳ chọn | Danh sách thẻ khóa học: lọc, sắp xếp, phân trang, chọn trường |
| **Course** | `GET` | `/api/courses/:id` (alias `/api/user/courses/:id`) | Tuỳ chọn | Thẻ chi tiết 1 khóa học theo `course_id`, `slug` hoặc `_id` |
| **Course** | `GET` | `/api/courses/:id/detail` (alias `/api/user/courses/:id/detail`) | Tuỳ chọn | **Chi tiết khóa học (Landing Page): Banner, FOMO, 3 cột Outcomes, Syllabus, Coupons** |
| **Course** | `GET` | `/api/courses/:id/preview` (alias `/api/user/courses/:id/preview`) | Tuỳ chọn | **Màn hình Học thử (Player): Cấu hình khóa, bài học thử kèm video, tài liệu Lead Magnet** |
| **Course** | `GET` | `/api/courses/:id/reviews` (alias `/api/user/courses/:id/reviews`) | Public | **Đánh giá khóa học: Sắp xếp (mới/cao/thấp), Lọc theo sao kèm số lượng, time-ago** |
| **Course** | `GET` | `/api/courses/:id/lessons/:lessonId/stream` | Tuỳ chọn | **Phân quyền phát video học thử (Chặn 403 nếu bài trả phí chưa mua)** |
| **Cart** | `GET` | `/api/user/cart` (alias `/api/cart`) | Tuỳ chọn | Lấy chi tiết giỏ hàng & tính tiền (Hỗ trợ User & Khách) |
| **Cart** | `POST`| `/api/user/cart/voucher/validate` | Tuỳ chọn | Kiểm tra tính hợp lệ & chiết khấu của mã voucher |
| **Cart** | `POST`| `/api/user/cart/merge` | Học viên | Đồng bộ giỏ hàng từ khách sang tài khoản sau đăng nhập |
| **Cart** | `POST`| `/api/user/cart` | Học viên | Thêm khóa học vào giỏ hàng (Chặn mua trùng lặp) |
| **Cart** | `DELETE`| `/api/user/cart` | Học viên | Xóa khóa học khỏi giỏ hàng người dùng |
| **Favorites** | `GET` | `/api/user/favorites` (alias `/api/favorites`) | Học viên | Danh sách khóa học yêu thích kèm bộ lọc, tìm kiếm, phân trang |
| **Favorites** | `GET` | `/api/user/favorites/ids` | Học viên | Lấy nhanh danh sách ID khóa học đã thích (gắn cờ Trái tim) |
| **Favorites** | `GET` | `/api/user/favorites/check/:courseId` | Tuỳ chọn | Kiểm tra 1 khóa học có nằm trong yêu thích không |
| **Favorites** | `POST`| `/api/user/favorites/sync` | Học viên | Đồng bộ danh sách yêu thích từ máy khách vào tài khoản |
| **Favorites** | `POST`| `/api/user/favorites/toggle` | Học viên | Bật / Tắt trạng thái yêu thích (Toggle favorite) |
| **Favorites** | `POST`| `/api/user/favorites` | Học viên | Thêm khóa học vào danh sách yêu thích |
| **Favorites** | `DELETE`| `/api/user/favorites/:courseId` | Học viên | Xóa khóa học khỏi yêu thích theo URL params |
| **Favorites** | `DELETE`| `/api/user/favorites` | Học viên | Xóa khóa học khỏi yêu thích qua request body hoặc clearAll |

### Danh mục Mã Lỗi HTTP Chuẩn:
* `400 Bad Request`: Thiếu dữ liệu, sai định dạng, hoặc vi phạm `ROADMAP_FLASHCARD_MIN_CARDS_VIOLATION`.
* `401 Unauthorized`: Chưa đăng nhập hoặc Token hết hạn khi truy cập tài nguyên bảo mật.
* `403 Forbidden`: `code: REQUIRE_ENROLLMENT` - Cố tình truy cập stream video của bài học trả phí khi chưa mua khóa học.
* `404 Not Found`: Không tìm thấy khóa học, bài học hoặc tài nguyên yêu cầu.
* `500 Internal Server Error`: Lỗi máy chủ hoặc mất kết nối cơ sở dữ liệu.

---

# G. TÀI LIỆU CHI TIẾT API KHÓA HỌC

File: `server/src/user/course/course.user.js` (router `createCourseRouter`, đã gắn trong `server.js`). **Endpoint thực tế đã triển khai.** Các route dùng chung 1 router, tất cả tiền tố sau trỏ đến cùng một hàm: `/api/courses`, `/api/user/courses`, `/api/v1/user/courses`.

**Xác thực (tùy chọn):** gửi `Authorization: Bearer <token>` để nhận các cờ cá nhân hóa (`is_in_wishlist`, `is_in_cart`, `is_purchased`, `progress_percentage`, `action_state`). Không gửi token vẫn gọi được (khách); khi đó dùng `guestCartIds` / `guestWishlistIds` nếu muốn đánh dấu giỏ/yêu thích từ LocalStorage. Chỉ trả khóa `status = published`.

## G.1. Danh sách thẻ khóa học (`GET /api/courses`)

**Query (tất cả tùy chọn):**

| Tham số | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `category_id` | string | Lọc theo danh mục |
| `tag_id` | string | Lọc theo kỹ năng (tag) |
| `level` | string | `beginner` / `intermediate` / `advanced` (`all` = không lọc) |
| `price_type` | string | `free` / `paid` / `all` |
| `min_rating` | number | Điểm đánh giá tối thiểu (vd `4`, `4.5`) |
| `search` hoặc `q` | string | Từ khóa trong tiêu đề khóa học |
| `sort` | string | `popular` (mặc định) / `highest_rated` / `newest` / `price_asc` / `price_desc` |
| `page` | number | Trang (mặc định 1) |
| `limit` | number \| `all` | Số thẻ/trang (mặc định 12, tối đa 100); `all` hoặc `0` = lấy tất cả |
| `fields` | string | Danh sách trường cần lấy, phân tách dấu phẩy (vd `title,price,thumbnail_url`) — giảm tải truy vấn phụ |
| `guestCartIds` | string | `course_id` trong giỏ tạm của khách, phân tách dấu phẩy |
| `guestWishlistIds` | string | `course_id` yêu thích tạm của khách, phân tách dấu phẩy |

**Response `200`:** `{ "success": true, "data": { "pagination": {...}, "courses": [ <thẻ> ] } }`

* `pagination`: `{ page, limit, total_items, total_pages, has_next, has_prev }`.
* Khi không có kết quả: `courses: []`.
* Lưu ý: `min_rating` và `price_type` được lọc sau khi phân trang nên `courses` có thể ít hơn `limit` và `total_items` phản ánh số khóa trước hai bộ lọc này.

## G.2. Thẻ khóa học chi tiết (`GET /api/courses/:id`)

* `:id` là `course_id`, `slug` hoặc `_id`. Query tùy chọn: `fields` (như trên).
* Response `200`: `{ "success": true, "data": <thẻ> }`.

## G.3. Cấu trúc thẻ khóa học (`CourseCard`)

| Nhóm | Trường |
| :--- | :--- |
| Định danh | `id`, `course_id`, `slug`, `title`, `thumbnail_url`, `status`, `badge` (ví dụ "Bán chạy" khi > 5000 học viên) |
| Nội dung | `level`, `duration_minutes`, `duration_formatted`, `language`, `is_free` |
| Giảng viên | `instructor { id, name, avatar_url, headline }` |
| Đánh giá | `rating`, `total_reviews`, `total_comments`, `total_students` |
| Kỹ năng | `tags [{ id, name }]`, `tag_names []` |
| Giá | `price { original, original_formatted, sale, sale_formatted, discount_amount, discount_formatted, discount_percent, is_free }` |
| Trạng thái học viên | `is_in_wishlist`, `is_in_cart`, `is_purchased`, `is_already_enrolled`, `progress_percentage` |
| Điều khiển nút | `action_state` (`ENROLL_NOW` / `START_FREE` / `IN_CART` / `CONTINUE_LEARNING`), `action_label` (chuỗi hiển thị) |

## G.4. Xử lý lỗi

* `404 Not Found` (G.2): `"Khóa học không tồn tại hoặc chưa được công khai."`.
* `400 Bad Request` (G.2): thiếu mã định danh khóa học.
* `500`: lỗi máy chủ/CSDL. Dạng lỗi chung của hệ thống: `{ "message": "..." }` (có thêm `code`, `field` khi có).

## G.5. Ví dụ tích hợp

```http
GET /api/courses?level=beginner&sort=highest_rated&page=1&limit=12&fields=course_id,title,thumbnail_url,price,rating
Authorization: Bearer <token>   (tùy chọn)
```

## G.6. Lưu ý & giới hạn

* `getCourseCards` còn nhận `filters.course_ids` (mảng `course_id`, giao với `tag_id` nếu dùng cùng lúc) — **chỉ dùng nội bộ** (gợi ý khóa học), router chưa đọc tham số này từ query.
* Router chưa phân biệt `limit` không hợp lệ (chuỗi bất kỳ sẽ ra `NaN` rồi dùng mặc định 12).
* Kết quả kiểm thử: xem mục `course.user.test.js` và TC-CID-01 trong `rcm_course.test.js`.

---

## G.7. Hướng dẫn Kỹ thuật Bộ lọc Trực tiếp phía Frontend (Client-side Multi-filter & URL Sync)

> [!NOTE]
> **Định hướng kiến trúc hiệu năng cao:**  
> Để giảm thiểu tối đa tải cho Backend (tránh nghẽn mạng và truy vấn DB liên tục khi người dùng tick chọn nhiều điều kiện), Frontend nên tải một lần toàn bộ danh sách khóa học hoặc từng khối trang qua API `GET /api/courses?limit=all` (hoặc `limit=100`), sau đó **thực hiện toàn bộ quá trình lọc, tìm kiếm và sắp xếp trực tiếp trong bộ nhớ (Client-side In-memory Filtering)**.

### 1. Cơ chế Debounce (300ms - 400ms)
* **Phạm vi áp dụng:** Ô nhập tìm kiếm từ khóa (`search input`) và thanh kéo thời lượng học (`range slider`).
* **Mục đích:** Tránh việc component kích hoạt vòng lặp filter liên tục khi người dùng đang gõ từng ký tự hoặc kéo rê thanh slider.
* **Cách thức:**
  * Khởi tạo Subject hoặc Timer đệm từ `300ms` đến `400ms`.
  * Chỉ khi người dùng ngưng tương tác trong khoảng thời gian trên thì hàm áp dụng bộ lọc mới thực thi.

### 2. Đồng bộ trạng thái Bộ lọc lên URL (URL Query Params Synchronization)
* Khi người dùng thay đổi bất kỳ tiêu chí nào (hoặc nhấn nút Reset), FE cập nhật đồng thời URL query params bằng `Router.navigate([], { queryParams: {...}, queryParamsHandling: 'merge' })` mà không tải lại trang.
* **Quy ước tham số URL:**
  * `category`: Mã danh mục/nghề (ví dụ: `frontend`, `backend`, `ai`,...).
  * `levels`: Chuỗi phân tách dấu phẩy các trình độ được tick (ví dụ: `beginner,intermediate`).
  * `min_rating`: Giá trị sao tối thiểu được chọn (ví dụ: `4.5`, `4.0`, `3.5`, `3.0`).
  * `max_duration`: Số giờ tối đa từ thanh kéo (ví dụ: `60`, `120`).
  * `price`: Loại giá (`all`, `paid`, `free`).
  * `q`: Từ khóa tìm kiếm chữ cái/chuỗi.
  * `tags`: Danh sách tag kỹ năng phân tách dấu phẩy (ví dụ: `reactjs,docker`).
  * `sort`: Thứ tự sắp xếp (`popular`, `highest_rated`, `newest`, `price_asc`, `price_desc`).
* Khi học viên tải lại trang (F5) hoặc truy cập bằng link chia sẻ, FE đọc lại URL params để khôi phục trạng thái bộ lọc và áp dụng ngay.

### 3. Logic Lọc Đa Yếu tố Kết hợp (Multi-filter Evaluation)
Tất cả các điều kiện lọc được kết hợp theo phép toán logic **AND** giữa các tiêu chí, và phép toán logic **OR** bên trong các tiêu chí chọn nhiều (như Trình độ, Tag):

```typescript
// Mẫu thuật toán lọc Client-side chuẩn mực cho Frontend
function applyClientFilters(courses: CourseCard[], filters: ActiveFilters): CourseCard[] {
  return courses.filter(course => {
    // 1. Lọc theo Danh mục nghề (Roadmap)
    if (filters.category && course.category_id !== filters.category) {
      return false;
    }

    // 2. Lọc theo Trình độ (Có thể chọn nhiều: Cơ bản, Trung cấp, Nâng cao)
    if (filters.levels && filters.levels.length > 0) {
      const courseLevel = (course.level || '').toLowerCase();
      const matchedLevel = filters.levels.some(lvl => courseLevel.includes(lvl.toLowerCase()));
      if (!matchedLevel) return false;
    }

    // 3. Lọc theo Đánh giá tối thiểu (Chỉ chọn 1: >= 4.5, >= 4.0, >= 3.5, >= 3.0)
    if (filters.minRating && Number(filters.minRating) > 0) {
      if ((course.rating || 0) < Number(filters.minRating)) return false;
    }

    // 4. Lọc theo Thời lượng học (Thanh kéo từ 0 đến 120+ giờ)
    if (filters.maxDurationHours && Number(filters.maxDurationHours) > 0) {
      const courseHours = (course.duration_minutes || 0) / 60;
      if (courseHours > Number(filters.maxDurationHours)) return false;
    }

    // 5. Lọc theo Giá (Tất cả, Trả phí, Miễn phí)
    if (filters.priceType === 'free' && !course.price?.is_free && course.price?.sale > 0) {
      return false;
    }
    if (filters.priceType === 'paid' && (course.price?.is_free || course.price?.sale === 0)) {
      return false;
    }

    // 6. Tìm kiếm theo chữ cái / từ khóa (khớp Tiêu đề, Giảng viên hoặc Chủ đề)
    if (filters.keyword && filters.keyword.trim()) {
      const kw = filters.keyword.trim().toLowerCase();
      const titleMatch = (course.title || '').toLowerCase().includes(kw);
      const instructorMatch = (course.instructor?.name || '').toLowerCase().includes(kw);
      const tagMatch = (course.tag_names || []).some(t => t.toLowerCase().includes(kw));
      if (!titleMatch && !instructorMatch && !tagMatch) return false;
    }

    // 7. Lọc theo Tag kỹ năng (Skills)
    if (filters.tags && filters.tags.length > 0) {
      const hasSkill = filters.tags.some(reqTag =>
        (course.tag_names || []).some(cTag => cTag.toLowerCase() === reqTag.toLowerCase())
      );
      if (!hasSkill) return false;
    }

    return true;
  });
}
```

### 4. Thuật toán Sắp xếp Mảng Kết quả (Sorting)
Sau khi lọc, mảng kết quả được sắp xếp theo tùy chọn của người dùng:
* `popular` (Phổ biến nhất): `b.total_students - a.total_students`.
* `highest_rated` (Đánh giá cao nhất): `b.rating - a.rating || b.total_reviews - a.total_reviews`.
* `newest` (Mới nhất): Theo ngày tạo hoặc ID giảm dần.
* `price_asc` (Giá tăng dần): `a.price.sale - b.price.sale`.
* `price_desc` (Giá giảm dần): `b.price.sale - a.price.sale`.

### 5. Hành vi Nút "Xóa bộ lọc" (Reset All)
* Đưa form lọc về cấu hình mặc định:
  * `category = null`
  * `levels = []`
  * `minRating = 0` (Tất cả)
  * `maxDurationHours = 120` (hoặc max range)
  * `priceType = 'all'`
  * `keyword = ''`
  * `tags = []`
  * `sort = 'popular'`
* Xóa query params trên URL về sạch sẽ (`/courses`).
* Danh sách hiển thị lại toàn bộ các thẻ khóa học gốc.

---

# H. TÀI LIỆU CHI TIẾT CHI TIẾT KHÓA HỌC & HỌC THỬ (COURSE DETAIL & PREVIEW PLAYER)

**File xử lý:** `server/src/user/course/course.user.js`  
**Router:** `createCourseRouter` (Gắn tại `/api/courses`, `/api/user/courses`, `/api/v1/user/courses`)  
**File test:** `server/src/user/course/test/course.user.test.js` (Bao phủ TC-DETAIL-01..03, TC-PREVIEW-01, TC-REV-01..05).

---

**Cập nhật hàm phát/preview:** `getLessonStream(courseId,lessonId,userId=null,options={})` và `hasCourseEnrollment(course,userId,options={})` phân giải course theo course_id/slug/_id, kiểm tra lesson thuộc đúng course và quyền trước khi đọc nguồn. Sai course/lesson trả 404; quyền hỗ trợ user_enrollments/user_courses và định danh user cũ.

Response giữ trường cũ, thêm `playback`; video_url là nguồn thực sự đã chọn. `lesson_videos.video_sources`/`caption_tracks` chỉ dùng URL có sẵn. Thiếu quality yêu cầu dùng nguồn gốc/đầu tiên với qualityFallback=true; thiếu captions thì effective.subtitles=false. auto không cam kết adaptive streaming. Guest dùng mặc định; metadata lỗi trả 503, thiếu video trả 404, thiếu quyền trả 403 REQUIRE_ENROLLMENT. Preview cũng áp dụng playback và không lộ link tài liệu riêng vượt quyền. Cấu hình học tập độc lập vẫn ở mục X của `api_user_3.md`.

## H.1. Chi tiết khóa học - Landing Page (`GET /:id/detail`)

* **Endpoint:** `GET /api/courses/:id/detail` (hoặc `/api/user/courses/:id/detail`)
* **Mục đích:** Cung cấp toàn bộ dữ liệu cho Course Landing Page chuẩn theo thiết kế Figma (Banner, Pricing FOMO, 3 cột mục tiêu, Đề cương Accordion bảo mật, Hồ sơ giảng viên, Chứng chỉ mẫu).
* **Tham số URL (`:id`):** Nhận `course_id`, `slug` hoặc `_id`.
* **Xác thực:** Tùy chọn (`Bearer <token>`). Nếu có token, trả về cờ tương tác `user_state` (`is_in_wishlist`, `is_in_cart`, `is_purchased`).
* **Mã trạng thái:**
  * `200 OK`: Trả về dữ liệu chi tiết đầy đủ.
  * `404 Not Found`: Khóa học không tồn tại hoặc chưa công khai (`status !== 'published'`).

### Cấu trúc phản hồi dữ liệu (`data`):

```json
{
  "success": true,
  "data": {
    "course_id": "1",
    "id": "6ab53f62568441ba74472ae5",
    "title": "ReactJS Masterclass: Từ Zero Tới Production",
    "slug": "reactjs-masterclass",
    "short_description": "Khóa học giúp bạn nắm vững ReactJS từ cơ bản đến nâng cao thông qua dự án thực tế...",
    "thumbnail_url": "https://res.cloudinary.com/.../course_data_science.jpg",
    "preview_video_url": "https://res.cloudinary.com/.../Demo_Thinkup.mp4",
    "badge": "HOT",
    "level": "beginner",
    "language": "Tiếng Việt",
    "updated_at": "2026-07-14T17:21:36.000Z",
    "rating": 4.8,
    "total_reviews": 104,
    "total_students": 12345,
    "total_duration_minutes": 870,
    "total_duration_formatted": "14 giờ 30 phút",
    "total_sections_count": 3,
    "total_lessons_count": 14,
    "category": {
      "category_id": "1",
      "name": "Frontend Developer",
      "slug": "frontend"
    },
    "tags": [
      { "tag_id": "3", "name": "JavaScript" },
      { "tag_id": "4", "name": "ReactJS" },
      { "tag_id": "8", "name": "TypeScript" }
    ],
    "levels": ["Trung cấp", "Nâng cao"],
    "pricing": {
      "price": 699000,
      "price_formatted": "699.000đ",
      "original_price": 1200000,
      "original_price_formatted": "1.200.000đ",
      "is_free": false,
      "discount_amount": 501000,
      "discount_percent": 42,
      "has_discount": true,
      "sale_ends_at": "2026-07-12 10:00:00",
      "coupons": [
        {
          "code": "REACT20",
          "discount_type": "percent",
          "discount_value": 20,
          "expires_at": "2026-08-30 14:36:30",
          "max_discount": 150000
        }
      ]
    },
    "purchase_highlights": [
      { "icon": "infinity", "label": "Truy cập trọn đời" },
      { "icon": "certificate", "label": "Chứng chỉ hoàn thành" },
      { "icon": "shield-check", "label": "Thanh toán bảo mật" }
    ],
    "course_outcomes": [
      {
        "title": "Mục tiêu khóa học",
        "items": [
          "Nắm vững kiến thức từ cơ bản đến nâng cao của ReactJS",
          "Xây dựng được ứng dụng React hoàn chỉnh và tối ưu",
          "Tự tin làm việc với các dự án thực tế"
        ]
      },
      {
        "title": "Kiến thức đạt được",
        "items": [
          "Hiểu rõ về React, JSX, Components, Props, State",
          "Quản lý state với useState, useReducer, Context API",
          "Tối ưu hiệu năng ứng dụng React"
        ]
      },
      {
        "title": "Kỹ năng yêu cầu",
        "items": [
          "HTML, CSS, JavaScript cơ bản",
          "Làm quen với dòng lệnh lệnh (CLI)",
          "Có máy tính và kết nối Internet"
        ]
      }
    ],
    "sections": [
      {
        "section_id": "1",
        "title": "Giới thiệu về ReactJS",
        "description": "Tổng quan về React và hệ sinh thái",
        "order_index": 1,
        "lessons_count": 5,
        "duration_minutes": 75,
        "duration_formatted": "1 giờ 15 phút",
        "is_chapter_locked": false,
        "lessons": [
          {
            "lesson_id": "1",
            "title": "ReactJS là gì? Tại sao nên học React?",
            "lesson_type": "video",
            "duration_minutes": 25,
            "duration_formatted": "25 phút",
            "order_index": 1,
            "is_free_preview": true,
            "is_locked": false,
            "can_preview_now": true
          },
          {
            "lesson_id": "2",
            "title": "Cài đặt môi trường phát triển",
            "lesson_type": "article",
            "duration_minutes": 10,
            "duration_formatted": "10 phút",
            "order_index": 2,
            "is_free_preview": false,
            "is_locked": true,
            "can_preview_now": false
          }
        ]
      },
      {
        "section_id": "2",
        "title": "React Hooks & State Management",
        "order_index": 2,
        "lessons_count": 5,
        "duration_minutes": 155,
        "duration_formatted": "2 giờ 35 phút",
        "is_chapter_locked": true,
        "lessons": [ ... ]
      }
    ],
    "instructor": {
      "instructor_id": "1",
      "full_name": "Nguyễn Văn An",
      "avatar_url": "https://res.cloudinary.com/.../instructor-1.jpg",
      "title": "Senior Frontend Developer tại ThinkUp",
      "rating": 4.9,
      "total_reviews": 2100,
      "total_students": 238529,
      "total_courses": 9,
      "positive_rating": 85,
      "bio": "Hơn 7 năm kinh nghiệm trong lĩnh vực phát triển web với React, TypeScript...",
      "profile_url": "/instructor/1"
    },
    "certificate_sample": {
      "title": "Chứng chỉ hoàn thành khóa học ReactJS Masterclass",
      "watermark_text": "MẪU - THINKUP VERIFIED",
      "verify_url": "thinkup.vn/verify",
      "template_image_url": "https://res.cloudinary.com/.../certificate_sample.jpg"
    },
    "reviews_summary": {
      "average_rating": 4.8,
      "total_reviews": 104,
      "breakdown": { "1": 2, "2": 2, "3": 3, "4": 25, "5": 72 }
    },
    "user_state": {
      "is_authenticated": true,
      "is_in_wishlist": false,
      "is_in_cart": false,
      "is_purchased": false
    },
    "breadcrumbs": [
      { "label": "Trang chủ", "url": "/" },
      { "label": "Lộ trình", "url": "/roadmaps" },
      { "label": "Frontend", "url": "/roadmaps/frontend" },
      { "label": "ReactJS Masterclass", "url": "/courses/reactjs-masterclass", "active": true }
    ]
  }
}
```

---

## H.2. Màn hình học thử - Free Trial Player (`GET /:id/preview`)

* **Endpoint:** `GET /api/courses/:id/preview` (hoặc `/api/user/courses/:id/preview`)
* **Mục đích:** Cung cấp môi trường trải nghiệm thực tế (Product-Led Growth). Chỉ mở nội dung video bài học thử của Chương 1, khóa chức năng đánh dấu hoàn thành & Tab Hỏi đáp.
* **Tham số URL (`:id`):** Nhận `course_id`, `slug` hoặc `_id`.
* **Xác thực:** Tùy chọn (Guest hoặc User chưa mua).
* **Mã trạng thái:** `200 OK`, `404 Not Found`.

### Cấu trúc phản hồi dữ liệu (`data`):

```json
{
  "success": true,
  "data": {
    "course": {
      "course_id": "1",
      "title": "ReactJS Masterclass: Từ Zero Tới Production",
      "thumbnail_url": "https://res.cloudinary.com/.../course.jpg",
      "price": 699000,
      "price_formatted": "699.000đ",
      "cta_text": "Mua khóa học - 699.000đ"
    },
    "player_config": {
      "allow_mark_completed": false,
      "allow_notes": false,
      "allow_qa": false,
      "qa_lock_message": "Tính năng Hỏi đáp và Thảo luận là đặc quyền của học viên chính thức.",
      "upsell_popup": {
        "title": "Nâng cấp để mở khóa toàn bộ",
        "message": "Bài học tiếp theo thuộc nội dung trả phí. Hãy nâng cấp khóa học để mở khóa toàn bộ lộ trình và làm bài tập thực hành nhé!",
        "cta_label": "Mua khóa học - 699.000đ"
      }
    },
    "syllabus": [
      {
        "section_id": "1",
        "title": "Giới thiệu về ReactJS",
        "order_index": 1,
        "is_locked": false,
        "lessons": [
          {
            "lesson_id": "1",
            "title": "ReactJS là gì? Tại sao nên học React?",
            "lesson_type": "video",
            "duration_minutes": 25,
            "is_free_preview": true,
            "is_locked": false,
            "status_icon": "circle",
            "video_url": "https://res.cloudinary.com/.../Demo_Thinkup.mp4"
          },
          {
            "lesson_id": "2",
            "title": "Cài đặt môi trường phát triển",
            "lesson_type": "article",
            "duration_minutes": 10,
            "is_free_preview": false,
            "is_locked": true,
            "status_icon": "circle"
          }
        ]
      },
      {
        "section_id": "2",
        "title": "React Hooks & State Management",
        "order_index": 2,
        "is_locked": true,
        "lessons": [ ... ]
      }
    ],
    "preview_lessons": [
      {
        "lesson_id": "1",
        "title": "ReactJS là gì? Tại sao nên học React?",
        "lesson_type": "video",
        "duration_minutes": 25,
        "is_free_preview": true,
        "video_url": "https://res.cloudinary.com/.../Demo_Thinkup.mp4"
      }
    ],
    "initial_lesson": {
      "lesson_id": "1",
      "title": "ReactJS là gì? Tại sao nên học React?",
      "video_url": "https://res.cloudinary.com/.../Demo_Thinkup.mp4"
    },
    "resources": [
      {
        "id": "doc_course_1",
        "name": "Giao_trinh_ReactJS_Masterclass_ThinkUp.pdf",
        "lesson_name": "ReactJS là gì? Tại sao nên học React?",
        "category_label": "Tài liệu bài giảng học thử",
        "size": "2.4 MB",
        "download_url": "https://res.cloudinary.com/.../nnwal2xivstkl0qayqey.docx"
      }
    ]
  }
}
```

---

## H.3. Đánh giá học viên kèm sắp xếp & lọc theo sao (`GET /:id/reviews`)

* **Endpoint:** `GET /api/courses/:id/reviews` (hoặc `/api/user/courses/:id/reviews`)
* **Mục đích:** Tải danh sách đánh giá của học viên theo cơ chế AJAX mượt mà (không tải lại toàn bộ trang), hỗ trợ chọn lọc sao và sắp xếp đa chiều. Tích hợp nút **"Hữu ích"** (Helpful Vote), hiển thị `avatar_url` của học viên và cờ `is_owner` để FE tách riêng khối **"Đánh giá CỦA BẠN"**.
* **Quyền:** Tùy chọn xác thực (`optionalAuth`). Nếu có `Bearer Token`, tự động nhận diện và trả thêm cờ `is_owner: true` (nếu là đánh giá của chính người dùng) và `is_helpful_voted: true` (nếu người dùng đã bấm hữu ích).
* **Query Parameters:**

| Tham số | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `sort` | string | `newest` | `newest` (Mới nhất) \| `highest` (Đánh giá cao nhất: 5 sao $\rightarrow$ 1 sao) \| `lowest` (Đánh giá thấp nhất: 1 sao $\rightarrow$ 5 sao) |
| `rating` | number \| string | `all` | Lọc theo số sao cụ thể (`5`, `4`, `3`, `2`, `1`), `under_2` (Lọc đánh giá tiêu cực 1 sao và 2 sao) hoặc `all` |
| `page` | number | `1` | Trang hiện tại (1-indexed) |
| `limit` | number | `10` | Số lượng đánh giá mỗi trang (tối đa 50) |

### Cấu trúc phản hồi dữ liệu (`data`):

```json
{
  "success": true,
  "data": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total_items": 72,
      "total_pages": 8,
      "has_next": true,
      "has_prev": false
    },
    "rating_summary": {
      "average": 4.8,
      "total_reviews": 1234,
      "total_reviews_formatted": "1.234 đánh giá",
      "percentage_breakdown": {
        "5": 85,
        "4": 10,
        "3": 3,
        "2": 1,
        "1": 1
      }
    },
    "filter_summary": {
      "total_reviews": 1234,
      "breakdown": { "1": 12, "2": 12, "3": 37, "4": 123, "5": 1050 },
      "filter_options": [
        { "label": "Tất cả (1.2k)", "value": "all", "count": 1234 },
        { "label": "5 sao (1050)", "value": 5, "count": 1050 },
        { "label": "4 sao (123)", "value": 4, "count": 123 },
        { "label": "3 sao (37)", "value": 3, "count": 37 },
        { "label": "2 sao (12)", "value": 2, "count": 12 },
        { "label": "1 sao (12)", "value": 1, "count": 12 },
        { "label": "Dưới 2 sao (24)", "value": "under_2", "count": 24 }
      ]
    },
    "sort_options": [
      { "label": "Mới nhất", "value": "newest", "active": true },
      { "label": "Đánh giá cao nhất", "value": "highest", "active": false },
      { "label": "Đánh giá thấp nhất", "value": "lowest", "active": false }
    ],
    "reviews": [
      {
        "review_id": "1010",
        "user_id": "user_001",
        "reviewer_name": "Bạn",
        "avatar_url": "https://img.thinkup.vn/avatar_01.jpg",
        "rating": 5,
        "content": "Khóa học rất hay, dùng thử mình đang tìm kiếm! Giao diện Lab xịn.",
        "created_at": "2026-10-27T09:00:00.000Z",
        "created_at_relative": "Vừa xong",
        "is_verified_purchase": true,
        "is_owner": true,
        "is_edited": false,
        "helpful_count": 0,
        "is_helpful_voted": false,
        "media": [
          {
            "url": "https://res.cloudinary.com/thinkup/image/upload/review_proof.png",
            "name": "chung_chi_hoan_thanh.png",
            "type": "image",
            "thumbnail_url": "https://res.cloudinary.com/thinkup/image/upload/review_proof.png"
          }
        ],
        "attachment": {
          "url": "https://res.cloudinary.com/thinkup/image/upload/review_proof.png",
          "name": "chung_chi_hoan_thanh.png",
          "type": "image"
        }
      }
    ]
  }
}
```

### Mô tả chi tiết các trường mới bổ sung:

| Trường | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `rating_summary.average` | `number` | Điểm đánh giá trung bình (vd: `4.8`) |
| `rating_summary.total_reviews_formatted` | `string` | Tổng lượt đánh giá đã format (vd: `"1.234 đánh giá"`) |
| `rating_summary.percentage_breakdown` | `object` | Tỷ lệ % phân bố từng mức sao (vd: `{ "5": 85, "4": 10, ... }`) |
| `reviews[].avatar_url` | `string` | URL avatar tác giả (hiển thị ảnh đại diện bên cạnh tên) |
| `reviews[].is_owner` | `boolean` | `true` nếu đánh giá này thuộc về user hiện tại → FE tách riêng khối **"ĐÁNH GIÁ CỦA BẠN"** với nút **"Chỉnh sửa"** |
| `reviews[].is_edited` | `boolean` | `true` nếu đánh giá đã được chỉnh sửa sau khi đăng |
| `reviews[].helpful_count` | `number` | Tổng số lượt bấm "Hữu ích" (vd: `24`) |
| `reviews[].is_helpful_voted` | `boolean` | `true` nếu user hiện tại đã bấm "Hữu ích" cho đánh giá này |
| `reviews[].media` | `Array` | Danh sách tệp đính kèm (hình ảnh, video, tài liệu) để FE hiển thị xem trực tiếp |
| `reviews[].attachment` | `object \| null` | Tệp đính kèm đầu tiên phục vụ hiển thị nhanh thumbnail |

---

## H.3.1. Lấy thông tin đánh giá cá nhân (`GET /api/user/courses/:id/my-review`)

* **Endpoint:** `GET /api/user/courses/:id/my-review`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Lấy thông tin bài đánh giá của chính người dùng hiện tại để pre-fill vào Modal Chỉnh sửa Đánh giá.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "review_id": "rev_17290000_abc",
    "course_id": "1",
    "user_id": "user_001",
    "rating": 5,
    "content": "Khóa học rất hay!",
    "tags": ["Nội dung dễ hiểu", "Thực hành nhiều"],
    "nps_score": 10,
    "media": [
      {
        "url": "https://cdn.thinkup.vn/cert.png",
        "name": "cert.png",
        "type": "image"
      }
    ],
    "is_edited": false,
    "created_at": "2026-10-28T01:00:00.000Z",
    "updated_at": "2026-10-28T01:00:00.000Z"
  }
}
```

---

## H.3.2. Tạo mới hoặc Chỉnh sửa Đánh giá khóa học (`POST /api/user/courses/:id/reviews`)

* **Endpoint:** `POST /api/user/courses/:id/reviews`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Gửi bài đánh giá mới hoặc cập nhật bài đánh giá đã có (Cơ chế Upsert).
* **Body Request:**
```json
{
  "rating": 5,
  "content": "Khóa học tuyệt vời, thực hành trực quan và hỗ trợ nhiệt tình!",
  "tags": ["Nội dung dễ hiểu", "Giảng viên nhiệt tình"],
  "nps_score": 10,
  "media": [
    {
      "url": "https://res.cloudinary.com/thinkup/image/upload/screenshot.png",
      "name": "screenshot.png",
      "type": "image"
    }
  ]
}
```
* **Phản hồi thành công (`200 OK` hoặc `201 Created`):**
```json
{
  "success": true,
  "message": "Gửi đánh giá thành công!",
  "data": {
    "review_id": "rev_17290000_abc",
    "course_id": "1",
    "user_id": "user_001",
    "rating": 5,
    "content": "Khóa học tuyệt vời, thực hành trực quan và hỗ trợ nhiệt tình!",
    "tags": ["Nội dung dễ hiểu", "Giảng viên nhiệt tình"],
    "nps_score": 10,
    "media": [...],
    "is_edited": false
  }
}
```

---

## H.4. Phân quyền phát video học thử (`GET /:id/lessons/:lessonId/stream`)

* **Endpoint:** `GET /api/courses/:id/lessons/:lessonId/stream`
* **Mục đích:** Bảo vệ nội dung đa phương tiện, kiểm tra phân quyền chặt chẽ trước khi cấp link phát video.
* **Quy tắc phân quyền:**
  1. Nếu bài học có `is_free = '1'` hoặc `is_preview: true` $\rightarrow$ Cho phép xem (Public/Guest).
  2. Nếu bài học trả phí (`is_free = '0'`): Bắt buộc kiểm tra JWT Token và xác thực trong `user_enrollments` hoặc `user_courses`. Nếu chưa mua $\rightarrow$ **Trả về mã lỗi `403 Forbidden` (`REQUIRE_ENROLLMENT`)**.
* **Response thành công (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "lesson_id": "1",
      "video_url": "https://res.cloudinary.com/x7v2ofnh/video/upload/v1783877512/thinkup_courses_videos/Demo_Thinkup_krnnlm.mp4",
      "duration": "25",
      "provider": "cloudinary",
      "is_free_preview": true
    }
  }
  ```
* **Response bị từ chối (`403 Forbidden`):**
  ```json
  {
    "success": false,
    "code": "REQUIRE_ENROLLMENT",
    "message": "Bạn cần đăng ký hoặc mua khóa học để xem nội dung bài học này."
  }
  ```


---

# I. TÀI LIỆU CHI TIẾT API GIỎ HÀNG (SHOPPING CART)

File nguồn: `server/src/user/cart/cart.user.js` (router `createCartRouter`, đã gắn trong `server.js`).  
Tiền tố Endpoint: `/api/user/cart` (hỗ trợ alias: `/api/cart`, `/api/v1/user/cart`).  
Hỗ trợ cơ chế giỏ hàng kép: vừa phục vụ **Khách vãng lai (Guest)** lưu trữ tạm trên LocalStorage, vừa hỗ trợ **Học viên đã đăng nhập (Logged-in User)** lưu trữ persistent trong MongoDB collection `user_cart_items`.

---

**Cập nhật giỏ hàng:** `addToCartLogic`/`removeFromCartLogic` ghép hai nhóm điều kiện bằng `$and`: `(user_id=userId OR userId=userId) AND (course_id=courseId OR courseId=courseId)`. Không nhận diện/xóa giỏ user khác; hợp đồng API giữ nguyên.

## I.1. Lấy thông tin & Tính toán chi tiết giỏ hàng (`GET /api/user/cart`)

* **Endpoint:** `GET /api/user/cart` (hoặc `GET /api/cart`)
* **Quyền:** Tuỳ chọn (Hỗ trợ cả Guest và Bearer Token).
* **Mục đích:** Truy xuất toàn bộ khóa học trong giỏ hàng, tự động làm giàu thông tin giảng viên, rating, thời lượng, tính toán subtotal, giảm giá voucher, tổng thanh toán và kiểm tra cờ sở hữu/khóa học đã mua.
* **Query Parameters:**

| Tham số | Kiểu | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `guestCourseIds` | string | Không | Danh sách ID khóa học trong LocalStorage của khách vãng lai (phân tách bởi dấu phẩy `,`, ví dụ: `1,2,5`). Bỏ qua nếu có Token. |
| `selectedIds` | string | Không | Lọc danh sách các khóa học được tích chọn checkbox để tính tổng tiền (mặc định tính toàn bộ nếu không truyền). |
| `voucherCode` | string | Không | Mã giảm giá người dùng đang nhập thử để xem trước chiết khấu (ví dụ: `THINKUP10`). |

### Phản hồi thành công (`200 OK`):
```json
{
  "success": true,
  "data": {
    "is_guest": false,
    "user_id": "673f4e198a2b123456789abc",
    "items_count": 1,
    "items": [
      {
        "course_id": "1",
        "title": "Lập trình Web Fullstack Hiện Đại với React và Node.js",
        "slug": "lap-trinh-web-fullstack-react-nodejs",
        "thumbnail": "https://res.cloudinary.com/thinkup/image/upload/course1.jpg",
        "instructor": {
          "id": "ins_1",
          "name": "Nguyễn Văn A",
          "avatar": "https://res.cloudinary.com/thinkup/image/upload/avatar1.jpg"
        },
        "price": {
          "original": 1200000,
          "sale": 799000,
          "original_formatted": "1.200.000đ",
          "sale_formatted": "799.000đ",
          "discount_percent": 33
        },
        "rating": 4.8,
        "total_reviews": 128,
        "level": "Mọi cấp độ",
        "duration_formatted": "42 giờ",
        "total_lessons": 85,
        "is_owned": false,
        "is_in_wishlist": true,
        "added_at": "2026-10-25T14:30:00.000Z"
      }
    ],
    "pricing_summary": {
      "subtotal": 799000,
      "subtotal_formatted": "799.000đ",
      "discount_amount": 79900,
      "discount_amount_formatted": "79.900đ",
      "total_amount": 719100,
      "total_amount_formatted": "719.100đ",
      "currency": "VND"
    },
    "voucher_applied": {
      "code": "THINKUP10",
      "is_valid": true,
      "discount_amount": 79900,
      "message": "Áp dụng mã giảm giá 10% thành công!"
    }
  }
}
```

---

## I.2. Kiểm tra mã giảm giá Voucher (`POST /api/user/cart/voucher/validate`)

* **Endpoint:** `POST /api/user/cart/voucher/validate`
* **Quyền:** Tuỳ chọn (Guest hoặc Học viên).
* **Mục đích:** Kiểm tra tính hợp lệ của mã Voucher, tính toán chiết khấu phần trăm hoặc số tiền cố định, kiểm tra hạn dùng, giới hạn lượt dùng và chặn chiết khấu âm.
* **Body Request:**
```json
{
  "code": "THINKUP10",
  "eligibleSubtotal": 799000
}
```
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "code": "THINKUP10",
    "discount": 79900,
    "message": "Áp dụng mã giảm giá 10% thành công!"
  }
}
```
* **Phản hồi voucher không hợp lệ (`200 OK` với `isValid: false`):**
```json
{
  "success": false,
  "data": {
    "isValid": false,
    "code": "INVALID_CODE",
    "discount": 0,
    "message": "Mã giảm giá không hợp lệ hoặc không tồn tại"
  }
}
```

---

## I.3. Đồng bộ giỏ hàng từ khách sang tài khoản (`POST /api/user/cart/merge`)

* **Endpoint:** `POST /api/user/cart/merge`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Khi người dùng bấm mua dưới quyền Khách vãng lai rồi thực hiện Đăng nhập / Đăng ký, Frontend gọi API này để gộp toàn bộ danh sách `guestCourseIds` từ LocalStorage vào MongoDB giỏ hàng của tài khoản. Tự động loại trừ các khóa học đã sở hữu và chống ghi đè trùng lặp.
* **Body Request:**
```json
{
  "guestCourseIds": ["1", "3", "5"]
}
```
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "message": "Đồng bộ giỏ hàng khách vãng lai thành công",
  "data": {
    "merged_count": 3,
    "cart": {
      "items_count": 3,
      "items": [ /* Danh sách chi tiết sau khi gộp */ ]
    }
  }
}
```

---

## I.4. Thêm khóa học vào giỏ hàng (`POST /api/user/cart`)

* **Endpoint:** `POST /api/user/cart`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Thêm 1 khóa học mới vào giỏ hàng của học viên.
* **Quy tắc kiểm tra:**
  - Nếu học viên đã sở hữu khóa học $ightarrow$ Báo lỗi `400 Bad Request` (`ALREADY_OWNED`).
  - Nếu khóa học đã có trong giỏ hàng $ightarrow$ Giữ nguyên tính Idempotency, không tạo trùng lặp.
* **Body Request:**
```json
{
  "courseId": "1"
}
```
* **Phản hồi thành công (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "items_count": 1,
    "items": [ /* Cart details */ ]
  }
}
```

---

## I.5. Xóa khóa học khỏi giỏ hàng (`DELETE /api/user/cart`)

* **Endpoint:** `DELETE /api/user/cart`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Body Request:**
```json
{
  "courseId": "1"
}
```
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "items_count": 0,
    "items": []
  }
}
```

---

# J. TÀI LIỆU CHI TIẾT API KHÓA HỌC YÊU THÍCH (FAVORITES / WISHLIST)

File nguồn: `server/src/user/favorites/favorites.user.js` (router `createFavoritesRouter`, đã gắn trong `server.js`).  
Tiền tố Endpoint: `/api/user/favorites` (hỗ trợ alias: `/api/favorites`, `/api/v1/user/favorites`).  
Lưu trữ danh sách khóa học học viên quan tâm, lưu lại để học sau hoặc theo dõi ưu đãi giảm giá trong MongoDB collection `user_favorite_courses`.

---

**Cập nhật yêu thích:** `checkFavoriteStatus`, `addFavoriteCourse`, `removeFavoriteCourse`, `toggleFavoriteCourse` ghép user/course bằng `$and`, hỗ trợ tên trường cũ. `syncFavoritesLogic` chỉ nhận ID khớp course_id hoặc _id của course tồn tại; catalog rỗng không đồng nghĩa chấp nhận mọi ID. API giữ nguyên.

## J.1. Lấy danh sách khóa học yêu thích kèm bộ lọc & phân trang (`GET /api/user/favorites`)

* **Endpoint:** `GET /api/user/favorites` (alias `GET /api/favorites`)
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Tải toàn bộ thẻ khóa học yêu thích với đầy đủ thông tin chuẩn `CourseCard`, hỗ trợ tìm kiếm từ khóa, lọc theo danh mục, cấp độ và sắp xếp đa tiêu chí.
* **Query Parameters:**

| Tham số | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :---: | :--- |
| `sort` | string | `newest` | `newest` (Mới thích) | `oldest` | `price_asc` (Giá tăng dần) | `price_desc` (Giá giảm dần) | `highest_rated` (Đánh giá sao) | `popular` (Học viên đông nhất) | `title_asc` (Tên A-Z) | `title_desc` (Tên Z-A) |
| `page` | number | `1` | Trang hiển thị hiện tại |
| `limit` | number | `12` | Số lượng khóa học mỗi trang (tối đa 50) |
| `search` | string | `` | Tìm kiếm theo tiêu đề hoặc tên tác giả |
| `category_id` | string | `` | Lọc theo mã danh mục nghề nghiệp |
| `level` | string | `` | Lọc theo trình độ (`Cơ bản`, `Trung cấp`, `Nâng cao`) |

### Phản hồi thành công (`200 OK`):
```json
{
  "success": true,
  "data": {
    "pagination": {
      "page": 1,
      "limit": 12,
      "total_items": 5,
      "total_pages": 1,
      "has_next": false,
      "has_prev": false
    },
    "filter_summary": {
      "sort": "newest",
      "available_sort_options": ["newest", "oldest", "price_asc", "price_desc", "highest_rated", "popular", "title_asc", "title_desc"],
      "total_favorites": 5
    },
    "courses": [
      {
        "course_id": "1",
        "title": "Lập trình Web Fullstack Hiện Đại với React và Node.js",
        "slug": "lap-trinh-web-fullstack-react-nodejs",
        "thumbnail": "https://res.cloudinary.com/thinkup/image/upload/course1.jpg",
        "rating": 4.8,
        "total_reviews": 128,
        "total_students": 1540,
        "price": {
          "sale": 799000,
          "original": 1200000,
          "sale_formatted": "799.000đ",
          "original_formatted": "1.200.000đ"
        },
        "is_in_wishlist": true,
        "is_in_cart": false,
        "is_purchased": false,
        "favorited_at": "2026-10-26T10:00:00.000Z"
      }
    ]
  }
}
```

---

## J.2. Lấy nhanh danh sách ID khóa học đã thích (`GET /api/user/favorites/ids`)

* **Endpoint:** `GET /api/user/favorites/ids`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Cung cấp mảng `course_ids` dung lượng siêu nhẹ để Frontend đánh dấu trạng thái Trái tim màu đỏ (Active Heart Icon) ngay lập tức trên trang chủ hoặc trang tìm kiếm mà không cần gọi API nặng.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "course_ids": ["1", "3", "7", "12"],
    "total": 4
  }
}
```

---

## J.3. Kiểm tra trạng thái yêu thích của 1 khóa học (`GET /api/user/favorites/check/:courseId`)

* **Endpoint:** `GET /api/user/favorites/check/:courseId`
* **Quyền:** Tuỳ chọn (Nếu chưa đăng nhập mặc định trả về `is_favorite: false`).
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "course_id": "1",
    "is_favorite": true
  }
}
```

---

## J.4. Chuyển đổi trạng thái Yêu thích Toggle (`POST /api/user/favorites/toggle`)

* **Endpoint:** `POST /api/user/favorites/toggle`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Nút bấm Trái tim 1 chạm: Nếu chưa có trong yêu thích thì tự động thêm; nếu đã có thì tự động gỡ bỏ.
* **Body Request:**
```json
{
  "course_id": "1"
}
```
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "course_id": "1",
    "is_favorite": true,
    "action": "added",
    "message": "Đã thêm khóa học vào danh sách yêu thích"
  }
}
```

---

## J.5. Thêm khóa học vào danh sách yêu thích (`POST /api/user/favorites`)

* **Endpoint:** `POST /api/user/favorites`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Body Request:**
```json
{
  "course_id": "1"
}
```
* **Phản hồi thành công (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "course_id": "1",
    "is_favorite": true,
    "created_at": "2026-10-27T14:30:00.000Z",
    "message": "Thêm khóa học vào danh sách yêu thích thành công"
  }
}
```

---

## J.6. Đồng bộ danh sách yêu thích từ máy khách (`POST /api/user/favorites/sync`)

* **Endpoint:** `POST /api/user/favorites/sync`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Đồng bộ các ID khóa học người dùng đã thích khi chưa đăng nhập (`guestWishlistIds`) vào CSDL sau khi đăng nhập thành công.
* **Body Request:**
```json
{
  "guestWishlistIds": ["1", "4", "9"]
}
```
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "message": "Đồng bộ danh sách yêu thích thành công (đã thêm 3 mục mới).",
  "data": {
    "added_count": 3,
    "total_favorites": 5,
    "course_ids": ["1", "2", "3", "4", "9"]
  }
}
```

---

## J.7. Xóa khóa học khỏi yêu thích (`DELETE /api/user/favorites/:courseId`)

* **Endpoint:** `DELETE /api/user/favorites/:courseId` (hoặc `DELETE /api/user/favorites` kèm body `{ course_id: "1" }`)
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Hỗ trợ xóa toàn bộ:** Truyền body `{ clearAll: true }` để dọn sạch toàn bộ wishlist của người dùng.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "course_id": "1",
    "is_favorite": false,
    "message": "Đã gỡ khóa học khỏi danh sách yêu thích"
  }
}
```

---

# K. TÀI LIỆU KỸ THUẬT API MODULE BÀI HỌC & MÀN HÌNH HỌC TẬP (CURRICULUM & STUDY)

Tệp mã nguồn: `server/src/user/lesson/lesson.user.js`  
Tệp kiểm thử: `server/src/user/lesson/test/lesson.user.test.js`

## K.1. Truy xuất toàn bộ dữ liệu màn hình học tập (`GET /api/user/lessons/study/:courseId`)

* **Endpoint:** `GET /api/user/lessons/study/:courseId` (Hỗ trợ alias: `GET /api/lessons/study/:courseId`)
* **Quyền:** Tùy chọn (Nếu gửi `Bearer Token`, hệ thống cá nhân hóa tiến độ học, thời gian học, bài đang học dở và chứng chỉ).
* **Mục đích:** Cung cấp toàn bộ 5 khối dữ liệu cho màn hình học tập của khóa học:
  1. **Khối thông tin khóa học & Giảng viên**: Tiêu đề, mô tả tóm tắt, video giới thiệu, rating trung bình, tổng lượt đánh giá, tổng học viên (dành cho khóa học), thông tin giảng viên. (Loại bỏ breadcrumb).
  2. **Khối Tabs điều hướng**: `curriculum`, `overview`, `resources`, `qna`, `discussions`.
  3. **Khối Nội dung khóa học (Curriculum)**: Cấu trúc chương & bài học (loại bỏ hoàn toàn trạng thái locked; hỗ trợ 4 loại bài: `video`, `article` - tính thời gian tự động theo số lượng từ, `lab`, `quiz` - đếm số câu hỏi).
  4. **Khối Sidebar - Tiến độ học tập**: Phần trăm hoàn thành, số bài đã học / tổng số bài, số bài còn lại, tổng thời gian học tích lũy.
  5. **Khối Sidebar - Hành động (Actions)**: Nút tiếp tục học (gợi ý bài gần nhất), đánh giá khóa học, xem chứng chỉ (kích hoạt khi tiến độ $\ge 80\%$ và vượt qua toàn bộ Quiz).
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "course": {
      "course_id": "1",
      "slug": "python-co-ban-cho-nguoi-moi-bat-dau",
      "course_name": "Python Cơ Bản Cho Người Mới Bắt Đầu",
      "short_description": "Khóa học dành cho người mới bắt đầu...",
      "intro_video_url": "https://example.com/intro.mp4",
      "thumbnail_url": "https://example.com/thumb.jpg",
      "instructor": {
        "instructor_id": "inst_tran_minh_hieu",
        "full_name": "Trần Minh Hiếu",
        "title": "Senior Python Developer",
        "avatar_url": "https://example.com/avatar.jpg"
      },
      "rating": {
        "average": 4.8,
        "total_reviews": 1234,
        "total_reviews_formatted": "(1.234 đánh giá)"
      },
      "total_students": 120456,
      "total_students_formatted": "120.456 học viên"
    },
    "navigation_tabs": [
      { "key": "curriculum", "label": "Nội dung khóa học", "is_active": true },
      { "key": "overview", "label": "Tổng quan", "is_active": false },
      { "key": "resources", "label": "Tài liệu", "is_active": false },
      { "key": "qna", "label": "Hỏi đáp", "is_active": false },
      { "key": "discussions", "label": "Thảo luận", "is_active": false }
    ],
    "curriculum": {
      "summary": {
        "total_sections": 7,
        "total_lessons": 40,
        "total_duration_seconds": 20700,
        "total_duration_formatted": "05h 45m",
        "summary_text": "7 chương · 40 bài học · 05h 45m"
      },
      "sections": [
        {
          "section_id": "sec_01",
          "section_number": 1,
          "title": "Phần 1: Giới thiệu",
          "lessons_count": 4,
          "lessons_count_formatted": "4 bài học",
          "duration_seconds": 1367,
          "duration_formatted": "00h 22m",
          "lessons": [
            {
              "lesson_id": "les_01",
              "lesson_number": 1,
              "title": "Chào mừng đến với khóa học",
              "lesson_type": "video",
              "badge_label": "Video",
              "duration_seconds": 225,
              "duration_formatted": "03:45",
              "status": "completed",
              "is_free_preview": false,
              "order_index": 1
            },
            {
              "lesson_id": "les_02",
              "lesson_number": 2,
              "title": "Tổng quan khóa học",
              "lesson_type": "article",
              "badge_label": "Bài đọc",
              "word_count": 1040,
              "duration_seconds": 312,
              "duration_formatted": "05:12",
              "status": "not_started",
              "is_free_preview": false,
              "order_index": 2
            },
            {
              "lesson_id": "les_03",
              "lesson_number": 3,
              "title": "Thử ngay: Đoạn code đầu tiên",
              "lesson_type": "lab",
              "badge_label": "Phòng lab",
              "duration_seconds": 630,
              "duration_formatted": "10:30",
              "status": "not_started",
              "is_free_preview": false,
              "order_index": 3
            },
            {
              "lesson_id": "les_04",
              "lesson_number": 4,
              "title": "Bài kiểm tra giới thiệu",
              "lesson_type": "quiz",
              "badge_label": "Trắc nghiệm",
              "duration_formatted": "8 câu hỏi",
              "question_count": 8,
              "status": "in_progress",
              "is_free_preview": false,
              "order_index": 4
            }
          ]
        }
      ]
    },
    "learning_progress": {
      "progress_percentage": 65,
      "completed_lessons": 26,
      "total_lessons": 40,
      "lessons_progress_text": "26 / 40",
      "remaining_lessons": 14,
      "total_time_spent_seconds": 31500,
      "total_time_spent_formatted": "08h 45m",
      "is_completed": false
    },
    "actions": {
      "resume_learning": {
        "lesson_id": "les_05",
        "lesson_number": 5,
        "title": "Nhập xuất dữ liệu",
        "button_title": "Tiếp tục học",
        "button_subtitle": "Bài 5: Nhập xuất dữ liệu"
      },
      "course_review": {
        "has_reviewed": false,
        "user_rating": null,
        "user_comment": null,
        "button_title": "Đánh giá khóa học",
        "button_subtitle": "Chia sẻ cảm nhận của bạn"
      },
      "certificate": {
        "can_claim": false,
        "eligibility_reason": "Tiến độ học hiện tại (65%) chưa đạt tối thiểu 80%.",
        "certificate_id": null,
        "certificate_url": null,
        "button_title": "Xem chứng chỉ",
        "button_subtitle": "Xem hoặc tải chứng chỉ",
        "requirements": {
          "min_progress_percent": 80,
          "current_progress_percent": 65,
          "total_quizzes": 4,
          "passed_quizzes": 2
        }
      }
    }
  }
}
```

---

## K.2. Cập nhật tiến độ bài học (`PUT /api/user/lessons/:lessonId/progress`)

* Bắt buộc đăng nhập và course_id. Phân giải course theo course_id/slug/_id; lesson phải thuộc course, sai trả 404.
* Cần quyền trong user_enrollments hoặc user_courses, hỗ trợ user_id/userId; thiếu quyền trả 403 `COURSE_ENROLLMENT_REQUIRED`.
* Thiếu status mặc định in_progress. Route legacy từ chối hoàn thành (`done`/`completed`) bằng 409 `LESSON_COMPLETION_UNVERIFIED` trước khi ghi. Cập nhật chấp nhận ghi is_completed=false; giữ record hoàn thành lịch sử.
* time_spent_seconds phải là JSON number nguyên an toàn không âm, sai trả 400. Không lưu/tin quiz_result/lab_result do client gửi làm bằng chứng hoàn thành.
* API hoàn thành bài đọc/video, chấm quiz/lab riêng tại K.15 vẫn giữ nguyên; không dùng route legacy thay các API đó.

```json
{"course_id":"1","status":"in_progress","time_spent_seconds":312}
```

Response hợp lệ giữ lesson_id/status/progress_percentage/completed_lessons/total_lessons trong envelope hiện có.

---

## K.3. Truy vấn Tab Tổng quan khóa học (`GET /api/user/lessons/overview/:courseId`)

* **Endpoint:** `GET /api/user/lessons/overview/:courseId` (Hỗ trợ alias: `GET /api/lessons/overview/:courseId`)
* **Quyền:** Công khai / Tùy chọn xác thực.
* **Mục đích:** Cung cấp đầy đủ nội dung khi người dùng chuyển sang tab **"Tổng quan" (Overview)** bao gồm 3 khối nội dung hiển thị:
  1. **Khối Giới thiệu khóa học & 5 thông số kỹ thuật (Meta Highlights)**:
     - Đoạn văn bản giới thiệu chi tiết (`description`).
     - Cấp độ (`level`): *"Cơ bản"*, *"Trung cấp"*, *"Nâng cao"*.
     - Thời lượng (`duration`): Định dạng tiếng Việt tự nhiên, vd *"8 giờ 45 phút"*.
     - Hình thức (`format`): *"Học online, mọi lúc mọi nơi"*.
     - Ngôn ngữ (`language`): *"Tiếng Việt"*.
     - Bài giảng (`lessons_count`): Đếm số bài học thực tế, vd *"40 bài học"*.
  2. **Khối Bạn sẽ học được gì (`what_you_will_learn`)**: Danh sách mảng các kết quả đầu ra / kỹ năng đạt được.
  3. **Khối Yêu cầu (`requirements`)**: Danh sách mảng các điều kiện tiên quyết trước khi học.
* **Cơ chế fallback thông minh**: Nếu các trường `what_you_will_learn` hoặc `requirements` chưa có mảng riêng trong MongoDB, backend tự động trích xuất từ `course_outcomes` hoặc fallback về mẫu chuẩn ThinkUp để giao diện luôn hiển thị đầy đủ và không bao giờ bị lỗi dữ liệu.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "course_id": "1",
    "course_name": "Python Cơ Bản Cho Người Mới Bắt Đầu",
    "introduction": {
      "title": "Giới thiệu khóa học",
      "description": "Python là một trong những ngôn ngữ lập trình phổ biến và dễ học nhất hiện nay. Khóa học này được thiết kế dành riêng cho người mới bắt đầu, giúp bạn từng bước làm quen với Python từ những khái niệm cơ bản nhất.\n\nBạn sẽ học cách viết mã Python, hiểu các cấu trúc dữ liệu, hàm, xử lý lỗi và áp dụng vào các bài tập thực hành để xây dựng nền tảng vững chắc cho hành trình lập trình của mình.",
      "highlights": [
        {
          "key": "level",
          "label": "Cấp độ",
          "value": "Cơ bản",
          "icon": "bar-chart"
        },
        {
          "key": "duration",
          "label": "Thời lượng",
          "value": "8 giờ 45 phút",
          "icon": "clock"
        },
        {
          "key": "format",
          "label": "Hình thức",
          "value": "Học online, mọi lúc mọi nơi",
          "icon": "video"
        },
        {
          "key": "language",
          "label": "Ngôn ngữ",
          "value": "Tiếng Việt",
          "icon": "globe"
        },
        {
          "key": "lessons_count",
          "label": "Bài giảng",
          "value": "40 bài học",
          "icon": "file-text"
        }
      ]
    },
    "what_you_will_learn": [
      "Hiểu và cài đặt môi trường Python",
      "Nắm vững cú pháp Python cơ bản",
      "Làm việc với biến, kiểu dữ liệu và toán tử",
      "Sử dụng cấu trúc điều khiển (if, for, while)",
      "Xây dựng và sử dụng hàm trong Python",
      "Làm việc với chuỗi, danh sách, tuple, dictionary",
      "Xử lý lỗi và ngoại lệ",
      "Đọc và ghi file",
      "Thực hành qua các bài tập và dự án thực tế"
    ],
    "requirements": [
      "Không yêu cầu kinh nghiệm lập trình trước đó.",
      "Chỉ cần máy tính có kết nối Internet."
    ]
  }
}
```

---

## K.4. Lấy danh sách thảo luận khóa học (`GET /api/user/lessons/discussions/:courseId`)

* **Endpoint:** `GET /api/user/lessons/discussions/:courseId` (Hỗ trợ alias: `GET /api/lessons/discussions/:courseId`)
* **Quyền:** Tùy chọn xác thực (`optionalAuth`). Nếu có Bearer Token, trả thêm trạng thái `is_liked` và `is_owner` cá nhân hóa.
* **Mục đích:** Trả về danh sách thảo luận công khai của khóa học theo cấu trúc **2 tầng** (bình luận gốc Level 1 + phản hồi Level 2), phân trang mặc định 10 bài/lần.
* **Query Parameters:**

| Tham số | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :---: | :--- |
| `page` | `number` | `1` | Trang hiện tại |
| `limit` | `number` | `10` | Số bình luận gốc mỗi trang (tối đa 50) |
| `lesson_id` | `string` | `null` | Lọc thảo luận theo bài học liên quan |

* **Quy tắc nghiệp vụ (Business Rules):**
  * **BR-DISC-01**: Chỉ hiển thị bình luận gốc (`parent_id: null`) ở trang phân trang. Phản hồi con (Level 2) được nhóm trực tiếp vào thuộc tính `replies[]` của bình luận cha.
  * **BR-DISC-COUNT-01**: `pagination.total_items` vẫn là tổng bình luận gốc để giữ nguyên ý nghĩa phân trang; `pagination.total_comments` là tổng số bình luận gốc cộng toàn bộ phản hồi trong phạm vi khóa học/bài học; `pagination.total_replies` là số phản hồi.
  * **BR-DISC-06**: Mỗi thảo luận kèm `lesson_info` nếu được liên kết tới bài học cụ thể (tên bài, số thứ tự, URL).
  * **BR-DISC-07**: Cờ `is_instructor: true` tự động đánh dấu nếu tác giả là giảng viên hoặc admin.
  * **BR-DISC-08**: Email tác giả luôn được ẩn qua `maskEmail()` (vd: `thie******@gmail.com`).

* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total_items": 42,
      "total_comments": 67,
      "total_replies": 25,
      "total_pages": 5
    },
    "discussions": [
      {
        "discussion_id": "672f3a1b9c1d2e3f4a5b6c7d",
        "course_id": "1",
        "parent_id": null,
        "author": {
          "user_id": "user_001",
          "full_name": "Nguyễn Văn An",
          "masked_email": "nguy******@gmail.com",
          "avatar_url": "https://img.thinkup.vn/avatar_01.jpg",
          "role": "student",
          "is_instructor": false
        },
        "content": "Cho mình hỏi đoạn code bài 12 về decorators chạy lỗi ImportError thì xử lý thế nào ạ?",
        "lesson_info": {
          "lesson_id": "les_12",
          "lesson_number": 12,
          "title": "Python Decorators nâng cao",
          "lesson_url": "/learning/1/lessons/les_12"
        },
        "likes_count": 5,
        "replies_count": 2,
        "is_liked": true,
        "is_owner": false,
        "is_edited": false,
        "created_at": "2026-10-25T09:30:00.000Z",
        "created_at_formatted": "2 ngày trước",
        "edited_at": null,
        "replies": [
          {
            "discussion_id": "672f3a1b9c1d2e3f4a5b6c7e",
            "course_id": "1",
            "parent_id": "672f3a1b9c1d2e3f4a5b6c7d",
            "author": {
              "user_id": "inst_tran_minh_hieu",
              "full_name": "Trần Minh Hiếu",
              "masked_email": "tran******@thinkup.vn",
              "avatar_url": "https://img.thinkup.vn/instructor.jpg",
              "role": "instructor",
              "is_instructor": true
            },
            "content": "Bạn kiểm tra lại phiên bản Python nhé, decorator `@cache` yêu cầu Python 3.9 trở lên.",
            "lesson_info": {
              "lesson_id": "les_12",
              "lesson_number": 12,
              "title": "Python Decorators nâng cao",
              "lesson_url": "/learning/1/lessons/les_12"
            },
            "likes_count": 3,
            "replies_count": 0,
            "is_liked": false,
            "is_owner": false,
            "is_edited": false,
            "created_at": "2026-10-25T10:15:00.000Z",
            "created_at_formatted": "2 ngày trước",
            "edited_at": null
          }
        ]
      }
    ]
  }
}
```

---

## K.5. Đăng thảo luận mới hoặc trả lời (`POST /api/user/lessons/discussions/:courseId`)

* **Endpoint:** `POST /api/user/lessons/discussions/:courseId`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Đăng bình luận gốc mới hoặc trả lời (reply) bình luận có sẵn trong khóa học.
* **Body Request:**
```json
{
  "content": "Mình muốn hỏi thêm về cách xử lý Exception trong Python.",
  "lesson_id": "les_07",
  "parent_id": null,
  "attachments": [
    {
      "url": "https://res.cloudinary.com/thinkup/image/upload/error_log.png",
      "name": "error_log.png",
      "type": "image"
    }
  ]
}
```

| Trường | Kiểu | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `content` | `string` | ✅ | Nội dung bình luận (1–1.000 ký tự) |
| `lesson_id` | `string` | ❌ | ID bài học liên quan. Nếu trả lời, tự kế thừa từ bình luận cha. |
| `parent_id` | `string` | ❌ | ID bình luận cha. `null` = bình luận gốc. Có giá trị = trả lời. |
| `attachments` | `Array` | ❌ | Danh sách hình ảnh, video hoặc tài liệu đính kèm kèm URL và tên file. |

* **Quy tắc nghiệp vụ:**
  * **BR-DISC-02 Phân cấp 2 tầng**: Nếu `parent_id` trỏ tới một bình luận Level 2 (reply con), hệ thống tự động quy về `parent_id` gốc Level 1 của nó để **bảo toàn cấu trúc phẳng 2 tầng**.
  * **BR-DISC-03 Chống Spam 5 giây**: Nếu người dùng đăng bình luận mới trong vòng 5 giây kể từ bình luận trước → trả `429 Too Many Requests`.
  * **BR-DISC-04**: Tự động phát hiện vai trò `instructor` / `student` dựa trên `instructor_profiles` và `users`.

* **Phản hồi thành công (`201 Created`):**
```json
{
  "success": true,
  "discussion_id": "672f4b2c0a1b2c3d4e5f6789",
  "message": "Đăng thảo luận thành công.",
  "data": {
    "discussion_id": "672f4b2c0a1b2c3d4e5f6789",
    "parent_id": null,
    "lesson_id": "les_07",
    "content": "Mình muốn hỏi thêm về cách xử lý Exception trong Python.",
    "author": {
      "user_id": "user_001",
      "full_name": "Nguyễn Văn An",
      "masked_email": "nguy******@gmail.com",
      "avatar_url": "https://img.thinkup.vn/avatar_01.jpg",
      "role": "student"
    },
    "is_owner": true,
    "likes_count": 0,
    "replies_count": 0,
    "is_liked": false,
    "is_edited": false,
    "created_at_formatted": "Vừa xong"
  }
}
```

* **Mã lỗi:**

| HTTP | Mã lỗi | Mô tả |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Nội dung trống hoặc vượt 1.000 ký tự |
| `429` | `RATE_LIMIT_EXCEEDED` | Đăng quá nhanh, chưa đủ 5 giây kể từ bình luận trước |

---

## K.6. Chỉnh sửa thảo luận (`PUT /api/user/lessons/discussions/:id`)

* **Endpoint:** `PUT /api/user/lessons/discussions/:id`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Chỉnh sửa nội dung bình luận/phản hồi do chính người dùng hiện tại đăng.
* **Body Request:**
```json
{
  "content": "Mình đã sửa lại câu hỏi cho rõ ràng hơn: Cách xử lý multiple exceptions trong Python?"
}
```
* **Quy tắc nghiệp vụ:**
  * **BR-DISC-05 Quyền sở hữu**: Chỉ tác giả gốc (`user_id` trùng khớp) mới được phép chỉnh sửa → `403 Forbidden` nếu vi phạm.
  * Sau khi sửa thành công, cờ `is_edited: true` và `edited_at` được ghi nhận.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "discussion_id": "672f4b2c0a1b2c3d4e5f6789",
  "content": "Mình đã sửa lại câu hỏi cho rõ ràng hơn: Cách xử lý multiple exceptions trong Python?",
  "is_edited": true,
  "message": "Cập nhật bình luận thành công."
}
```

* **Mã lỗi:**

| HTTP | Mã lỗi | Mô tả |
| :---: | :--- | :--- |
| `403` | `FORBIDDEN` | Không phải tác giả gốc, không có quyền sửa |
| `404` | `NOT_FOUND` | Bình luận không tồn tại |

---

## K.7. Thích / Bỏ thích thảo luận (`POST /api/user/lessons/discussions/:id/like`)

* **Endpoint:** `POST /api/user/lessons/discussions/:id/like`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Toggle trạng thái thích: nếu chưa thích → thêm thích; nếu đã thích → bỏ thích. Đồng thời cập nhật `likes_count` trên bình luận.
* **Body Request:** Không cần body.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "is_liked": true,
  "likes_count": 6
}
```

---

## K.8. Báo cáo vi phạm thảo luận (`POST /api/user/lessons/discussions/:id/report`)

* **Endpoint:** `POST /api/user/lessons/discussions/:id/report`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Gửi báo cáo vi phạm về một bình luận tới Ban quản trị để xem xét xử lý.
* **Body Request:**
```json
{
  "reason": "Nội dung quảng cáo spam không liên quan đến khóa học."
}
```
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "message": "Báo cáo vi phạm đã được gửi tới Ban quản trị thành công."
}
```

> [!NOTE]
> Báo cáo được lưu vào collection `course_discussion_reports` với trạng thái `status: 'pending'`. Ban quản trị sẽ xem xét và xử lý thủ công.

---

## K.9. Lấy danh sách hỏi đáp 1-1 (`GET /api/user/lessons/qna/:courseId`)

* **Endpoint:** `GET /api/user/lessons/qna/:courseId` (Hỗ trợ alias: `GET /api/lessons/qna/:courseId`)
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`) – **BẮT BUỘC**.
* **Mục đích:** Trả về danh sách câu hỏi hỏi đáp 1-1 riêng tư giữa học viên và giảng viên, **cách ly dữ liệu 100%**.
* **Query Parameters:**

| Tham số | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :---: | :--- |
| `page` | `number` | `1` | Trang hiện tại |
| `limit` | `number` | `10` | Số câu hỏi gốc mỗi trang (tối đa 50) |
| `lesson_id` | `string` | `null` | Lọc câu hỏi theo bài học hiện tại; bộ đếm cũng được giới hạn trong bài học này |

* **Quy tắc nghiệp vụ (Critical):**

> [!CAUTION]
> **BR-QNA-02 Cách ly dữ liệu tuyệt đối (Data Isolation):**
> - **Học viên (role = `student`):** CHỈ THẤY câu hỏi do chính mình đặt (`student_id: userId`). TUYỆT ĐỐI KHÔNG nhìn thấy câu hỏi của học viên khác.
> - **Giảng viên (role = `instructor`/`admin`):** Thấy TẤT CẢ câu hỏi của tất cả học viên trong khóa học.

  * **BR-QNA-01 Cấu trúc 2 tầng**: Câu hỏi gốc (`parent_id: null`) + Phản hồi (`parent_id: rootId`).
  * **BR-QNA-03**: Mỗi câu hỏi kèm `lesson_info` (bài học liên quan), cho phép giảng viên biết ngữ cảnh.
  * **BR-QNA-COUNT-01**: Phản hồi có `counters.total_questions` là tổng câu hỏi gốc trong phạm vi người dùng/bài học và `counters.new_replies` (đồng nhất với `unread_replies`) là số phản hồi của giảng viên chưa được đánh dấu `is_read_by_student: true`. Học viên chỉ đếm dữ liệu của mình; giảng viên xem tổng số câu hỏi theo bộ lọc.
  * **BR-QNA-04**: **TUYỆT ĐỐI KHÔNG** có chức năng xóa câu hỏi/phản hồi. Chỉ cho phép chỉnh sửa nội dung.

* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total_items": 3,
      "total_pages": 1
    },
    "counters": {
      "total_questions": 3,
      "new_replies": 1,
      "unread_replies": 1
    },
    "qna_list": [
      {
        "qna_id": "673a1b2c3d4e5f6a7b8c9d01",
        "course_id": "1",
        "parent_id": null,
        "lesson_id": "les_15",
        "lesson_info": {
          "lesson_id": "les_15",
          "lesson_number": 15,
          "title": "Lập trình hướng đối tượng OOP",
          "lesson_url": "/learning/1/lessons/les_15"
        },
        "author": {
          "user_id": "user_001",
          "full_name": "Nguyễn Văn An",
          "avatar_url": "https://img.thinkup.vn/avatar_01.jpg",
          "role": "student",
          "is_instructor": false
        },
        "content": "Thầy ơi cho em hỏi, sự khác biệt giữa @classmethod và @staticmethod trong Python OOP là gì ạ?",
        "is_owner": true,
        "is_edited": false,
        "created_at": "2026-10-26T14:00:00.000Z",
        "created_at_formatted": "Hôm qua 21:00",
        "replies": [
          {
            "qna_id": "673a1b2c3d4e5f6a7b8c9d02",
            "course_id": "1",
            "parent_id": "673a1b2c3d4e5f6a7b8c9d01",
            "lesson_id": "les_15",
            "lesson_info": null,
            "author": {
              "user_id": "inst_tran_minh_hieu",
              "full_name": "Trần Minh Hiếu",
              "avatar_url": "https://img.thinkup.vn/instructor.jpg",
              "role": "instructor",
              "is_instructor": true
            },
            "content": "@classmethod nhận tham số đầu tiên là class (cls), dùng để tạo factory methods. @staticmethod không nhận tham số đặc biệt, chỉ là hàm thông thường gom nhóm trong class.",
            "is_owner": false,
            "is_edited": false,
            "created_at": "2026-10-26T15:30:00.000Z",
            "created_at_formatted": "Hôm qua 22:30"
          }
        ]
      }
    ]
  }
}
```

---

## K.10. Gửi câu hỏi Q&A mới (`POST /api/user/lessons/qna/:courseId`)

* **Endpoint:** `POST /api/user/lessons/qna/:courseId`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Học viên gửi câu hỏi mới tới giảng viên, **bắt buộc** gắn liền với một bài học cụ thể (`lesson_id`) để giảng viên biết ngữ cảnh.
* **Body Request:**
```json
{
  "lesson_id": "les_15",
  "content": "Thầy ơi cho em hỏi, sự khác biệt giữa @classmethod và @staticmethod trong Python OOP là gì ạ?",
  "attachments": [
    {
      "url": "https://res.cloudinary.com/thinkup/image/upload/qna_snippet.png",
      "name": "qna_snippet.png",
      "type": "image"
    }
  ]
}
```

| Trường | Kiểu | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `lesson_id` | `string` | ✅ | ID bài học liên quan đến câu hỏi |
| `content` | `string` | ✅ | Nội dung câu hỏi (1–1.000 ký tự) |
| `attachments` | `Array` | ❌ | Danh sách hình ảnh, video, tài liệu đính kèm minh họa |

* **Đặc điểm triển khai:**
  * `student_id` được tự động gán bằng `req.userId` từ JWT, đảm bảo truy vết và cách ly dữ liệu chính xác.
  * Câu hỏi gốc luôn có `parent_id: null`.

* **Phản hồi thành công (`201 Created`):**
```json
{
  "success": true,
  "qna_id": "673b2c3d4e5f6a7b8c9d0e01",
  "message": "Gửi câu hỏi tới giảng viên thành công.",
  "data": {
    "qna_id": "673b2c3d4e5f6a7b8c9d0e01",
    "content": "Thầy ơi cho em hỏi, sự khác biệt giữa @classmethod và @staticmethod trong Python OOP là gì ạ?",
    "lesson_id": "les_15",
    "is_owner": true,
    "created_at_formatted": "Vừa xong"
  }
}
```

---

## K.11. Phản hồi câu hỏi Q&A (`POST /api/user/lessons/qna/:id/reply`)

* **Endpoint:** `POST /api/user/lessons/qna/:id/reply`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Giảng viên hoặc học viên trả lời một câu hỏi Q&A có sẵn. Phản hồi luôn được gắn vào câu hỏi gốc (duy trì cấu trúc 2 tầng).
* **Body Request:**
```json
{
  "content": "@classmethod nhận tham số đầu tiên là class (cls), dùng để tạo factory methods. @staticmethod không nhận tham số đặc biệt."
}
```
* **Đặc điểm triển khai:**
  * Nếu `:id` trỏ tới một reply con (đã có `parent_id`), hệ thống tự động quy về `parent_id` gốc → **phẳng 2 tầng**.
  * `student_id` được kế thừa từ câu hỏi gốc để duy trì cách ly phiên 1-1.
  * Vai trò `instructor` / `student` được tự động phát hiện từ `instructor_profiles`.
* **Phản hồi thành công (`201 Created`):**
```json
{
  "success": true,
  "qna_id": "673b2c3d4e5f6a7b8c9d0e02",
  "message": "Phản hồi câu hỏi thành công."
}
```

---

* `replyQnaQuestion({qnaId,userId,content})` quy reply về root, tải course/profile và chỉ cho chủ hội thoại hoặc giảng viên có instructor ID khớp course.instructor_id trả lời. Không tin role body/query. Ngoài quyền: 403 `QNA_REPLY_FORBIDDEN`; thiếu câu hỏi/course: 404. Giữ cấu trúc hai tầng.

## K.12. Chỉnh sửa nội dung Q&A (`PUT /api/user/lessons/qna/:id`)

* **Endpoint:** `PUT /api/user/lessons/qna/:id`
* **Quyền:** Yêu cầu đăng nhập (`Bearer Token`).
* **Mục đích:** Chỉnh sửa nội dung câu hỏi hoặc phản hồi Q&A do chính người dùng hiện tại đăng.
* **Body Request:**
```json
{
  "content": "Nội dung đã được chỉnh sửa cho rõ ràng hơn."
}
```
* **Quy tắc nghiệp vụ:**
  * **BR-QNA-04 Không xóa**: Module Q&A **TUYỆT ĐỐI KHÔNG HỖ TRỢ XÓA**. Chỉ cho phép sửa nội dung để bảo toàn lịch sử trao đổi.
  * Kiểm tra quyền sở hữu (`user_id` khớp) → `403` nếu vi phạm.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "qna_id": "673a1b2c3d4e5f6a7b8c9d01",
  "content": "Nội dung đã được chỉnh sửa cho rõ ràng hơn.",
  "is_edited": true,
  "message": "Cập nhật nội dung thành công."
}
```

* **Mã lỗi:**

| HTTP | Mã lỗi | Mô tả |
| :---: | :--- | :--- |
| `403` | `FORBIDDEN` | Không phải tác giả gốc, không có quyền sửa |
| `404` | `NOT_FOUND` | Câu hỏi/phản hồi không tồn tại |

---

## K.13. Lấy kho tài liệu khóa học (`GET /api/user/lessons/documents/:courseId`)

* **Endpoint:** `GET /api/user/lessons/documents/:courseId` (Hỗ trợ alias: `GET /api/lessons/documents/:courseId`)
* **Quyền:** Tùy chọn xác thực.
* **Mục đích:** Trả về toàn bộ kho tài liệu đính kèm của khóa học, **phân loại theo 3 danh mục chuẩn**.
* **3 danh mục tài liệu:**

| Key | Tên hiển thị | Mô tả |
| :--- | :--- | :--- |
| `lecture_slides` | Tài liệu bài giảng | Slide PDF, tóm tắt lý thuyết, cheatsheet |
| `source_code` | Mã nguồn bài tập | File code mẫu, Jupyter Notebook, project ZIP |
| `exercises_data` | Dữ liệu thực hành | Dataset CSV/JSON, file SQL, dữ liệu test |

* **Thuộc tính từng tài liệu:**

| Trường | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `document_id` | `string` | ID duy nhất của tài liệu |
| `title` | `string` | Tên hiển thị tài liệu |
| `file_name` | `string` | Tên file gốc (kèm extension) |
| `file_type` | `string` | Định dạng file (`pdf`, `zip`, `ipynb`, `csv`...) |
| `icon_type` | `string` | Gợi ý icon FE: `file-pdf` \| `file-zip` \| `file-code` \| `file-spreadsheet` \| `file-text` |
| `file_size_bytes` | `number` | Kích thước file (bytes) |
| `file_size_formatted` | `string` | Kích thước đã format (vd: `"4.6 MB"`, `"12.0 MB"`) |
| `download_count` | `number` | Tổng số lượt tải |
| `download_url` | `string` | API tải file: `/api/user/lessons/documents/:id/download` |
| `updated_at_formatted` | `string` | Thời gian cập nhật tương đối (vd: `"2 ngày trước"`) |
| `lesson_id` | `string \| null` | ID của bài học mà tài liệu này được đính kèm vào (nếu có) |
| `lesson_title` | `string \| null` | Tên tiêu đề của bài học đính kèm |
| `is_attached_to_lesson` | `boolean` | `true` nếu tài liệu thuộc về một bài học cụ thể, `false` nếu là tài liệu chung của khóa học |

* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "course_id": "1",
    "course_name": "Python Cơ Bản Cho Người Mới Bắt Đầu",
    "summary": {
      "total_documents": 5,
      "total_slides": 2,
      "total_source_code": 2,
      "total_exercises_data": 1
    },
    "categories": [
      {
        "key": "lecture_slides",
        "label": "Tài liệu bài giảng",
        "count": 2,
        "items": [
          {
            "document_id": "doc_slide_01",
            "title": "Slide bài giảng: Cấu trúc điều khiển và Vòng lặp Python",
            "file_name": "Python_Control_Flow_Slides_v2.pdf",
            "file_type": "pdf",
            "icon_type": "file-pdf",
            "file_size_bytes": 4823449,
            "file_size_formatted": "4.6 MB",
            "download_count": 142,
            "download_url": "/api/user/lessons/documents/doc_slide_01/download",
            "updated_at_formatted": "2 ngày trước",
            "lesson_id": "les_01",
            "lesson_title": "Cấu trúc điều khiển và Vòng lặp trong Python",
            "lesson_name": "Cấu trúc điều khiển và Vòng lặp trong Python",
            "is_attached_to_lesson": true
          }
        ]
      },
      {
        "key": "source_code",
        "label": "Mã nguồn bài tập",
        "count": 2,
        "items": [
          {
            "document_id": "doc_code_01",
            "title": "Mã nguồn mẫu: Toàn bộ bài tập thực hành Chương 1 - 4",
            "file_name": "Python_Basic_Exercises_SourceCode.zip",
            "file_type": "zip",
            "icon_type": "file-zip",
            "file_size_bytes": 12582912,
            "file_size_formatted": "12.0 MB",
            "download_count": 215,
            "download_url": "/api/user/lessons/documents/doc_code_01/download",
            "updated_at_formatted": "Hôm qua 14:00"
          },
          {
            "document_id": "doc_code_02",
            "title": "Jupyter Notebook: Phân tích dữ liệu mẫu với Python",
            "file_name": "Python_Data_Analysis_Lab.ipynb",
            "file_type": "ipynb",
            "icon_type": "file-code",
            "file_size_bytes": 1843200,
            "file_size_formatted": "1.8 MB",
            "download_count": 76,
            "download_url": "/api/user/lessons/documents/doc_code_02/download",
            "updated_at_formatted": "3 ngày trước"
          }
        ]
      },
      {
        "key": "exercises_data",
        "label": "Dữ liệu thực hành",
        "count": 1,
        "items": [
          {
            "document_id": "doc_data_01",
            "title": "Tập dữ liệu thực hành: Danh sách khách hàng và đơn hàng mẫu",
            "file_name": "Customer_Orders_Dataset_2026.csv",
            "file_type": "csv",
            "icon_type": "file-spreadsheet",
            "file_size_bytes": 3565158,
            "file_size_formatted": "3.4 MB",
            "download_count": 180,
            "download_url": "/api/user/lessons/documents/doc_data_01/download",
            "updated_at_formatted": "4 ngày trước"
          }
        ]
      }
    ]
  }
}
```

---

* `getCourseDocuments(courseIdOrSlug,userId=null,options={})` chỉ trả tài liệu MongoDB. DB rỗng vẫn có ba category, count=0/items rỗng; không sinh tài liệu demo. updated_at thiếu giữ null. Người chưa đủ quyền chỉ thấy metadata, ẩn file_url, can_download=false.

## K.14. Tải tài liệu khóa học (`GET /api/user/lessons/documents/:id/download`)

* **Endpoint:** `GET /api/user/lessons/documents/:id/download`
* **Quyền:** Bắt buộc đăng nhập (requireAuth); cần quyền khóa học trừ khi tài liệu có cờ free/preview rõ ràng.
* **Mục đích:** Trả URL storage đã lưu cho trình duyệt tải; chỉ tăng counter khi đủ quyền và URL hợp lệ.
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "document_id": "doc_slide_01",
    "file_name": "Python_Control_Flow_Slides_v2.pdf",
    "file_type": "pdf",
    "mime_type": "application/pdf",
    "download_url": "https://cdn.thinkup.vn/docs/slides_control_flow.pdf",
    "direct_download_url": "https://cdn.thinkup.vn/docs/slides_control_flow.pdf",
    "download_count": 143,
    "lesson_id": "les_01",
    "lesson_title": "Cấu trúc điều khiển và Vòng lặp trong Python",
    "lesson_name": "Cấu trúc điều khiển và Vòng lặp trong Python",
    "is_attached_to_lesson": true
  }
}
```

* Thiếu record: 404 `COURSE_DOCUMENT_NOT_FOUND`; thiếu URL storage: 409 `COURSE_DOCUMENT_FILE_UNAVAILABLE`. Không trả link demo; thiếu quyền/file hoặc URL sai không tăng counter.
* Response thêm `download:{quality:"original",location:"browser",requestedQuality,requestedLocation}`. Backend không truyền file/chọn thư mục máy; bảo vệ storage/CDN cần cơ chế riêng.

---

## K.15. Bốn loại bài học: bài đọc, video, quiz và lab

### Phạm vi và quy ước chung

* **Tệp xử lý:** `server/src/user/lesson/lesson.user.js` (`createLessonLearningService`, `createLessonRouter`).
* **Tệp kiểm thử:** `server/src/user/lesson/test/lesson.user.test.js`.
* **Base URL:** `/api/user/lessons`; các alias đang đăng ký là `/api/v1/user/lessons` và `/api/lessons`.
* **Xác thực:** Các route trong bảng dưới đây yêu cầu Bearer token. Backend lấy `userId` từ middleware, kiểm tra đăng ký/ghi danh khóa học trước khi truy cập bài.
* **Phản hồi:** Route học tập mới trả `{ "success": true, "data": ... }`. Lỗi được chuyển tiếp sang middleware lỗi chung, với `status` và `code` do hàm nghiệp vụ đặt.
* **Tên loại bài FE:** `reading`, `video`, `quiz`, `lab`. `article` được chuẩn hóa thành `reading`.
* **Trạng thái FE:** `done`, `not-started`, `failed`. Trạng thái legacy `completed` được chuẩn hóa thành `done`.
* **Điều kiện chứng chỉ:** Tiến độ khóa học tối thiểu 80%, toàn bộ quiz đạt và toàn bộ lab đạt bằng kết quả runner thật. Kết quả lab mô phỏng không đủ điều kiện chứng chỉ.

### Danh sách API theo loại bài

| Method | Endpoint | Mục đích | Body / Query |
| :--- | :--- | :--- | :--- |
| `GET` | `/curriculum/:lessonId` | Danh sách bài theo thứ tự, trạng thái, bài tiếp tục học và tiến độ khóa học | — |
| `GET` | `/content/:lessonId` | Nội dung bài, trạng thái, điều hướng trước/sau và tài liệu liên quan | — |
| `POST` | `/:lessonId/complete` | Đánh dấu thủ công bài đọc hoặc video hoàn thành | — |
| `GET` | `/quiz/:lessonId/overview` | Số câu, thời hạn, điểm đạt, điểm cao nhất, số lượt và lượt đang chạy | — |
| `POST` | `/quiz/:lessonId/attempts` | Bắt đầu hoặc tiếp tục lượt quiz | `{ "retry": false }` (tùy chọn) |
| `GET` | `/quiz/attempts/:attemptId` | Lấy lượt quiz, câu hỏi/lựa chọn, đáp án đã lưu và thời gian còn lại | — |
| `PUT` | `/quiz/attempts/:attemptId/answers` | Lưu đáp án và câu được đánh dấu | `{ "answers": { "q1": "option-a" }, "flagged_question_ids": [], "revision": 0 }` |
| `POST` | `/quiz/attempts/:attemptId/submit` | Nộp và chấm quiz bằng đáp án server đã lưu | — |
| `POST` | `/quiz/attempts/:attemptId/abandon` | Bỏ dở lượt đang làm để có thể làm lại | — |
| `GET` | `/quiz/:lessonId/history` | Lịch sử tối đa 100 lượt, không trả đáp án/câu hỏi nội bộ | — |
| `POST` | `/lab/:lessonId/attempts` | Bắt đầu/tiếp tục lab, tạo workspace với code mẫu giảng viên | — |
| `PUT` | `/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId` | Lưu code nháp theo revision | `{ "source_code": "...", "revision": 0 }` |
| `POST` | `/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/run` | Lưu code gửi kèm (nếu có), sau đó chạy test case | `{ "source_code": "...", "revision": 0 }` (tùy chọn) |
| `POST` | `/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/reset` | Khôi phục code mẫu giảng viên và xóa kết quả chạy cũ | `{ "revision": 1 }` |
| `GET` | `/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/solutions` | Xem lời giải sau khi bài con đạt đủ test | — |
| `POST` | `/lab/:lessonId/attempts/:attemptId/submit` | Chốt lượt, xác định kết quả mới nhất của mỗi bài con | — |
| `GET` | `/lab/:lessonId/attempts/:attemptId/history` | Lịch sử chạy test của lượt | — |
| `GET` | `/lab/:lessonId/leaderboard` | Xếp hạng theo số bài con đạt mới nhất, sau đó theo tổng thời gian chạy tích lũy | — |
| `GET` | `/video/:lessonId/playback` | Tạo phiên và trả URL phát, thời lượng, vị trí gần nhất | — |
| `POST` | `/video/:lessonId/heartbeat` | Ghi nhận đoạn nội dung video đã xem | `{ "session_id": "...", "from": 0, "to": 10, "playback_rate": 1 }` |

### Bài đọc / ebook

`GET /content/:lessonId` trả `data.reading.content_html`, `images`, `document_url` và `resources`. HTML bài đọc được lọc về các thẻ nội dung cho phép. `POST /:lessonId/complete` cho người học tự đánh dấu bài đọc hoàn thành; backend không yêu cầu điều kiện đọc tối thiểu.

Ví dụ phản hồi rút gọn:

```json
{
  "success": true,
  "data": {
    "id": "lesson-1",
    "type": "reading",
    "status": "not-started",
    "previous_lesson": null,
    "next_lesson": { "id": "lesson-2", "title": "Quiz", "type": "quiz" },
    "reading": { "content_html": "<p>Nội dung...</p>", "images": [], "document_url": null },
    "resources": []
  }
}
```

### Video

`GET /video/:lessonId/playback` yêu cầu video có URL HTTPS và thời lượng hợp lệ. Phản hồi gồm `session_id`, `playback_url`, `duration_seconds`, `last_position_seconds`, `poster_url`. FE/player chịu trách nhiệm điều khiển tốc độ phát và chất lượng hình ảnh; backend chỉ chấp nhận `playback_rate` trong `[0.75, 1, 1.25, 1.5, 1.75, 2]` khi ghi heartbeat.

Heartbeat phải thuộc phiên phát của chính người dùng, không quá hạn, có đoạn `[from, to]` hợp lệ và phù hợp với thời gian thực đã trôi qua. Backend gộp các đoạn xem chồng lấp để tránh cộng lặp; đạt ít nhất 70% thời lượng nội dung sẽ tự hoàn thành video. Người học cũng được đánh dấu video hoàn thành thủ công qua `POST /:lessonId/complete`.

### Quiz

* Cấu hình thời gian lấy từ `time_limit_seconds` hoặc `time_limit` (phút); điểm đạt lấy từ `pass_percent`/`pass_score`, mặc định 70%.
* `POST /quiz/:lessonId/attempts` tạo lượt có `expires_at`; nếu lượt còn chạy và `retry` không bật thì trả lại lượt hiện tại. Nếu yêu cầu làm lại trong khi còn lượt chạy, backend trả `409 ATTEMPT_RUNNING`.
* Đáp án chỉ được lưu trước `expires_at`. Mỗi lần lưu cần `revision` hiện tại; revision cũ trả `409 STALE_REVISION`.
* Câu trả lời đúng không được đưa ra trong danh sách câu hỏi gửi học viên. Chấm điểm tính số câu đúng trên tổng câu hỏi; câu bỏ trống vẫn thuộc mẫu số.
* Hết giờ, lượt được chấm từ dữ liệu đáp án đã lưu trên server khi lượt được truy cập/nộp tiếp theo. Hàm `finalizeExpiredQuizzes()` có trong service nhưng hiện không có route công khai hoặc worker được đăng ký trong module này; không nên mô tả đây là tác vụ nền đã được cấu hình.
* Đạt quiz được ghi nhận từ kết quả chấm server. Lịch sử giữ các lượt trước; overview trả điểm cao nhất và trạng thái lượt đang chạy.

Ví dụ nộp quiz:

```http
POST /api/user/lessons/quiz/attempts/attempt-uuid/submit
Authorization: Bearer <accessToken>
```

Phản hồi `data` có `status`, `score_percent`, `correct_count`, `wrong_count`, `unanswered_count`, `passed`, `submitted_at`, `server_now` và `remaining_seconds`.

### Lab / hoàn thiện hàm

Ngôn ngữ và hàm đích do cấu hình bài quyết định; học viên không gửi lựa chọn ngôn ngữ. `POST /lab/:lessonId/attempts` nạp `starter_code` của giảng viên vào workspace từng bài con, nên học viên có thể chạy code mẫu ngay, xóa/sửa code hoặc dùng chức năng reset để khôi phục.

Khi gửi code trong request chạy, `source_code` và `revision` là bắt buộc cùng nhau. Backend lưu code (tăng revision) trước khi gọi bộ chấm. Có thể gọi `PUT` lưu nháp riêng trong lúc biên tập; revision không khớp trả `409 STALE_REVISION`. Reset cũng yêu cầu revision và luôn xóa `latest_run_id`, đặt trạng thái bài con về `not-started`, kể cả khi code đã trùng code mẫu.

Mỗi bài con chỉ đạt khi tất cả test case của bài đó đạt. Ngưỡng đạt của toàn lab lấy từ `pass_percent` trong cấu hình, mặc định 70% số bài con. Nộp lab dùng kết quả chạy mới nhất ứng với revision hiện tại của từng bài con; chạy code mới làm mất hiệu lực kết quả trước đó của bài con đó. Chứng chỉ vẫn yêu cầu mọi bài lab trong khóa đạt bằng runner thật.

**Chế độ mô phỏng:** Nếu cả `LAB_RUNNER_URL` và `LAB_RUNNER_TOKEN` đều chưa được cấu hình, lab dùng `simulateLabRunner`; phản hồi mang `execution_mode: "simulation"` và `is_simulated: true`. Đây là heuristic demo, không thực thi mã người học. Kết quả mô phỏng không được tính để cấp chứng chỉ. Nếu chỉ khai báo một trong hai biến runner, thao tác bị lỗi cấu hình `503 LAB_RUNNER_MISCONFIGURED`. Với runner thật, backend gửi `{ source_code, language, entry_point, test_cases }`; runner phải trả `execution_ms` và `test_results` có `id`, `actual`, `status` (cùng `error` nếu có).

Ví dụ chạy và tự lưu code:

```http
POST /api/user/lessons/lab/lesson-3/attempts/attempt-uuid/exercises/exercise-1/run
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "source_code": "function sum(a, b) { return a + b; }",
  "revision": 0
}
```

Phản hồi `data` gồm `run_id`, `revision`, `test_results[]` (`id`, `actual`, `expected_output`, `passed`, `status`, `error`), `passed`, `execution_ms`, `execution_mode`, `is_simulated`.

### Lỗi nghiệp vụ chính

| HTTP | `code` | Ý nghĩa / xử lý FE |
| :---: | :--- | :--- |
| `401` | `AUTH_REQUIRED` | Token hoặc danh tính học viên không hợp lệ. |
| `403` | `REQUIRE_ENROLLMENT`, `MANUAL_COMPLETION_NOT_ALLOWED`, `PASS_REQUIRED` | Chưa ghi danh, loại bài không cho hoàn thành thủ công hoặc chưa đạt để xem lời giải. |
| `404` | `LESSON_NOT_FOUND`, `COURSE_NOT_FOUND`, `ATTEMPT_NOT_FOUND` | Không tìm thấy tài nguyên trong phạm vi người dùng. |
| `409` | `ATTEMPT_RUNNING`, `QUIZ_CLOSED`, `STALE_REVISION`, `LAB_CLOSED`, `VIDEO_SESSION_EXPIRED` | Lượt đã đóng/hết hạn hoặc dữ liệu đã có phiên bản mới; tải lại trạng thái rồi thử lại phù hợp. |
| `422` | `QUIZ_NOT_CONFIGURED`, `INVALID_QUIZ_CONFIG`, `LAB_NOT_CONFIGURED`, `INVALID_LAB_CONFIG`, `VIDEO_NOT_CONFIGURED` | Nội dung hoặc cấu hình bài chưa đủ/hợp lệ. |
| `502` | `LAB_RUNNER_ERROR`, `INVALID_RUNNER_RESULT` | Runner lỗi hoặc trả kết quả sai hợp đồng. |
| `503` | `LAB_RUNNER_MISCONFIGURED` | Chỉ cấu hình một trong hai biến runner. Khi cả hai biến đều thiếu, lab dùng mô phỏng thay vì lỗi. |

---

### Bảng tổng hợp Endpoints Section K - Module Bài Học & Màn Hình Học Tập

| # | Method | Endpoint | Quyền | Mô tả tóm tắt |
| :---: | :--- | :--- | :---: | :--- |
| K.1 | `GET` | `/api/user/lessons/study/:courseId` | Tùy chọn | 5 khối dữ liệu màn hình học tập |
| K.2 | `PUT` | `/api/user/lessons/:lessonId/progress` | Đăng nhập | Cập nhật tiến độ bài học |
| K.3 | `GET` | `/api/user/lessons/overview/:courseId` | Tùy chọn | Tab Tổng quan (Overview) |
| K.4 | `GET` | `/api/user/lessons/discussions/:courseId` | Tùy chọn | Danh sách thảo luận (10 bài/trang) |
| K.5 | `POST` | `/api/user/lessons/discussions/:courseId` | Đăng nhập | Đăng thảo luận / trả lời |
| K.6 | `PUT` | `/api/user/lessons/discussions/:id` | Đăng nhập | Sửa thảo luận (chủ sở hữu) |
| K.7 | `POST` | `/api/user/lessons/discussions/:id/like` | Đăng nhập | Toggle thích / bỏ thích |
| K.8 | `POST` | `/api/user/lessons/discussions/:id/report` | Đăng nhập | Báo cáo vi phạm |
| K.9 | `GET` | `/api/user/lessons/qna/:courseId` | Đăng nhập | Hỏi đáp 1-1 (cách ly dữ liệu) |
| K.10 | `POST` | `/api/user/lessons/qna/:courseId` | Đăng nhập | Gửi câu hỏi mới |
| K.11 | `POST` | `/api/user/lessons/qna/:id/reply` | Đăng nhập | Phản hồi câu hỏi |
| K.12 | `PUT` | `/api/user/lessons/qna/:id` | Đăng nhập | Sửa nội dung Q&A |
| K.13 | `GET` | `/api/user/lessons/documents/:courseId` | Tùy chọn | Kho tài liệu 3 danh mục |
| K.14 | `GET` | `/api/user/lessons/documents/:id/download` | Tùy chọn | Tải file & tăng lượt tải |
| K.15 | `GET` | `/api/user/lessons/curriculum/:lessonId` | Đăng nhập + ghi danh | Điều hướng bài, trạng thái và tiến độ |
| K.15 | `GET` | `/api/user/lessons/content/:lessonId` | Đăng nhập + ghi danh | Nội dung một bài theo loại |
| K.15 | `POST` | `/api/user/lessons/:lessonId/complete` | Đăng nhập + ghi danh | Đánh dấu bài đọc/video hoàn tất |
| K.15 | `GET/POST/PUT` | `/api/user/lessons/quiz/...` | Đăng nhập + ghi danh | Overview, lượt làm, lưu đáp án, chấm và lịch sử quiz |
| K.15 | `GET/POST/PUT` | `/api/user/lessons/lab/...` | Đăng nhập + ghi danh | Workspace, lưu/chạy/reset/nộp lab, lời giải, lịch sử, bảng xếp hạng |
| K.15 | `GET/POST` | `/api/user/lessons/video/...` | Đăng nhập + ghi danh | Phiên phát và theo dõi đoạn đã xem |

### Trạng thái bài học trả về

Các API màn hình học tập (`GET /study/:courseId`, `GET /curriculum/:lessonId`, `GET /content/:lessonId`) thống nhất trả `status` theo ba nhãn backend: `done`, `failed`, `not-started`. Trạng thái tiến độ cũ `completed` vẫn được hiểu là `done`; giá trị tiến độ cũ như `in_progress` được biểu diễn thành `not-started` do hợp đồng này không có trạng thái đang học. `PUT /:lessonId/progress` lưu trạng thái theo bộ nhãn thống nhất và vẫn chấp nhận alias cũ để tương thích.

### Cấu trúc CSDL MongoDB liên quan

| Collection | Mục đích |
| :--- | :--- |
| `course_discussions` | Bình luận thảo luận công khai (2 tầng: root + reply) |
| `course_discussion_likes` | Bản ghi thích bình luận (`discussion_id` + `user_id`) |
| `course_discussion_reports` | Báo cáo vi phạm thảo luận |
| `course_qna` | Câu hỏi & phản hồi hỏi đáp 1-1 riêng tư |
| `course_documents` | Tài liệu đính kèm khóa học (3 danh mục) |
| `user_lesson_progress` | Tiến độ chi tiết từng bài học của học viên |
| `user_course_progress` | Tiến độ tổng quan khóa học của học viên |
| `lesson_articles`, `lesson_videos` | Nội dung bài đọc và metadata/URL video |
| `lesson_quizzes`, `quiz_questions`, `quiz_answer_options`, `quiz_attempts` | Cấu hình quiz, ngân hàng câu hỏi và lượt làm đã lưu |
| `lesson_labs`, `lab_attempts`, `lab_workspaces`, `lab_runs` | Cấu hình lab, code mẫu, workspace theo revision, các lượt chạy và nộp |
| `video_sessions`, `video_progress` | Phiên phát và các đoạn nội dung video đã xem |
| `user_courses`, `user_enrollments` | Kiểm tra quyền truy cập khóa học |

### Nhóm hàm Backend nội bộ (`lesson.user.js`)

* `getCourseStudyCurriculum(courseIdOrSlug, userId=null, options={})`: Truy xuất 5 khối màn hình học tập, thêm learning_preferences; không đổi tính/ghi tiến độ.
* `updateLessonProgress(userId, courseId, lessonId, payload)`: Cập nhật tiến độ bài học & tự đồng bộ tiến độ khóa.
* `getCourseOverview(courseIdOrSlug)`: Tab Tổng quan với 5 meta highlights, what you will learn, requirements.
* `getCourseDiscussions({ courseId, userId, page, limit, lessonId })`: Danh sách thảo luận 2 tầng, phân trang, lesson linkage; trả số bình luận gốc, tổng phản hồi và tổng bình luận trong `pagination`.
* `createDiscussion({ courseId, userId, content, lessonId, parentId })`: Đăng thảo luận mới (chống spam 5s, phân cấp 2 tầng).
* `updateDiscussion({ discussionId, userId, content })`: Sửa thảo luận (chỉ chủ sở hữu).
* `toggleDiscussionLike({ discussionId, userId })`: Toggle thích / bỏ thích.
* `reportDiscussion({ discussionId, reporterUserId, reason })`: Gửi báo cáo vi phạm.
* `getCourseQnaList({ courseId, userId, role, page, limit, lessonId })`: Danh sách Q&A 1-1 (cách ly dữ liệu), lọc theo bài học; trả tổng câu hỏi và phản hồi mới/chưa đọc trong `counters`.
* `createQnaQuestion({ courseId, userId, lessonId, content })`: Gửi câu hỏi mới.
* `replyQnaQuestion({ qnaId, userId, content })`: Phản hồi câu hỏi.
* `updateQnaContent({ qnaId, userId, content })`: Sửa nội dung Q&A (không xóa).
* `getCourseDocuments(courseIdOrSlug, userId=null, options={})`: Kho tài liệu thật, ẩn link khi thiếu quyền.
* `downloadCourseDocument(documentId, userId, options={})`: Kiểm tra đăng nhập/quyền/file trước khi trả URL thật và tăng counter.
* `createLessonLearningService({ db, now, runner })`: Tạo service xử lý điều hướng/nội dung, hoàn thành bài, quiz, lab và video; `db`, `now`, `runner` là phụ thuộc có thể inject để kiểm thử.
* `normalizeLessonType(value)` / `normalizeLessonStatus(progress)`: Chuẩn hóa loại bài và trạng thái theo hợp đồng FE.
* `calculateQuizResult(questions, answers, passPercent)`: Đếm câu đúng/sai/bỏ trống, tính phần trăm và trạng thái đạt.
* `calculateLabResult(results, passPercent)`: Tính số bài con đạt và trạng thái đạt của lượt lab.
* `simulateLabRunner({ source_code, exercise })`: Bộ mô phỏng demo; không thực thi code và trả mode `simulation`.
* `mergeWatchedRanges(ranges, duration)`: Gộp đoạn video xem trùng nhau và giới hạn trong thời lượng bài.
* **Tiện ích:**
  * `calculateArticleDuration(wordCount, readingSpeedWpm)`: Thời lượng đọc theo số từ.
  * `formatDurationMmSs(seconds)`: Định dạng `mm:ss`.
  * `formatHoursMinutes(seconds)`: Định dạng `HHh MMm`.
  * `formatDurationVietnamese(minutes, seconds)`: Định dạng tiếng Việt (`"8 giờ 45 phút"`).
  * `formatCourseLevel(level)`: Chuẩn hóa cấp độ tiếng Việt.
  * `checkCertificateEligibility({ progressPercentage, quizzesTotal, quizzesPassed, labsTotal, labsPassed })`: Chỉ đủ điều kiện khi progress >= 80%, toàn bộ quiz và toàn bộ lab thật đạt.
  * `maskEmail(email)`: Ẩn email (`thie******@gmail.com`).
  * `formatRelativeTime(date)`: Thời gian tương đối tiếng Việt.
  * `detectDocumentIcon(fileType, fileName)`: Auto-detect icon tài liệu theo extension.
  * `formatFileSize(bytes)`: Định dạng kích thước file (`"4.6 MB"`).

---

# L. TÀI LIỆU KỸ THUẬT API MODULE BÁO CÁO VI PHẠM (CONTENT REPORT MODULE)

### 1. Quy ước kết nối & Tiền tố Endpoint
* **Base URL:** `/api/user/reports` (hoặc `/api/v1/user/reports`, `/api/reports`)
* **Header:** `Authorization: Bearer <accessToken>` (Bắt buộc đăng nhập cho các thao tác gửi báo cáo)
* **Tệp nguồn Backend:** `server/src/user/report/report.user.js`
* **Tệp kiểm thử:** `server/src/user/report/test/report.user.test.js`

### 2. Các Quy tắc Nghiệp vụ Cốt lõi (Business Rules)
* **BR-REP-01 (Yêu cầu đăng nhập):** Bắt buộc phải xác thực danh tính để gửi báo cáo, ngăn chặn hành vi gửi rác ẩn danh.
* **BR-REP-02 (Chặn tự báo cáo):** Người dùng không được phép tự báo cáo nội dung do chính mình tạo ra (`reporter_id === author_id` $\rightarrow$ Trả về `400 Bad Request`).
* **BR-REP-03 (Chống trùng lặp 24h):** Mỗi người dùng chỉ được gửi 1 báo cáo cho cùng 1 đối tượng vi phạm trong vòng 24 giờ (`409 Conflict`).
* **BR-REP-04 (Lý do vi phạm chuẩn hóa):** Danh mục lý do hỗ trợ: `spam`, `harassment`, `inappropriate_content`, `hate_speech`, `copyright`, `other`. Nếu chọn `other`, trường `details` bắt buộc phải có tối thiểu 10 ký tự.
* **BR-REP-05 (Cơ chế Ẩn Cá Nhân Hóa - Personalized Filter):** **KHÔNG** làm biến mất nội dung công khai bằng dòng chữ thay thế. Thay vào đó, hệ thống chỉ ẩn nội dung bị báo cáo ra khỏi danh sách của chính người báo cáo (`hide_for_reporter: true`), đồng thời đẩy dữ liệu vào danh sách kiểm duyệt của Admin.
* **BR-REP-06 (Auto-Triage Phân loại Mức độ Khẩn cấp):**
  * `P1 (Critical)`: `hate_speech` hoặc nội dung nhận $\ge 5$ lượt báo cáo.
  * `P2 (High)`: `harassment` hoặc `copyright`.
  * `P3 (Medium)`: `inappropriate_content`.
  * `P4 (Low)`: `spam` hoặc `other`.

---

## L.1. Gửi báo cáo vi phạm (`POST /api/user/reports`)

* **Endpoint:** `POST /api/user/reports`
* **Quyền:** Đăng nhập (`Bearer Token`).
* **Body Request:**
```json
{
  "target_id": "disc_001",
  "target_type": "discussion",
  "reason": "spam",
  "details": "Nội dung quảng cáo cờ bạc lặp đi lặp lại.",
  "attachments": [
    {
      "url": "https://res.cloudinary.com/thinkup/image/upload/proof1.png",
      "name": "screenshot_proof.png",
      "type": "image"
    }
  ]
}
```

| Trường | Kiểu | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `target_id` | `string` | ✅ | ID của đối tượng bị báo cáo (thảo luận, câu hỏi Q&A, đánh giá, v.v.) |
| `target_type` | `string` | ❌ | Loại đối tượng: `discussion` (mặc định), `qna`, `review`, `comment` |
| `reason` | `string` | ✅ | Lý do: `spam`, `harassment`, `inappropriate_content`, `hate_speech`, `copyright`, `other` |
| `details` | `string` | ❌ | Chi tiết bổ sung (Bắt buộc $\ge 10$ ký tự nếu `reason === 'other'`) |
| `attachments` | `Array` | ❌ | Danh sách hình ảnh, video hoặc tài liệu bằng chứng đính kèm |

* **Phản hồi thành công (`201 Created`):**
```json
{
  "success": true,
  "message": "Báo cáo của bạn đã được tiếp nhận và chuyển đến ban quản trị để kiểm duyệt.",
  "data": {
    "report_id": "rep_1729000000000_abcde",
    "target_id": "disc_001",
    "target_type": "discussion",
    "status": "pending",
    "priority": "P4",
    "hide_for_reporter": true,
    "attachments_count": 1,
    "created_at": "2026-10-28T02:00:00.000Z"
  }
}
```

---

## L.2. Kiểm tra trạng thái đã báo cáo (`GET /api/user/reports/check`)

* **Endpoint:** `GET /api/user/reports/check?target_id=:id`
* **Quyền:** Đăng nhập (`Bearer Token`).
* **Mục đích:** FE kiểm tra xem người dùng hiện tại đã báo cáo mục này chưa để hiển thị trạng thái nút (ví dụ: đã báo cáo thì disable hoặc hiển thị "Đã gửi phản ánh").
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "target_id": "disc_001",
    "has_reported": true,
    "reported_at": "2026-10-28T02:00:00.000Z",
    "status": "pending"
  }
}
```

---

## L.3. Lấy danh sách ID đã báo cáo để ẩn trên FE (`GET /api/user/reports/hidden-ids`)

* **Endpoint:** `GET /api/user/reports/hidden-ids?target_type=discussion`
* **Quyền:** Đăng nhập (`Bearer Token`).
* **Phản hồi thành công (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "target_ids": ["disc_001", "rev_999"]
  }
}
```



