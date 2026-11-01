import {
  CommunityPost,
  CourseDocument,
  CourseReviewSummary,
  DashboardQuestion,
  LabConfig,
  LabExercise,
  LabLeaderboardEntry,
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

interface LabExerciseSpec {
  title: string;
  intro: string;
  task: string;
  example: string;
  expected: string;
  starter: string;
  tests: [string, string][];
  solution: string;
}

const LEADERBOARD_NAMES = [
  { name: 'xmonke******', initials: 'XM', color: '#F97316' },
  { name: 'kwanh', initials: 'KW', color: '#0EA5E9' },
  { name: 'd.a.n_3002', initials: 'DN', color: '#8B5CF6' },
  { name: 'hkimph******', initials: 'HK', color: '#22C55E' },
  { name: 'khoapa3', initials: 'KP', color: '#EAB308' },
  { name: 'hoanganh_h...', initials: 'HA', color: '#EC4899' },
  { name: 'az9thon******', initials: 'AZ', color: '#14B8A6' },
  { name: 'nqtrung2k', initials: 'NQ', color: '#6366F1' },
];

const buildLeaderboard = (seed: number): LabLeaderboardEntry[] =>
  LEADERBOARD_NAMES.map((entry, index) => ({
    id: `lb-${seed}-${index + 1}`,
    rank: index + 1,
    name: entry.name,
    initials: entry.initials,
    color: entry.color,
    score: index < 3 ? 100 : 100 - index * 2 - ((seed - 1) % 3),
    attempts: index < 4 ? 1 + ((seed - 1) % 2) : 2 + ((seed - 1) % 2),
    execTime: `${38 + index * 6 + seed * 2} - ${38 + index * 6 + seed * 2}`,
    submittedAt: `${20 + (index % 4)}:${((10 + index * 7 + seed) % 60).toString().padStart(2, '0')} ${14 + ((seed + index) % 13)}/02/2026`,
    medal: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : undefined,
  }));

const buildLabExercises = (prefix: string, language: string, specs: LabExerciseSpec[]): LabExercise[] =>
  specs.map((spec, index) => ({
    id: `${prefix}-ex-${index + 1}`,
    order: index + 1,
    title: spec.title,
    language,
    knowledge: [
      {
        heading: 'Giới thiệu về kiểu bài viết hàm trên ThinkUp',
        paragraphs: [spec.intro],
      },
    ],
    task: [
      { heading: 'Bài tập', paragraphs: [spec.task] },
      { heading: 'Ví dụ', code: spec.example },
      { heading: 'Kết quả mong đợi', note: spec.expected },
      { heading: 'Code khởi tạo', code: spec.starter.trimEnd() },
    ],
    starterCode: spec.starter,
    tests: spec.tests.map(([input, expected], testIndex) => ({
      id: `${prefix}-${index + 1}-t${testIndex + 1}`,
      name: `Kiểm thử ${testIndex + 1}`,
      input,
      expected,
    })),
    solutions: [
      {
        id: 'reference',
        label: 'Cách 1 · Tham khảo',
        description: 'Lời giải tham khảo cho bài tập này.',
        code: spec.solution,
        pros: ['Ngắn gọn, dễ đọc.'],
        cons: ['Chưa xử lý dữ liệu đầu vào không hợp lệ.'],
      },
    ],
    leaderboard: buildLeaderboard(index + 1),
    submissions: [],
  }));

// TODO(pre-deploy): Nhớ xóa dữ liệu bài tập lab mẫu này khi Lab API chính thức được tích hợp.
const LAB_WRAP_EXERCISES = buildLabExercises('wrap', 'python', [
  {
    title: 'Bài 1: Bọc chuỗi trong thẻ đoạn văn',
    intro:
      'Hàm trong Python nhận tham số đầu vào và trả về kết quả. Với bài lab HTML, kết quả trả về là một chuỗi HTML hợp lệ để hệ thống hiển thị.',
    task: 'Viết hàm `wrap(text)` trả về chuỗi `text` được bọc trong cặp thẻ `<p>`.',
    example: 'def wrap(text: str) -> str:\n    return "<p>" + text + "</p>"',
    expected: 'wrap("Hello") trả về <p>Hello</p>',
    starter: 'def wrap(text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"Hello"', '<p>Hello</p>'],
      ['"ThinkUp"', '<p>ThinkUp</p>'],
      ['""', '<p></p>'],
      ['"A&B"', '<p>A&B</p>'],
      ['"Xin chào"', '<p>Xin chào</p>'],
    ],
    solution: 'def wrap(text: str) -> str:\n    return f"<p>{text}</p>"',
  },
  {
    title: 'Bài 2: Thêm class cho thẻ đoạn văn',
    intro:
      'Thuộc tính `class` giúp gắn kiểu hiển thị cho một thẻ HTML. Giá trị class luôn được đặt trong dấu ngoặc kép.',
    task: 'Viết hàm `wrap_class(text, css_class)` trả về `<p class="css_class">text</p>`.',
    example: 'def wrap_class(text: str, css_class: str) -> str:\n    return f\'<p class="{css_class}">{text}</p>\'',
    expected: 'wrap_class("Hi", "note") trả về <p class="note">Hi</p>',
    starter: 'def wrap_class(text: str, css_class: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"Hi", "note"', '<p class="note">Hi</p>'],
      ['"Xin chào", "lead"', '<p class="lead">Xin chào</p>'],
      ['"A", ""', '<p class="">A</p>'],
      ['"B", "text-sm"', '<p class="text-sm">B</p>'],
    ],
    solution: 'def wrap_class(text: str, css_class: str) -> str:\n    return f\'<p class="{css_class}">{text}</p>\'',
  },
  {
    title: 'Bài 3: Ghép nhiều đoạn văn',
    intro:
      'Vòng lặp `for` duyệt qua từng phần tử của danh sách. Nối kết quả của từng vòng lặp lại sẽ tạo ra một chuỗi HTML hoàn chỉnh.',
    task: 'Viết hàm `paragraphs(items)` nhận danh sách chuỗi và trả về các thẻ `<p>` nối liền nhau.',
    example: 'def paragraphs(items: list[str]) -> str:\n    return "".join(f"<p>{item}</p>" for item in items)',
    expected: 'paragraphs(["A", "B"]) trả về <p>A</p><p>B</p>',
    starter: 'def paragraphs(items: list[str]) -> str:\n    # Viết code của bạn ở đây\n    return ""\n',
    tests: [
      ['["A", "B"]', '<p>A</p><p>B</p>'],
      ['["Xin chào"]', '<p>Xin chào</p>'],
      ['[]', ''],
      ['["1", "2", "3"]', '<p>1</p><p>2</p><p>3</p>'],
    ],
    solution: 'def paragraphs(items: list[str]) -> str:\n    return "".join(f"<p>{item}</p>" for item in items)',
  },
  {
    title: 'Bài 4: In đậm nội dung',
    intro:
      'Thẻ `<strong>` biểu diễn nội dung quan trọng. Hàm chỉ cần trả về chuỗi, không in ra màn hình.',
    task: 'Viết hàm `strong(text)` trả về `<strong>text</strong>`.',
    example: 'def strong(text: str) -> str:\n    return f"<strong>{text}</strong>"',
    expected: 'strong("Quan trọng") trả về <strong>Quan trọng</strong>',
    starter: 'def strong(text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"Quan trọng"', '<strong>Quan trọng</strong>'],
      ['"Note"', '<strong>Note</strong>'],
      ['""', '<strong></strong>'],
    ],
    solution: 'def strong(text: str) -> str:\n    return f"<strong>{text}</strong>"',
  },
  {
    title: 'Bài 5: In nghiêng nội dung',
    intro:
      'Thẻ `<em>` dùng cho nhấn mạnh ngữ nghĩa. Cách ghép chuỗi tương tự bài trước.',
    task: 'Viết hàm `emphasis(text)` trả về `<em>text</em>`.',
    example: 'def emphasis(text: str) -> str:\n    return f"<em>{text}</em>"',
    expected: 'emphasis("Lưu ý") trả về <em>Lưu ý</em>',
    starter: 'def emphasis(text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"Lưu ý"', '<em>Lưu ý</em>'],
      ['"abc"', '<em>abc</em>'],
      ['""', '<em></em>'],
    ],
    solution: 'def emphasis(text: str) -> str:\n    return f"<em>{text}</em>"',
  },
  {
    title: 'Bài 6: Tạo thẻ liên kết',
    intro:
      'Thẻ `<a>` cần thuộc tính `href` để trỏ tới địa chỉ đích. Thứ tự thuộc tính không ảnh hưởng tới kết quả hiển thị.',
    task: 'Viết hàm `link(href, text)` trả về `<a href="href">text</a>`.',
    example: 'def link(href: str, text: str) -> str:\n    return f\'<a href="{href}">{text}</a>\'',
    expected: 'link("/khoa-hoc", "Khóa học") trả về <a href="/khoa-hoc">Khóa học</a>',
    starter: 'def link(href: str, text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"/khoa-hoc", "Khóa học"', '<a href="/khoa-hoc">Khóa học</a>'],
      ['"https://thinkup.vn", "ThinkUp"', '<a href="https://thinkup.vn">ThinkUp</a>'],
      ['"#", "Đầu trang"', '<a href="#">Đầu trang</a>'],
    ],
    solution: 'def link(href: str, text: str) -> str:\n    return f\'<a href="{href}">{text}</a>\'',
  },
  {
    title: 'Bài 7: Tạo thẻ hình ảnh',
    intro:
      'Thẻ `<img>` là thẻ tự đóng, không có nội dung bên trong. Thuộc tính `alt` mô tả hình ảnh cho trình đọc màn hình.',
    task: 'Viết hàm `image(src, alt)` trả về `<img src="src" alt="alt">`.',
    example: 'def image(src: str, alt: str) -> str:\n    return f\'<img src="{src}" alt="{alt}">\'',
    expected: 'image("/a.png", "Ảnh A") trả về <img src="/a.png" alt="Ảnh A">',
    starter: 'def image(src: str, alt: str) -> str:\n    # Viết code của bạn ở đây\n    return ""\n',
    tests: [
      ['"/a.png", "Ảnh A"', '<img src="/a.png" alt="Ảnh A">'],
      ['"/logo.svg", "Logo"', '<img src="/logo.svg" alt="Logo">'],
      ['"/x.jpg", ""', '<img src="/x.jpg" alt="">'],
    ],
    solution: 'def image(src: str, alt: str) -> str:\n    return f\'<img src="{src}" alt="{alt}">\'',
  },
  {
    title: 'Bài 8: Tạo danh sách không thứ tự',
    intro:
      'Một danh sách gồm thẻ `<ul>` bao ngoài và nhiều thẻ `<li>` bên trong. Mỗi phần tử là một mục của danh sách.',
    task: 'Viết hàm `list_items(items)` trả về `<ul>` chứa các `<li>` tương ứng.',
    example: 'def list_items(items: list[str]) -> str:\n    body = "".join(f"<li>{item}</li>" for item in items)\n    return f"<ul>{body}</ul>"',
    expected: 'list_items(["A", "B"]) trả về <ul><li>A</li><li>B</li></ul>',
    starter: 'def list_items(items: list[str]) -> str:\n    # Viết code của bạn ở đây\n    return ""\n',
    tests: [
      ['["A", "B"]', '<ul><li>A</li><li>B</li></ul>'],
      ['["Xin chào"]', '<ul><li>Xin chào</li></ul>'],
      ['[]', '<ul></ul>'],
    ],
    solution: 'def list_items(items: list[str]) -> str:\n    body = "".join(f"<li>{item}</li>" for item in items)\n    return f"<ul>{body}</ul>"',
  },
  {
    title: 'Bài 9: Tạo một dòng bảng',
    intro:
      'Bảng HTML gồm `<tr>` cho dòng và `<td>` cho từng ô. Số ô trong dòng phải khớp với số cột của bảng.',
    task: 'Viết hàm `table_row(cells)` trả về `<tr>` chứa các `<td>` tương ứng.',
    example: 'def table_row(cells: list[str]) -> str:\n    body = "".join(f"<td>{cell}</td>" for cell in cells)\n    return f"<tr>{body}</tr>"',
    expected: 'table_row(["A", "B"]) trả về <tr><td>A</td><td>B</td></tr>',
    starter: 'def table_row(cells: list[str]) -> str:\n    # Viết code của bạn ở đây\n    return ""\n',
    tests: [
      ['["A", "B"]', '<tr><td>A</td><td>B</td></tr>'],
      ['["1"]', '<tr><td>1</td></tr>'],
      ['[]', '<tr></tr>'],
    ],
    solution: 'def table_row(cells: list[str]) -> str:\n    body = "".join(f"<td>{cell}</td>" for cell in cells)\n    return f"<tr>{body}</tr>"',
  },
  {
    title: 'Bài 10: Mã hoá ký tự đặc biệt',
    intro:
      'Ký tự `&`, `<`, `>` có ý nghĩa riêng trong HTML. Để hiển thị chúng như văn bản, cần thay bằng thực thể HTML tương ứng.',
    task: 'Viết hàm `escape_html(text)` thay `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`.',
    example: 'def escape_html(text: str) -> str:\n    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")',
    expected: 'escape_html("<p>") trả về &lt;p&gt;',
    starter: 'def escape_html(text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"<p>"', '&lt;p&gt;'],
      ['"A & B"', 'A &amp; B'],
      ['"Xin chào"', 'Xin chào'],
      ['"<a>&</a>"', '&lt;a&gt;&amp;&lt;/a&gt;'],
    ],
    solution: 'def escape_html(text: str) -> str:\n    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")',
  },
]);

const LAB_HEADING_EXERCISES = buildLabExercises('heading', 'python', [
  {
    title: 'Bài 1: Tạo thẻ heading theo cấp',
    intro:
      'HTML có sáu cấp heading từ `<h1>` tới `<h6>`. Cấp heading quyết định mức quan trọng của tiêu đề.',
    task: 'Viết hàm `create_heading(level, text)` trả về `<h{level}>{text}</h{level}>`.',
    example: 'def create_heading(level: int, text: str) -> str:\n    return f"<h{level}>{text}</h{level}>"',
    expected: 'create_heading(2, "Hello") trả về <h2>Hello</h2>',
    starter: 'def create_heading(level: int, text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['2, "Hello"', '<h2>Hello</h2>'],
      ['1, "ThinkUp"', '<h1>ThinkUp</h1>'],
      ['6, "End"', '<h6>End</h6>'],
      ['3, ""', '<h3></h3>'],
    ],
    solution: 'def create_heading(level: int, text: str) -> str:\n    return f"<h{level}>{text}</h{level}>"',
  },
  {
    title: 'Bài 2: Kiểm tra cấp heading hợp lệ',
    intro:
      'Dữ liệu đầu vào có thể sai. Hàm nên kiểm tra `level` nằm trong khoảng 1 đến 6 trước khi tạo thẻ.',
    task: 'Viết hàm `create_heading_checked(level, text)` trả về chuỗi rỗng nếu `level` không hợp lệ.',
    example: 'def create_heading_checked(level: int, text: str) -> str:\n    if not 1 <= level <= 6:\n        return ""\n    return f"<h{level}>{text}</h{level}>"',
    expected: 'create_heading_checked(9, "Hi") trả về chuỗi rỗng',
    starter: 'def create_heading_checked(level: int, text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['2, "Hi"', '<h2>Hi</h2>'],
      ['0, "Hi"', ''],
      ['7, "Hi"', ''],
      ['6, "End"', '<h6>End</h6>'],
    ],
    solution: 'def create_heading_checked(level: int, text: str) -> str:\n    if not 1 <= level <= 6:\n        return ""\n    return f"<h{level}>{text}</h{level}>"',
  },
  {
    title: 'Bài 3: Heading có id',
    intro:
      'Thuộc tính `id` giúp liên kết tới một vị trí trong trang bằng đường dẫn dạng `#id`.',
    task: 'Viết hàm `heading_with_id(level, text, anchor)` trả về heading kèm thuộc tính `id`.',
    example: 'def heading_with_id(level: int, text: str, anchor: str) -> str:\n    return f\'<h{level} id="{anchor}">{text}</h{level}>\'',
    expected: 'heading_with_id(2, "Giới thiệu", "intro") trả về <h2 id="intro">Giới thiệu</h2>',
    starter: 'def heading_with_id(level: int, text: str, anchor: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['2, "Giới thiệu", "intro"', '<h2 id="intro">Giới thiệu</h2>'],
      ['1, "A", "top"', '<h1 id="top">A</h1>'],
      ['3, "B", ""', '<h3 id="">B</h3>'],
    ],
    solution: 'def heading_with_id(level: int, text: str, anchor: str) -> str:\n    return f\'<h{level} id="{anchor}">{text}</h{level}>\'',
  },
  {
    title: 'Bài 4: Heading có class',
    intro:
      'Class dùng để gắn kiểu hiển thị dùng chung cho nhiều thẻ trong trang.',
    task: 'Viết hàm `heading_with_class(level, text, css_class)` trả về heading kèm `class`.',
    example: 'def heading_with_class(level: int, text: str, css_class: str) -> str:\n    return f\'<h{level} class="{css_class}">{text}</h{level}>\'',
    expected: 'heading_with_class(2, "Tin", "title") trả về <h2 class="title">Tin</h2>',
    starter: 'def heading_with_class(level: int, text: str, css_class: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['2, "Tin", "title"', '<h2 class="title">Tin</h2>'],
      ['1, "A", "hero"', '<h1 class="hero">A</h1>'],
      ['4, "B", ""', '<h4 class="">B</h4>'],
    ],
    solution: 'def heading_with_class(level: int, text: str, css_class: str) -> str:\n    return f\'<h{level} class="{css_class}">{text}</h{level}>\'',
  },
  {
    title: 'Bài 5: Heading kèm phụ đề',
    intro:
      'Một tiêu đề thường đi cùng đoạn mô tả ngắn. Ghép nhiều thẻ lại sẽ tạo thành một khối nội dung hoàn chỉnh.',
    task: 'Viết hàm `heading_block(level, title, subtitle)` trả về heading và một `<p>` phụ đề.',
    example: 'def heading_block(level: int, title: str, subtitle: str) -> str:\n    return f"<h{level}>{title}</h{level}><p>{subtitle}</p>"',
    expected: 'heading_block(2, "A", "B") trả về <h2>A</h2><p>B</p>',
    starter: 'def heading_block(level: int, title: str, subtitle: str) -> str:\n    # Viết code của bạn ở đây\n    return title\n',
    tests: [
      ['2, "A", "B"', '<h2>A</h2><p>B</p>'],
      ['1, "Tin", ""', '<h1>Tin</h1><p></p>'],
      ['3, "", "Phụ"', '<h3></h3><p>Phụ</p>'],
    ],
    solution: 'def heading_block(level: int, title: str, subtitle: str) -> str:\n    return f"<h{level}>{title}</h{level}><p>{subtitle}</p>"',
  },
  {
    title: 'Bài 6: Heading có liên kết neo',
    intro:
      'Liên kết neo giúp người đọc chuyển nhanh tới một mục trong trang. Cần cả `id` ở đích và `href="#id"` ở nguồn.',
    task: 'Viết hàm `anchor_link(anchor, text)` trả về `<a href="#anchor">text</a>`.',
    example: 'def anchor_link(anchor: str, text: str) -> str:\n    return f\'<a href="#{anchor}">{text}</a>\'',
    expected: 'anchor_link("intro", "Giới thiệu") trả về <a href="#intro">Giới thiệu</a>',
    starter: 'def anchor_link(anchor: str, text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"intro", "Giới thiệu"', '<a href="#intro">Giới thiệu</a>'],
      ['"top", "Lên đầu"', '<a href="#top">Lên đầu</a>'],
      ['"", "Trống"', '<a href="#">Trống</a>'],
    ],
    solution: 'def anchor_link(anchor: str, text: str) -> str:\n    return f\'<a href="#{anchor}">{text}</a>\'',
  },
  {
    title: 'Bài 7: Chọn cấp heading theo độ dài',
    intro:
      'Tiêu đề càng ngắn thường là cấp cao hơn. Quy tắc này giúp giữ cấu trúc trang nhất quán.',
    task: 'Viết hàm `auto_heading(text)` trả về `<h1>` nếu text ngắn hơn 20 ký tự, ngược lại `<h2>`.',
    example: 'def auto_heading(text: str) -> str:\n    level = 1 if len(text) < 20 else 2\n    return f"<h{level}>{text}</h{level}>"',
    expected: 'auto_heading("Tin") trả về <h1>Tin</h1>',
    starter: 'def auto_heading(text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['"Tin"', '<h1>Tin</h1>'],
      ['"Một tiêu đề rất dài cho trang chủ"', '<h2>Một tiêu đề rất dài cho trang chủ</h2>'],
      ['""', '<h1></h1>'],
    ],
    solution: 'def auto_heading(text: str) -> str:\n    level = 1 if len(text) < 20 else 2\n    return f"<h{level}>{text}</h{level}>"',
  },
  {
    title: 'Bài 8: Danh sách heading',
    intro:
      'Duyệt danh sách và tạo thẻ cho từng phần tử giúp sinh mục lục tự động.',
    task: 'Viết hàm `heading_list(items)` trả về mỗi phần tử là một `<h3>`.',
    example: 'def heading_list(items: list[str]) -> str:\n    return "".join(f"<h3>{item}</h3>" for item in items)',
    expected: 'heading_list(["A", "B"]) trả về <h3>A</h3><h3>B</h3>',
    starter: 'def heading_list(items: list[str]) -> str:\n    # Viết code của bạn ở đây\n    return ""\n',
    tests: [
      ['["A", "B"]', '<h3>A</h3><h3>B</h3>'],
      ['["Xin chào"]', '<h3>Xin chào</h3>'],
      ['[]', ''],
    ],
    solution: 'def heading_list(items: list[str]) -> str:\n    return "".join(f"<h3>{item}</h3>" for item in items)',
  },
  {
    title: 'Bài 9: Heading có số thứ tự',
    intro:
      'Số thứ tự giúp người đọc theo dõi các mục trong một tài liệu dài. Dùng `enumerate` để lấy chỉ số khi lặp.',
    task: 'Viết hàm `numbered_heading(index, text)` trả về `<h2>{index}. {text}</h2>`.',
    example: 'def numbered_heading(index: int, text: str) -> str:\n    return f"<h2>{index}. {text}</h2>"',
    expected: 'numbered_heading(1, "Giới thiệu") trả về <h2>1. Giới thiệu</h2>',
    starter: 'def numbered_heading(index: int, text: str) -> str:\n    # Viết code của bạn ở đây\n    return text\n',
    tests: [
      ['1, "Giới thiệu"', '<h2>1. Giới thiệu</h2>'],
      ['10, "Kết luận"', '<h2>10. Kết luận</h2>'],
      ['0, ""', '<h2>0. </h2>'],
    ],
    solution: 'def numbered_heading(index: int, text: str) -> str:\n    return f"<h2>{index}. {text}</h2>"',
  },
  {
    title: 'Bài 10: Kiểm tra chuỗi HTML hợp lệ',
    intro:
      'Một chuỗi HTML đúng cần có thẻ mở và thẻ đóng khớp nhau. Kiểm tra đơn giản giúp phát hiện lỗi sớm.',
    task: 'Viết hàm `is_valid_heading(html)` trả về `True` nếu chuỗi bắt đầu bằng `<h` và kết thúc bằng `>` với cặp thẻ khớp.',
    example: 'def is_valid_heading(html: str) -> bool:\n    return html.startswith("<h") and html.endswith(">") and "</h" in html',
    expected: 'is_valid_heading("<h2>A</h2>") trả về True',
    starter: 'def is_valid_heading(html: str) -> bool:\n    # Viết code của bạn ở đây\n    return False\n',
    tests: [
      ['"<h2>A</h2>"', 'True'],
      ['"<p>A</p>"', 'False'],
      ['"<h2>A"', 'False'],
      ['"<h6>B</h6>"', 'True'],
    ],
    solution: 'def is_valid_heading(html: str) -> bool:\n    return html.startswith("<h") and html.endswith(">") and "</h" in html',
  },
]);

const LAB_WRAP: LabConfig = {
  language: 'python',
  fileName: 'main.py',
  taskTitle: 'Viết hàm wrap() trong Python',
  exercises: LAB_WRAP_EXERCISES,
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
  exercises: LAB_HEADING_EXERCISES,
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
