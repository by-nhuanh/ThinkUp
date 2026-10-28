import {
  CommunityPost,
  CourseDocument,
  CourseReviewSummary,
  DashboardQuestion,
  LabConfig,
  LearningCourse,
  LearningResource,
  QuizConfig,
  ReadingConfig,
  ReportReason,
} from '../../../features/learning/models/learning.model';

// TODO(pre-deploy): Nhớ xóa dữ liệu bài học mẫu này khi Learning API chính thức được tích hợp qua LearningService.
const VIDEO_DEMO = 'https://res.cloudinary.com/x7v2ofnh/video/upload/v1783877512/thinkup_courses_videos/Demo_Thinkup_krnnlm.mp4';

const READING_INTRO: ReadingConfig = {
  lead: 'Python là ngôn ngữ lập trình bậc cao, dễ đọc và dễ học. Trong bài đọc này, bạn sẽ hiểu Python được dùng ở đâu, cách trình thông dịch hoạt động và chuẩn bị môi trường để bắt đầu viết những dòng code đầu tiên.',
  sections: [
    {
      title: 'Python được sử dụng ở đâu?',
      paragraphs: [
        'Python xuất hiện trong phát triển web, phân tích dữ liệu, trí tuệ nhân tạo, tự động hóa và rất nhiều lĩnh vực khác. Cú pháp gần với ngôn ngữ tự nhiên giúp người mới tập trung vào tư duy giải quyết vấn đề thay vì ghi nhớ ký hiệu.',
        'Một chương trình Python được thực thi từ trên xuống dưới bởi trình thông dịch. Bạn có thể chạy từng đoạn nhỏ để kiểm tra ý tưởng trước khi ghép thành chương trình hoàn chỉnh.',
      ],
      bullets: [
        'Dùng Python 3.12 trở lên cho mọi bài học trong khóa này.',
        'Luôn đặt tên biến bằng tiếng Anh, ngắn gọn và có ý nghĩa.',
        'Chạy lại ví dụ sau mỗi lần sửa để quan sát kết quả.',
      ],
      callout: 'Mẹo: Nhấn Shift + Enter trong terminal để chạy lại lệnh vừa dùng mà không phải gõ lại.',
    },
    {
      title: 'Trình thông dịch và môi trường ảo',
      paragraphs: [
        'Mỗi dự án Python nên có một môi trường ảo riêng. Môi trường ảo giữ các gói thư viện độc lập, tránh xung đột phiên bản giữa những dự án khác nhau trên cùng một máy.',
        'Sau khi kích hoạt môi trường ảo, mọi lệnh pip install chỉ ảnh hưởng tới dự án hiện tại. Đây là thói quen quan trọng giúp môi trường làm việc luôn ổn định.',
      ],
      bullets: [
        'Tạo môi trường: python -m venv .venv',
        'Kích hoạt trên Windows: .venv\\Scripts\\activate',
        'Kích hoạt trên macOS/Linux: source .venv/bin/activate',
      ],
    },
  ],
};

const QUIZ_BASICS: QuizConfig = {
  timeLimit: 15,
  passingScore: 70,
  questions: [
    {
      id: 'q1',
      text: 'Cú pháp nào dùng để in một giá trị ra màn hình trong Python 3?',
      options: [
        { id: 'a', text: 'print("Hello")' },
        { id: 'b', text: 'echo "Hello"' },
        { id: 'c', text: 'console.log("Hello")' },
        { id: 'd', text: 'printf("Hello")' },
      ],
      correctOptionId: 'a',
    },
    {
      id: 'q2',
      text: 'Kiểu dữ liệu nào phù hợp để lưu danh sách sinh viên?',
      options: [
        { id: 'a', text: 'int' },
        { id: 'b', text: 'list' },
        { id: 'c', text: 'bool' },
        { id: 'd', text: 'None' },
      ],
      correctOptionId: 'b',
    },
    {
      id: 'q3',
      text: 'Hàm nào trả về độ dài của một chuỗi?',
      options: [
        { id: 'a', text: 'count()' },
        { id: 'b', text: 'size()' },
        { id: 'c', text: 'len()' },
        { id: 'd', text: 'length()' },
      ],
      correctOptionId: 'c',
    },
    {
      id: 'q4',
      text: 'Cách viết chú thích một dòng trong Python là gì?',
      options: [
        { id: 'a', text: '// chú thích' },
        { id: 'b', text: '<!-- chú thích -->' },
        { id: 'c', text: '# chú thích' },
        { id: 'd', text: '/* chú thích */' },
      ],
      correctOptionId: 'c',
    },
    {
      id: 'q5',
      text: 'Kết quả của 7 // 2 là bao nhiêu?',
      options: [
        { id: 'a', text: '3.5' },
        { id: 'b', text: '3' },
        { id: 'c', text: '4' },
        { id: 'd', text: 'Lỗi cú pháp' },
      ],
      correctOptionId: 'b',
    },
    {
      id: 'q6',
      text: 'Từ khóa nào dùng để định nghĩa hàm?',
      options: [
        { id: 'a', text: 'function' },
        { id: 'b', text: 'func' },
        { id: 'c', text: 'def' },
        { id: 'd', text: 'define' },
      ],
      correctOptionId: 'c',
    },
    {
      id: 'q7',
      text: 'Giá trị nào là kiểu boolean?',
      options: [
        { id: 'a', text: '"True"' },
        { id: 'b', text: 'True' },
        { id: 'c', text: '1' },
        { id: 'd', text: 'null' },
      ],
      correctOptionId: 'b',
    },
    {
      id: 'q8',
      text: 'Cấu trúc nào dùng để lặp qua một danh sách?',
      options: [
        { id: 'a', text: 'for item in items:' },
        { id: 'b', text: 'for (item of items)' },
        { id: 'c', text: 'foreach item in items' },
        { id: 'd', text: 'loop items' },
      ],
      correctOptionId: 'a',
    },
    {
      id: 'q9',
      text: 'Hàm input() trả về kiểu dữ liệu gì?',
      options: [
        { id: 'a', text: 'int' },
        { id: 'b', text: 'str' },
        { id: 'c', text: 'float' },
        { id: 'd', text: 'list' },
      ],
      correctOptionId: 'b',
    },
    {
      id: 'q10',
      text: 'Cách cài đặt thư viện bằng pip?',
      options: [
        { id: 'a', text: 'pip get requests' },
        { id: 'b', text: 'npm install requests' },
        { id: 'c', text: 'pip install requests' },
        { id: 'd', text: 'python install requests' },
      ],
      correctOptionId: 'c',
    },
  ],
};

const QUIZ_DATA: QuizConfig = {
  timeLimit: 12,
  passingScore: 70,
  questions: [
    {
      id: 'd1',
      text: 'Kiểu dữ liệu nào lưu được nhiều giá trị và có thể thay đổi?',
      options: [
        { id: 'a', text: 'tuple' },
        { id: 'b', text: 'list' },
        { id: 'c', text: 'str' },
        { id: 'd', text: 'int' },
      ],
      correctOptionId: 'b',
    },
    {
      id: 'd2',
      text: 'Kết quả của len("ThinkUp") là gì?',
      options: [
        { id: 'a', text: '6' },
        { id: 'b', text: '7' },
        { id: 'c', text: '8' },
        { id: 'd', text: 'Lỗi' },
      ],
      correctOptionId: 'b',
    },
    {
      id: 'd3',
      text: 'Cách chuyển chuỗi "5" thành số nguyên?',
      options: [
        { id: 'a', text: 'int("5")' },
        { id: 'b', text: 'str(5)' },
        { id: 'c', text: 'float("5")' },
        { id: 'd', text: 'number("5")' },
      ],
      correctOptionId: 'a',
    },
    {
      id: 'd4',
      text: 'None trong Python đại diện cho điều gì?',
      options: [
        { id: 'a', text: 'Số 0' },
        { id: 'b', text: 'Chuỗi rỗng' },
        { id: 'c', text: 'Không có giá trị' },
        { id: 'd', text: 'Sai (False)' },
      ],
      correctOptionId: 'c',
    },
    {
      id: 'd5',
      text: 'Cú pháp f-string nào đúng?',
      options: [
        { id: 'a', text: 'f"Xin chào {name}"' },
        { id: 'b', text: '"Xin chào {name}"f' },
        { id: 'c', text: 'f("Xin chào {name}")' },
        { id: 'd', text: '"Xin chào " + f{name}' },
      ],
      correctOptionId: 'a',
    },
    {
      id: 'd6',
      text: 'Từ khóa nào dùng để thoát vòng lặp ngay lập tức?',
      options: [
        { id: 'a', text: 'continue' },
        { id: 'b', text: 'pass' },
        { id: 'c', text: 'break' },
        { id: 'd', text: 'return' },
      ],
      correctOptionId: 'c',
    },
    {
      id: 'd7',
      text: 'Cấu trúc nào xử lý ngoại lệ?',
      options: [
        { id: 'a', text: 'try / except' },
        { id: 'b', text: 'if / else' },
        { id: 'c', text: 'for / in' },
        { id: 'd', text: 'def / return' },
      ],
      correctOptionId: 'a',
    },
    {
      id: 'd8',
      text: 'Từ khóa nào dùng để kế thừa lớp trong Python?',
      options: [
        { id: 'a', text: 'extends' },
        { id: 'b', text: 'implements' },
        { id: 'c', text: 'Khai báo lớp con trong ngoặc: class B(A):' },
        { id: 'd', text: 'inherits' },
      ],
      correctOptionId: 'c',
    },
  ],
};

const LAB_WRAP: LabConfig = {
  language: 'python',
  fileName: 'main.py',
  taskTitle: 'Viết hàm wrap() trong Python',
  instructions: [
    {
      heading: 'Đề bài',
      paragraphs: [
        'Trong bài lab này, bạn sẽ viết hàm Python có tên wrap(text), nhận vào một chuỗi và trả về chuỗi đó được bọc trong thẻ <p>. Đây là kiểu bài luyện tập xử lý chuỗi và giá trị trả về của hàm.',
        'Code khởi tạo đã có sẵn phần khai báo hàm. Nhiệm vụ của bạn là hoàn thiện phần thân hàm để trả về kết quả đúng yêu cầu.',
      ],
      code: 'def wrap(text: str) -> str:\n    # Viết code của bạn ở đây\n    return text',
      note: 'Ví dụ: wrap("Hello") phải trả về "<p>Hello</p>".',
    },
    {
      heading: 'Yêu cầu',
      bullets: [
        'Giữ nguyên nội dung chuỗi đầu vào.',
        'Không thêm khoảng trắng hoặc ký tự thừa ngoài thẻ <p>.',
        'Hàm phải trả về chuỗi, không in kết quả ra màn hình.',
      ],
    },
    {
      heading: 'Gợi ý',
      paragraphs: [
        'Bạn có thể dùng nối chuỗi hoặc f-string để tạo kết quả. Hãy chạy thử để kiểm tra từng test case trước khi nộp bài.',
      ],
    },
  ],
  starterCode: 'def wrap(text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
  tests: [
    { id: 't1', name: 'Kiểm thử 1', input: '"Hello"', expected: '<p>Hello</p>' },
    { id: 't2', name: 'Kiểm thử 2', input: '"ThinkUp"', expected: '<p>ThinkUp</p>' },
    { id: 't3', name: 'Kiểm thử 3', input: '""', expected: '<p></p>' },
    { id: 't4', name: 'Kiểm thử 4', input: '"A&B"', expected: '<p>A&B</p>' },
    { id: 't5', name: 'Kiểm thử 5', input: '"Xin chào"', expected: '<p>Xin chào</p>' },
    { id: 't6', name: 'Kiểm thử 6', input: '123', expected: '<p>123</p>' },
    { id: 't7', name: 'Kiểm thử 7', input: '" "', expected: '<p> </p>' },
    { id: 't8', name: 'Kiểm thử 8', input: '"Python"', expected: '<p>Python</p>' },
    { id: 't9', name: 'Kiểm thử 9', input: '"Lab"', expected: '<p>Lab</p>' },
    { id: 't10', name: 'Kiểm thử 10', input: '"ThinkUp Lab"', expected: '<p>ThinkUp Lab</p>' },
  ],
  solutions: [
    {
      id: 'basic',
      label: 'Cách 1 · Cơ bản',
      description: 'Dùng nối chuỗi trực tiếp, dễ đọc và phù hợp với người mới.',
      code: 'def wrap(text: str) -> str:\n    return "<p>" + str(text) + "</p>"',
      pros: ['Tách từng phần rõ ràng, phù hợp người mới.'],
      cons: ['Dài hơn so với các cách viết hiện đại.'],
    },
    {
      id: 'fstring',
      label: 'Cách 2 · F-string',
      description: 'Dùng f-string để nội suy giá trị, ngắn gọn và dễ đọc.',
      code: 'def wrap(text: str) -> str:\n    return f"<p>{text}</p>"',
      pros: ['Ngắn gọn, dễ đọc, là cách viết được khuyến nghị trong Python 3.'],
      cons: ['Cần chú ý nếu chuỗi chứa ký tự đặc biệt.'],
    },
    {
      id: 'format',
      label: 'Cách 3 · Format',
      description: 'Dùng str.format() khi cần tương thích với mã nguồn cũ.',
      code: 'def wrap(text: str) -> str:\n    return "<p>{}</p>".format(text)',
      pros: ['Tương thích rộng với các phiên bản Python cũ.'],
      cons: ['Dài hơn f-string và khó đọc hơn khi có nhiều biến.'],
    },
  ],
};

const LAB_HEADING: LabConfig = {
  language: 'python',
  fileName: 'main.py',
  taskTitle: 'Tạo thẻ heading HTML',
  instructions: [
    {
      heading: 'Đề bài',
      paragraphs: ['Viết hàm create_heading(level, text) trả về thẻ heading HTML tương ứng. level nằm trong khoảng 1 đến 6.'],
      code: 'def create_heading(level: int, text: str) -> str:\n    pass',
      note: 'Ví dụ: create_heading(2, "Hello") trả về <h2>Hello</h2>',
    },
  ],
  starterCode: 'def create_heading(level: int, text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
  tests: [
    { id: 'h1', name: 'Kiểm thử 1', input: '2, "Hello"', expected: '<h2>Hello</h2>', actual: '<h2>Hello</h2>', passed: true },
    { id: 'h2', name: 'Kiểm thử 2', input: '1, "ThinkUp"', expected: '<h1>ThinkUp</h1>', actual: '<h1>ThinkUp</h1>', passed: true },
    { id: 'h3', name: 'Kiểm thử 3', input: '6, "End"', expected: '<h6>End</h6>' },
  ],
  solutions: [
    {
      id: 'basic',
      label: 'Cách 1 · Cơ bản',
      description: 'Ghép thẻ bằng nối chuỗi.',
      code: 'def create_heading(level: int, text: str) -> str:\n    return "<h" + str(level) + ">" + str(text) + "</h" + str(level) + ">"',
      pros: ['Rõ ràng từng bước.'],
      cons: ['Nhiều phép nối chuỗi.'],
    },
    {
      id: 'fstring',
      label: 'Cách 2 · F-string',
      description: 'Dùng f-string cho cả thẻ mở và thẻ đóng.',
      code: 'def create_heading(level: int, text: str) -> str:\n    return f"<h{level}>{text}</h{level}>"',
      pros: ['Ngắn gọn và dễ bảo trì.'],
      cons: ['Không kiểm tra level hợp lệ.'],
    },
    {
      id: 'compact',
      label: 'Cách 3 · Tối giản',
      description: 'Kèm kiểm tra đầu vào và trả về chuỗi rỗng khi level sai.',
      code: 'def create_heading(level: int, text: str) -> str:\n    if not 1 <= level <= 6:\n        return ""\n    return f"<h{level}>{text}</h{level}>"',
      pros: ['An toàn với dữ liệu đầu vào không hợp lệ.'],
      cons: ['Cần thêm một nhánh điều kiện.'],
    },
  ],
};

export const MOCK_LEARNING_COURSE: LearningCourse = {
  id: 'python-co-ban',
  title: 'Python Cơ Bản Cho Người Mới Bắt Đầu',
  instructor: 'Trần Minh Hiếu',
  instructorTitle: 'Senior Python Developer',
  progress: 27,
  description:
    'Khóa học dành cho người mới bắt đầu, giúp bạn nắm vững nền tảng Python từ cơ bản đến nâng cao thông qua các ví dụ thực tế.',
  coverGradient: 'linear-gradient(163deg, #041348 0%, #01052c 100%)',
  coverLabel: 'PY',
  rating: 4.8,
  ratingCount: 1234,
  studentCount: 120456,
  chapters: [
    {
      id: 'chapter-1',
      title: 'Phần 1: Giới thiệu',
      lessons: [
        { id: 'lesson-1-1', order: 1, title: 'Giới thiệu khóa học và lộ trình', type: 'video', duration: '06:24', completed: true, status: 'done', videoUrl: VIDEO_DEMO, summary: 'Tổng quan mục tiêu khóa học, cấu trúc lộ trình và cách học hiệu quả trên ThinkUp.' },
        { id: 'lesson-1-2', order: 2, title: 'Cài đặt Python và môi trường lập trình', type: 'video', duration: '12:30', completed: true, status: 'done', videoUrl: VIDEO_DEMO, summary: 'Cài đặt Python 3.12, VS Code và tạo môi trường ảo cho dự án đầu tiên.' },
        { id: 'lesson-1-3', order: 3, title: 'Python là gì?', type: 'reading', duration: '10 phút', completed: true, status: 'done', reading: READING_INTRO, summary: 'Tìm hiểu Python, trình thông dịch và cách chuẩn bị môi trường học tập.' },
        { id: 'lesson-1-4', order: 4, title: 'Quiz: Kiểm tra kiến thức nền tảng', type: 'quiz', duration: '8 câu', completed: true, status: 'done', summary: 'Bài kiểm tra nhanh giúp củng cố kiến thức nền tảng trước khi sang chương mới.', quiz: QUIZ_DATA },
      ],
    },
    {
      id: 'chapter-2',
      title: 'Chương 2: Biến & kiểu dữ liệu',
      lessons: [
        { id: 'lesson-2-1', order: 5, title: 'Biến và quy tắc đặt tên', type: 'video', duration: '15:30', completed: true, status: 'done', videoUrl: VIDEO_DEMO, summary: 'Cách khai báo biến, quy tắc đặt tên và các lỗi thường gặp.' },
        { id: 'lesson-2-2', order: 6, title: 'Kiểu dữ liệu số và chuỗi', type: 'video', duration: '18:20', status: 'not-started', videoUrl: VIDEO_DEMO, summary: 'Số nguyên, số thực, chuỗi và các phép toán cơ bản trên từng kiểu dữ liệu.' },
        { id: 'lesson-2-3', order: 7, title: 'Lab: Xây dựng hàm wrap()', type: 'lab', duration: '30:00', status: 'failed', summary: 'Thực hành viết hàm trả về đoạn HTML và vượt qua 10 test case.', lab: LAB_WRAP },
        { id: 'lesson-2-4', order: 8, title: 'Tài liệu: F-string và định dạng chuỗi', type: 'reading', duration: '12 phút', status: 'not-started', reading: {
          lead: 'F-string là cách định dạng chuỗi ngắn gọn và dễ đọc nhất trong Python 3. Bài đọc này tổng hợp các mẫu f-string thường dùng khi làm việc với dữ liệu.',
          sections: [
            { title: 'Cú pháp cơ bản', paragraphs: ['F-string bắt đầu bằng tiền tố f và cho phép đặt biểu thức Python trực tiếp trong cặp ngoặc nhọn.'], code: 'name = "ThinkUp"\nprint(f"Xin chào {name}")' },
            { title: 'Định dạng số', paragraphs: ['Bạn có thể chỉ định số chữ số thập phân, dấu phân cách hàng nghìn ngay trong f-string.'], bullets: ['f"{price:,.0f}đ" — thêm dấu phân cách.', 'f"{ratio:.2%}" — hiển thị phần trăm.', 'f"{code:>10}" — căn phải trong 10 ký tự.'] },
          ],
        } },
      ],
    },
    {
      id: 'chapter-3',
      title: 'Chương 3: Cấu trúc điều khiển',
      lessons: [
        { id: 'lesson-3-1', order: 9, title: 'Câu lệnh if / elif / else', type: 'video', duration: '14:10', status: 'not-started', videoUrl: VIDEO_DEMO, summary: 'Điều hướng luồng chương trình với các điều kiện.' },
        { id: 'lesson-3-2', order: 10, title: 'Vòng lặp for và while', type: 'video', duration: '22:05', status: 'not-started', videoUrl: VIDEO_DEMO, summary: 'Lặp qua tập dữ liệu và điều khiển vòng lặp bằng break, continue.' },
        { id: 'lesson-3-3', order: 11, title: 'Quiz: Cấu trúc điều khiển', type: 'quiz', duration: '10 câu', status: 'not-started', quiz: QUIZ_BASICS },
      ],
    },
    {
      id: 'chapter-4',
      title: 'Chương 4: Hàm & module',
      lessons: [
        { id: 'lesson-4-1', order: 12, title: 'Định nghĩa và gọi hàm', type: 'video', duration: '17:45', status: 'not-started', videoUrl: VIDEO_DEMO, summary: 'Tham số, giá trị trả về và phạm vi biến trong hàm.' },
        { id: 'lesson-4-2', order: 13, title: 'Lab: Tạo thẻ heading HTML', type: 'lab', duration: '30:00', status: 'not-started', lab: LAB_HEADING },
      ],
    },
    {
      id: 'chapter-5',
      title: 'Chương 5: Dự án thực tế',
      lessons: [
        { id: 'lesson-5-1', order: 14, title: 'Xây dựng ứng dụng quản lý chi tiêu', type: 'video', duration: '35:00', status: 'not-started', videoUrl: VIDEO_DEMO, summary: 'Áp dụng toàn bộ kiến thức để xây dựng ứng dụng dòng lệnh hoàn chỉnh.' },
        { id: 'lesson-5-2', order: 15, title: 'Bài kiểm tra cuối khóa', type: 'quiz', duration: '10 câu', status: 'failed', quiz: QUIZ_BASICS },
      ],
    },
  ],
};

// TODO(pre-deploy): Nhớ xóa dữ liệu mẫu này khi backend cung cấp API đánh giá khóa học.
export const MOCK_COURSE_REVIEWS: CourseReviewSummary = {
  average: 4.8,
  total: 1234,
  distribution: [
    { stars: 5, percent: 85 },
    { stars: 4, percent: 10 },
    { stars: 3, percent: 3 },
    { stars: 2, percent: 1 },
    { stars: 1, percent: 1 },
  ],
  reviews: [
    { id: 'rv-mine', author: 'Bạn', initials: 'B', rating: 5, date: 'Vừa xong', comment: 'Khóa học rất hay, đúng thứ mình đang tìm kiếm! Giao diện Lab xịn.', helpful: 0, mine: true, editing: true },
    { id: 'rv-1', author: 'Trần Thanh Bình', initials: 'B', rating: 5, date: '1 tuần trước', comment: 'Khóa học rất chi tiết, thầy Hiếu dạy siêu có tâm! Mình từ dân kinh tế trái ngành qua học Python mà hiểu bài rất nhanh.', helpful: 24 },
    { id: 'rv-2', author: 'Nguyễn Văn A', initials: 'A', rating: 4, date: '2 tuần trước', comment: 'Phần bài tập Lab chương 5 hơi gắt xíu nha, nhưng bù lại hiểu bản chất vòng lặp luôn. Recommend cho anh em mới bắt đầu.', helpful: 8 },
    { id: 'rv-3', author: 'Lê Thị C', initials: 'C', rating: 5, date: '1 tháng trước', comment: 'Kiến thức trọng tâm, không bị lan man. Giảng dạy trực quan, học dễ và rất dễ tập trung.', helpful: 15 },
    { id: 'rv-4', author: 'Phạm Hoàng Anh', initials: 'P', rating: 5, date: '1 tháng trước', comment: 'Mình là người mới bắt đầu với Python, nhưng khóa học giúp mình nắm vững kiến thức một cách hệ thống. Recommend cho mọi người!', helpful: 11 },
  ],
};

// TODO(pre-deploy): Nhớ xóa dữ liệu cộng đồng mẫu khi backend cung cấp API hỏi đáp và thảo luận.
export const MOCK_QA_POSTS: CommunityPost[] = [
  {
    id: 'qa-1',
    author: 'Minh Hoàng',
    initials: 'MH',
    body: 'Em chưa hiểu khi nào nên dùng rem thay vì em. Thầy giải thích thêm giúp em được không ạ?',
    createdAt: '2 giờ trước',
    likes: 12,
    resolved: true,
    replies: [
      {
        id: 'r-1',
        author: 'Nguyễn Văn Anh',
        initials: 'NA',
        role: 'Giảng viên',
        body: 'rem dựa trên font-size của phần tử gốc, còn em dựa trên phần tử cha. Với hệ thống thiết kế, rem thường dễ kiểm soát hơn.',
        createdAt: '1 giờ trước',
        likes: 8,
      },
    ],
  },
];

export const MOCK_DISCUSSION_POSTS: CommunityPost[] = [
  {
    id: 'd-1',
    author: 'Nguyễn Văn B',
    initials: 'NB',
    role: 'Học viên',
    body: 'Mình đang bị lỗi NameError: name "x" is not defined khi chạy đoạn code này, không biết là do đâu nhỉ? Ai có thể hướng dẫn giúp mình với ạ!',
    createdAt: '12/04/2024 14:30',
    likes: 12,
    replies: [
      {
        id: 'dr-1',
        author: 'Trần Minh Hiếu',
        initials: 'MH',
        role: 'Giảng viên',
        body: 'Bạn kiểm tra lại xem biến x đã được khai báo trước khi dùng chưa nhé. Nếu x được khai báo trong một hàm thì phạm vi của nó chỉ nằm trong hàm đó thôi.',
        createdAt: '12/04/2024 15:10',
        likes: 6,
      },
      {
        id: 'dr-2',
        author: 'Lê Thị Bích',
        initials: 'LB',
        role: 'Học viên',
        body: 'Bạn thử đặt print(x) ngay sau dòng gán giá trị để kiểm tra nhé.',
        createdAt: '12/04/2024 15:22',
        likes: 3,
      },
    ],
  },
  {
    id: 'd-2',
    author: 'Lê Thị Bích',
    initials: 'LB',
    role: 'Học viên',
    body: 'Có bạn nào có tài liệu tổng hợp các hàm built-in trong Python không ạ? Mình cảm ơn!',
    createdAt: '12/04/2024 13:15',
    likes: 8,
    replies: [],
  },
  {
    id: 'd-3',
    author: 'Nguyễn Văn A',
    initials: 'NA',
    role: 'Học viên',
    body: 'Mình vừa hoàn thành bài Lab tuần này. Cảm ơn thầy vì phần gợi ý phương án tối ưu, giúp mình hiểu cách viết code ngắn gọn hơn nhiều.',
    createdAt: '11/04/2024 09:40',
    likes: 19,
    replies: [
      {
        id: 'dr-3',
        author: 'Trần Minh Hiếu',
        initials: 'MH',
        role: 'Giảng viên',
        body: 'Chúc mừng em! Hãy thử áp dụng cách viết tối giản cho các bài tập tiếp theo để hình thành phản xạ tốt nhé.',
        createdAt: '11/04/2024 10:05',
        likes: 9,
      },
    ],
  },
  {
    id: 'd-4',
    author: 'Phạm Hoàng Anh',
    initials: 'PA',
    role: 'Học viên',
    body: 'Mọi người thường chọn breakpoint theo thiết bị hay theo lúc bố cục bắt đầu bị vỡ? Mình đang làm dự án đầu tiên nên hơi phân vân.',
    createdAt: '10/04/2024 20:12',
    likes: 18,
    replies: [],
  },
];

export const MOCK_LESSON_RESOURCES: LearningResource[] = [
  { id: 'res-1', title: 'Slide bài giảng – Python cơ bản', meta: 'PDF', size: '2.4 MB' },
  { id: 'res-2', title: 'Bộ bài tập thực hành chương 2', meta: 'ZIP', size: '860 KB' },
  { id: 'res-3', title: 'Cheat sheet cú pháp Python', meta: 'PDF', size: '1.1 MB' },
];

export const MOCK_REPORT_REASONS: ReportReason[] = [
  { id: 'irrelevant', label: 'Nội dung không phù hợp', description: 'Nội dung phản cảm, bạo lực, khiêu dâm, hoặc vi phạm thuần phong mỹ tục.', tone: 'danger' },
  { id: 'spam', label: 'Spam hoặc quảng cáo', description: 'Nội dung quảng cáo, spam, hoặc không liên quan đến khóa học.', tone: 'spam' },
  { id: 'misleading', label: 'Thông tin sai lệch', description: 'Nội dung chứa thông tin sai, gây hiểu nhầm hoặc không chính xác.', tone: 'warning' },
  { id: 'privacy', label: 'Vi phạm bản quyền', description: 'Nội dung sao chép, vi phạm bản quyền tài liệu, hình ảnh hoặc video.', tone: 'copyright' },
  { id: 'harassment', label: 'Hành vi quấy rối', description: 'Nội dung có tính chất quấy rối, phân biệt đối xử hoặc công kích cá nhân.', tone: 'harassment' },
  { id: 'other', label: 'Lý do khác', description: 'Các lý do khác không được liệt kê ở trên.', tone: 'neutral' },
];

// TODO(pre-deploy): Nhớ xóa dữ liệu tài liệu mẫu khi backend cung cấp API kho tài liệu khóa học.
const EXTRA_DOCUMENT_TOPICS = [
  'Chuỗi và các phương thức xử lý chuỗi',
  'Danh sách và tuple',
  'Dictionary và set',
  'Câu lệnh điều kiện nâng cao',
  'Vòng lặp và comprehension',
  'Hàm và tham số',
  'Module và package',
  'Xử lý lỗi và ngoại lệ',
  'Đọc ghi file',
  'Lớp và đối tượng',
  'Dự án quản lý chi tiêu',
  'Ôn tập cuối khóa',
];

const EXTRA_DOCUMENT_SIZES = ['1.1 MB', '284 KB', '1.6 MB', '328 KB', '2.4 MB', '742 KB'];

export const MOCK_COURSE_DOCUMENTS: CourseDocument[] = [
  { id: 'doc-1', name: 'Giới thiệu về Python.pdf', subtitle: 'Bài 1 - Giới thiệu về Python', category: 'lecture', kind: 'Tài liệu bài giảng', size: '1.2 MB', updated: '12/04/2024', ext: 'pdf' },
  { id: 'doc-2', name: 'code_bai_1_gioi_thieu.zip', subtitle: 'Bài 1 - Giới thiệu về Python', category: 'code', kind: 'Mã nguồn', size: '256 KB', updated: '12/04/2024', ext: 'zip' },
  { id: 'doc-3', name: 'Cài đặt Python và môi trường.pdf', subtitle: 'Bài 2 - Cài đặt Python và môi trường', category: 'lecture', kind: 'Tài liệu bài giảng', size: '1.8 MB', updated: '13/04/2024', ext: 'pdf' },
  { id: 'doc-4', name: 'Bài tập chương 1.docx', subtitle: 'Bài tập chương 1', category: 'exercise', kind: 'Bài tập', size: '312 KB', updated: '13/04/2024', ext: 'docx' },
  { id: 'doc-5', name: 'Slides chương 1.pptx', subtitle: 'Tổng hợp slide chương 1', category: 'lecture', kind: 'Tài liệu bài giảng', size: '3.5 MB', updated: '13/04/2024', ext: 'pptx' },
  { id: 'doc-6', name: 'code_chuong_1.zip', subtitle: 'Mã nguồn chương 1', category: 'code', kind: 'Mã nguồn', size: '892 KB', updated: '14/04/2024', ext: 'zip' },
  { id: 'doc-7', name: 'Biến và kiểu dữ liệu.pdf', subtitle: 'Bài 5 - Biến và kiểu dữ liệu', category: 'lecture', kind: 'Tài liệu bài giảng', size: '1.4 MB', updated: '15/04/2024', ext: 'pdf' },
  { id: 'doc-8', name: 'code_bai_2_bien.zip', subtitle: 'Bài 5 - Biến và kiểu dữ liệu', category: 'code', kind: 'Mã nguồn', size: '184 KB', updated: '15/04/2024', ext: 'zip' },
  { id: 'doc-9', name: 'Bài tập chương 2.docx', subtitle: 'Bài tập chương 2', category: 'exercise', kind: 'Bài tập', size: '268 KB', updated: '16/04/2024', ext: 'docx' },
  { id: 'doc-10', name: 'Slides chương 2.pptx', subtitle: 'Tổng hợp slide chương 2', category: 'lecture', kind: 'Tài liệu bài giảng', size: '2.9 MB', updated: '16/04/2024', ext: 'pptx' },
  { id: 'doc-11', name: 'F-string và định dạng chuỗi.pdf', subtitle: 'Bài 8 - F-string và định dạng chuỗi', category: 'lecture', kind: 'Tài liệu bài giảng', size: '980 KB', updated: '17/04/2024', ext: 'pdf' },
  { id: 'doc-12', name: 'code_chuong_2.zip', subtitle: 'Mã nguồn chương 2', category: 'code', kind: 'Mã nguồn', size: '746 KB', updated: '17/04/2024', ext: 'zip' },
  ...Array.from({ length: 36 }, (_, index): CourseDocument => {
    const lesson = index + 13;
    const topic = EXTRA_DOCUMENT_TOPICS[index % EXTRA_DOCUMENT_TOPICS.length];
    const day = String(18 + Math.floor(index / 4)).padStart(2, '0');
    const size = EXTRA_DOCUMENT_SIZES[index % EXTRA_DOCUMENT_SIZES.length];
    const variant = index % 4;

    if (variant === 0) {
      return {
        id: `doc-${lesson}`,
        name: `${topic} - Bài ${lesson}.pdf`,
        subtitle: `Bài ${lesson}: ${topic}`,
        category: 'lecture',
        kind: 'Tài liệu bài giảng',
        size,
        updated: `${day}/04/2024`,
        ext: 'pdf',
      };
    }

    if (variant === 1) {
      return {
        id: `doc-${lesson}`,
        name: `code_bai_${lesson}.zip`,
        subtitle: `Bài ${lesson}: ${topic}`,
        category: 'code',
        kind: 'Mã nguồn',
        size,
        updated: `${day}/04/2024`,
        ext: 'zip',
      };
    }

    if (variant === 2) {
      return {
        id: `doc-${lesson}`,
        name: `Bài tập bài ${lesson}.docx`,
        subtitle: `Bài ${lesson}: ${topic}`,
        category: 'exercise',
        kind: 'Bài tập',
        size,
        updated: `${day}/04/2024`,
        ext: 'docx',
      };
    }

    return {
      id: `doc-${lesson}`,
      name: `Slides bài ${lesson}.pptx`,
      subtitle: `Bài ${lesson}: ${topic}`,
      category: 'lecture',
      kind: 'Tài liệu bài giảng',
      size,
      updated: `${day}/04/2024`,
      ext: 'pptx',
    };
  }),
];

// TODO(pre-deploy): Nhớ xóa dữ liệu hỏi đáp mẫu khi backend cung cấp API hỏi đáp khóa học.
export const MOCK_COURSE_QUESTIONS: DashboardQuestion[] = [
  {
    id: 'dq-1',
    author: 'Bạn',
    initials: 'B',
    role: 'Học viên',
    date: '12/04/2024 14:30',
    body: 'Thầy ơi, em không hiểu sự khác nhau giữa list và tuple trong Python. Thầy có thể giải thích giúp em được không ạ?',
    relatedLessonTitle: 'Bài 6: Kiểu dữ liệu trong Python',
    replies: [
      {
        author: 'Trần Minh Hiếu',
        initials: 'MH',
        role: 'Giảng viên',
        date: '12/04/2024 15:02',
        body: 'Chào bạn! List là một tập hợp có thể thay đổi (mutable), cho phép thêm, xóa, sửa phần tử. Tuple là một tập hợp không thể thay đổi (immutable), sau khi tạo thì không thể thay đổi các phần tử bên trong. Bạn có thể xem thêm ví dụ ở bài 6 trong tài liệu nhé!',
        relatedLessonTitle: 'Bài 6: Kiểu dữ liệu trong Python',
      },
      {
        author: 'Bạn',
        initials: 'B',
        role: 'Học viên',
        date: '12/04/2024 15:15',
        body: 'Dạ em hiểu rồi, cảm ơn thầy rất nhiều ạ!',
        relatedLessonTitle: 'Bài 8: Hàm trong Python',
      },
    ],
  },
  {
    id: 'dq-2',
    author: 'Minh Hoàng',
    initials: 'MH',
    role: 'Học viên',
    date: '11/04/2024 09:20',
    body: 'Em muốn hỏi cách đặt tên biến sao cho đúng chuẩn PEP 8 ạ?',
    relatedLessonTitle: 'Bài 5: Biến và quy tắc đặt tên',
    replies: [],
  },
];
