// Authored questions for preparation, never generated from learner requests.
// Each row contains a question, the correct answer, three distractors and an explanation.
export const QUESTION_CONTENT = {
  NextJS: [
    ['Trong Next.js App Router, file nào khai báo trang của một route?', 'page.tsx', 'index.css', 'package.json', 'middleware.css', 'App Router dùng file page để khai báo nội dung trang tại một segment.'],
    ['Component nào trong App Router có thể đọc dữ liệu phía server mà không đưa mã truy cập CSDL vào bundle client?', 'Server Component', 'Mọi Client Component', 'Một thẻ iframe', 'Một CSS Module', 'Server Component được thực thi phía server.'],
    ['Chỉ thị nào đánh dấu ranh giới Client Component cần dùng state hoặc sự kiện trình duyệt?', 'use client', 'use browser only', 'use html', 'use css', 'Chỉ thị use client khai báo ranh giới mã chạy phía client.'],
    ['File layout.tsx trong App Router thường phục vụ mục đích nào?', 'Dùng chung bố cục cho các route con', 'Lưu mật khẩu người dùng', 'Thay thế mọi API endpoint', 'Khai báo index CSDL', 'Layout bao bọc các segment con và dùng chung phần giao diện.'],
    ['Tạo trang tĩnh phù hợp nhất với trường hợp nào?', 'Nội dung công khai ít thay đổi giữa các request', 'Số dư riêng tư phải cập nhật từng request', 'OTP dùng một lần', 'Thông tin phiên đăng nhập bí mật', 'Nội dung công khai ổn định có thể được tạo trước và phân phối qua cache.']
  ],
  Redis: [
    ['TTL của một cache key xác định điều gì?', 'Thời gian key được giữ trước khi hết hạn', 'Số CPU của Redis', 'Số ký tự tối đa trong URL', 'Mật khẩu của người dùng', 'TTL giới hạn thời gian tồn tại của dữ liệu cache.'],
    ['Trong cache-aside, khi cache miss thì ứng dụng thường làm gì?', 'Đọc nguồn dữ liệu rồi cập nhật cache', 'Trả dữ liệu ngẫu nhiên', 'Xóa toàn bộ CSDL', 'Bỏ qua quyền truy cập', 'Nguồn dữ liệu chính được đọc khi cache chưa có kết quả.'],
    ['Sau khi cập nhật dữ liệu nguồn, hành động nào giúp tránh đọc cache cũ?', 'Vô hiệu hóa hoặc cập nhật cache liên quan', 'Giữ cache vô thời hạn', 'Chỉ đổi màu giao diện', 'Tắt kiểm tra lỗi', 'Cache cần được đồng bộ hoặc vô hiệu hóa theo dữ liệu nguồn.'],
    ['Cách nào giúp giảm cache stampede khi nhiều request cùng cache miss?', 'Gộp yêu cầu tải hoặc dùng khóa có thời hạn', 'Tất cả request cùng truy vấn nguồn không giới hạn', 'Bỏ TTL của khóa', 'Xóa dữ liệu nguồn', 'Gộp yêu cầu hoặc khóa có hạn giúp hạn chế tải trùng lặp.'],
    ['Redis Pub/Sub có tự lưu toàn bộ tin để subscriber đang offline đọc lại không?', 'Không, subscriber cần online khi tin được phát', 'Có, luôn giữ vĩnh viễn', 'Có, thay thế transaction SQL', 'Có, tự tạo backup cho mọi subscriber', 'Redis Pub/Sub không cung cấp lưu trữ và phát lại tin cho subscriber offline.']
  ],
  GraphQL: [
    ['Thành phần nào định nghĩa các kiểu dữ liệu và operation công khai của GraphQL?', 'Schema', 'CSS selector', 'Docker volume', 'Git stash', 'Schema xác định hợp đồng kiểu dữ liệu và operation GraphQL.'],
    ['Operation GraphQL nào thường dùng để thay đổi dữ liệu?', 'Mutation', 'Fragment chỉ đọc', 'Query introspection', 'Selection set rỗng', 'Mutation biểu diễn các thao tác thay đổi dữ liệu.'],
    ['Resolver có trách nhiệm chính nào?', 'Cung cấp giá trị cho một trường theo request', 'Tự bỏ mọi kiểm tra quyền', 'Thay đổi kiểu của mọi field tùy ý', 'Biên dịch CSS', 'Resolver giải quyết dữ liệu của trường; quyền truy cập vẫn phải được kiểm tra.'],
    ['N+1 query trong GraphQL thường xuất hiện khi nào?', 'Mỗi phần tử cha lại truy vấn riêng dữ liệu con', 'Chỉ có một truy vấn được batch', 'Mọi trường đều là scalar đã có sẵn', 'Schema không có field nào', 'Resolver con gọi truy vấn riêng cho từng cha có thể gây N+1.'],
    ['Cách nào thường giảm N+1 trong resolver?', 'Batch và cache truy vấn trong phạm vi request', 'Tắt xác thực', 'Lưu tất cả kết quả riêng tư vào cache công khai', 'Tăng số query con vô hạn', 'Batch các khóa và cache theo request giảm truy vấn lặp mà không trộn dữ liệu người dùng.']
  ],
  Docker: [
    ['Docker image khác container ở điểm nào?', 'Image là khuôn đóng gói; container là phiên chạy từ image', 'Image luôn là máy ảo đang chạy', 'Container chỉ là file CSS', 'Image chứa duy nhất log', 'Container được khởi tạo từ image cùng cấu hình runtime.'],
    ['Multi-stage build có lợi ích chính nào?', 'Tách công cụ build khỏi image runtime', 'Đưa mọi secret vào image', 'Bắt buộc tăng kích thước image', 'Tự bỏ kiểm tra mã nguồn', 'Tách build và runtime giúp image cuối chỉ chứa các tài nguyên cần chạy.'],
    ['Cơ chế nào lưu dữ liệu tách khỏi vòng đời container?', 'Volume', 'Một biến cục bộ trong tiến trình', 'Tên tag của image', 'Một lớp CSS', 'Volume tồn tại độc lập với writable layer của container.'],
    ['Docker Compose thường mô tả điều gì?', 'Các dịch vụ cùng mạng, volume và cấu hình chạy', 'Lịch sử Git commit', 'Đáp án quiz của học viên', 'Cấu trúc DOM', 'Compose khai báo các dịch vụ và tài nguyên liên quan của một ứng dụng.'],
    ['Nên cung cấp secret cho container như thế nào?', 'Qua cơ chế secret hoặc cấu hình runtime được kiểm soát', 'Commit vào Dockerfile', 'Ghi công khai vào image label', 'In ra log mỗi request', 'Secret không nên bị đóng gói hoặc công khai trong image và log.']
  ],
  'CI/CD': [
    ['Continuous Integration chủ yếu hỗ trợ việc gì?', 'Tích hợp thay đổi thường xuyên kèm kiểm tra tự động', 'Chỉ copy file thủ công khi hết dự án', 'Bỏ qua mọi kiểm tra', 'Thay thế quản lý phiên bản', 'CI giúp phát hiện sớm vấn đề khi tích hợp thay đổi.'],
    ['Một bước kiểm tra bắt buộc thất bại thì pipeline triển khai nên làm gì?', 'Dừng trước khi phát hành thay đổi không đạt', 'Luôn bỏ qua lỗi', 'Xóa lịch sử build', 'Tắt xác thực production', 'Điều kiện kiểm tra bắt buộc bảo vệ chất lượng bản phát hành.'],
    ['Artifact được build một lần rồi đưa qua các môi trường giúp ích gì?', 'Giảm khác biệt giữa bản đã kiểm tra và bản phát hành', 'Đảm bảo không cần kiểm tra nữa', 'Cho phép công khai secret', 'Loại bỏ mọi khả năng lỗi', 'Cùng artifact giúp kiểm soát bản được kiểm tra và triển khai.'],
    ['Rollback trong triển khai nhằm mục đích gì?', 'Khôi phục phiên bản hoạt động trước đó khi bản mới gặp lỗi', 'Tự xóa toàn bộ dữ liệu học viên', 'Ẩn mọi cảnh báo', 'Bỏ quản lý phiên bản', 'Rollback giúp khôi phục dịch vụ khi có sự cố phát hành.'],
    ['Secret của pipeline nên được quản lý ở đâu?', 'Kho secret có kiểm soát quyền truy cập', 'Trong repository công khai', 'Trong URL tải artifact công khai', 'Trong log build', 'Kho secret hạn chế người và job có thể đọc thông tin nhạy cảm.']
  ],
  AWS: [
    ['Nguyên tắc least privilege yêu cầu điều gì?', 'Chỉ cấp quyền cần cho tác vụ', 'Mọi dịch vụ đều dùng quyền quản trị', 'Công khai access key', 'Tắt kiểm tra quyền', 'Least privilege giới hạn phạm vi và hậu quả của truy cập.'],
    ['Cách nào phù hợp để ứng dụng trên AWS nhận quyền truy cập dịch vụ?', 'Dùng IAM role với quyền phù hợp', 'Hardcode access key vào source công khai', 'Dùng mật khẩu người dùng cho mọi dịch vụ', 'Tắt IAM', 'IAM role cấp quyền cho workload mà không cần nhúng khóa dài hạn vào mã.'],
    ['Security group thường kiểm soát gì?', 'Lưu lượng mạng được phép vào và ra tài nguyên', 'Nội dung Git commit', 'Thứ tự đáp án quiz', 'Cỡ font của ứng dụng', 'Security group là cơ chế kiểm soát lưu lượng mạng ở tài nguyên được gắn.'],
    ['Vì sao không nên đặt bucket chứa dữ liệu riêng tư ở chế độ public?', 'Có thể làm lộ dữ liệu cho người không được cấp quyền', 'Public luôn mã hóa tốt hơn', 'Private không hỗ trợ tải file', 'Public bắt buộc cho mọi ứng dụng', 'Quyền public có thể cho phép truy cập dữ liệu ngoài phạm vi cho phép.'],
    ['Triển khai trên nhiều Availability Zone thường cải thiện điều gì?', 'Khả năng chịu sự cố ở một vùng khả dụng', 'Loại bỏ hoàn toàn mọi sự cố', 'Thay thế backup', 'Cho phép bỏ monitoring', 'Phân bố qua nhiều AZ giảm phụ thuộc vào một vùng khả dụng, vẫn cần backup và giám sát.']
  ]
};
