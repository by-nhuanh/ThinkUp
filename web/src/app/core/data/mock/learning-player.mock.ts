import { CommunityPost, LearningCourse } from '../../../features/learning/models/learning.model';

// TODO(pre-deploy): Nhớ xóa dữ liệu bài học mẫu này khi Learning API chính thức được tích hợp qua LearningService.
export const MOCK_LEARNING_COURSE: LearningCourse = {
  id: 'responsive-web-design', title: 'Thiết kế Web Responsive từ cơ bản đến nâng cao', instructor: 'Nguyễn Văn Anh', progress: 38,
  chapters: [
    { id: 'chapter-1', title: 'Chương 1: Nền tảng Responsive Web', lessons: [
      { id: 'video-intro', title: '1.1 Responsive Web Design là gì?', type: 'video', duration: '08:32', status: 'completed', completionThreshold: 0.8, videoUrl: 'https://res.cloudinary.com/x7v2ofnh/video/upload/v1783877512/thinkup_courses_videos/Demo_Thinkup_krnnlm.mp4' },
      { id: 'reading-viewport', title: '1.2 Viewport và đơn vị đo linh hoạt', type: 'reading', duration: '10:00', reading: { lead: 'Viewport là vùng hiển thị nội dung của trang web trên thiết bị. Hiểu đúng viewport là nền tảng để xây dựng một giao diện thích ứng tốt ở mọi kích thước màn hình.', sections: [
        { title: 'Tại sao viewport quan trọng?', paragraphs: ['Trên máy tính, trình duyệt có vùng hiển thị rộng. Trên laptop hoặc điện thoại, cùng một nội dung phải được sắp xếp lại để vẫn dễ đọc và dễ thao tác.', 'Thẻ meta viewport giúp trình duyệt sử dụng đúng chiều rộng thiết bị thay vì thu nhỏ toàn bộ trang.'], bullets: ['Sử dụng width=device-width.', 'Đặt initial-scale=1.', 'Tránh chiều rộng cố định cho khối nội dung chính.'] },
        { title: 'Đơn vị tương đối', paragraphs: ['%, rem, em, vw và clamp() giúp kích thước co giãn trong giới hạn hợp lý. Với chữ, clamp() đặc biệt hữu ích để giữ cùng một hệ phân cấp ở màn hình laptop và desktop.'], bullets: ['rem cho typography và khoảng cách dùng chung.', '% và minmax() cho grid linh hoạt.', 'clamp() để đặt giá trị tối thiểu, linh hoạt và tối đa.'] }
      ] } },
      { id: 'quiz-basics', title: '1.3 Quiz: Kiểm tra kiến thức', type: 'quiz', duration: '15:00', status: 'failed', quiz: { timeLimit: 15, passingScore: 70, questions: [
        { id: 'q1', text: 'Thuộc tính nào giúp khai báo vùng nhìn theo chiều rộng thiết bị?', options: [{id:'a',text:'width=device-width'},{id:'b',text:'display=device'},{id:'c',text:'screen=responsive'},{id:'d',text:'device=viewport'}], correctOptionId: 'a' },
        { id: 'q2', text: 'Đơn vị nào dựa trên kích thước font gốc của tài liệu?', options: [{id:'a',text:'px'},{id:'b',text:'rem'},{id:'c',text:'vw'},{id:'d',text:'%'}], correctOptionId: 'b' },
        { id: 'q3', text: 'Hàm CSS nào đặt được giá trị tối thiểu và tối đa?', options: [{id:'a',text:'calc()'},{id:'b',text:'var()'},{id:'c',text:'clamp()'},{id:'d',text:'minmax-width()'}], correctOptionId: 'c' }
      ] } }
    ] },
    { id: 'chapter-2', title: 'Chương 2: Media Queries và Layout', lessons: [
      { id: 'video-media', title: '2.1 Làm chủ Media Queries', type: 'video', duration: '12:15', completionThreshold: 0.8, videoUrl: 'https://res.cloudinary.com/x7v2ofnh/video/upload/v1783877512/thinkup_courses_videos/Demo_Thinkup_krnnlm.mp4' },
      { id: 'reading-grid', title: '2.2 CSS Grid linh hoạt', type: 'reading', duration: '12:00', reading: { lead: 'CSS Grid cho phép mô tả bố cục hai chiều rõ ràng và thích ứng.', sections: [{ title: 'Grid tự thích ứng', paragraphs: ['Kết hợp repeat(), auto-fit và minmax() để số cột tự thay đổi theo không gian còn lại.'], bullets: ['Ưu tiên minmax(0, 1fr) để tránh tràn.', 'Dùng gap thay cho margin giữa các phần tử.'] }] } }
    ] }
  ]
};

// TODO(pre-deploy): Nhớ xóa nội dung cộng đồng mẫu khi backend cung cấp API hỏi đáp và thảo luận.
export const MOCK_QA_POSTS: CommunityPost[] = [
  { id:'qa-1', author:'Minh Hoàng', initials:'MH', body:'Em chưa hiểu khi nào nên dùng rem thay vì em. Thầy giải thích thêm giúp em được không ạ?', createdAt:'2 giờ trước', likes:12, resolved:true, replies:[{id:'r-1',author:'Nguyễn Văn Anh · Giảng viên',initials:'NA',body:'rem dựa trên font-size của phần tử gốc, còn em dựa trên phần tử cha. Với hệ thống thiết kế, rem thường dễ kiểm soát hơn.',createdAt:'1 giờ trước',likes:8}] }
];
export const MOCK_DISCUSSION_POSTS: CommunityPost[] = [
  { id:'d-1', author:'Lan Phương', initials:'LP', body:'Mọi người thường chọn breakpoint theo thiết bị hay theo lúc bố cục bắt đầu bị vỡ?', createdAt:'Hôm nay, 09:20', likes:18, replies:[{id:'r-2',author:'Tuấn Kiệt',initials:'TK',body:'Mình chọn theo nội dung. Thu nhỏ trình duyệt đến khi bố cục không còn thoải mái thì đặt breakpoint.',createdAt:'Hôm nay, 09:35',likes:5},{id:'r-3',author:'Nguyễn Văn Anh',initials:'NA',role:'instructor',body:'Đúng rồi, breakpoint nên xuất phát từ lúc nội dung bắt đầu mất cân bằng thay vì tên thiết bị.',createdAt:'Hôm nay, 09:42',likes:7}] },
  { id:'d-2', author:'Nguyễn Văn Anh', initials:'NA', role:'instructor', body:'Khi dùng clamp() cho tiêu đề, hãy luôn đặt giới hạn tối thiểu và tối đa để giữ hệ phân cấp nhất quán.', createdAt:'Hôm qua, 16:10', likes:9, replies:[] }
];

