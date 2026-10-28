// TODO(pre-deploy): Nhớ xóa bộ flashcard mock khi backend trả về API flashcard của học viên.
import {
  FlashcardCard,
  FlashcardCardStatus,
  FlashcardSet
} from '../../../../features/roadmap/models/flashcard.model';

type CardSeed = [front: string, back: string, code?: string, note?: string, status?: FlashcardCardStatus];

function makeCards(prefix: string, seeds: CardSeed[]): FlashcardCard[] {
  return seeds.map(([front, back, code, note, status], index) => ({
    id: `${prefix}-card-${index + 1}`,
    front,
    back,
    ...(code ? { code } : {}),
    ...(note ? { note } : {}),
    status: status ?? 'new'
  }));
}

const JS_CARDS: FlashcardCard[] = makeCards('js', [
  [
    'JavaScript là gì?',
    'JavaScript là một ngôn ngữ lập trình kịch bản, được sử dụng để tạo ra các trang web động và tương tác. Nó là một trong những công nghệ cốt lõi của web, cùng với HTML và CSS.',
    'typeof value;',
    'Kiểm tra kiểu dữ liệu của biến.',
    'learned'
  ],
  ['Cách khai báo biến trong JavaScript?', 'Có 3 cách: var, let, const. Trong đó let và const được khuyến khích dùng trong code hiện đại.', 'let name = "An";', 'Khai báo biến có thể gán lại.', 'learned'],
  ['Kiểu dữ liệu trong JavaScript gồm những loại nào?', 'Có 6 kiểu dữ liệu cơ bản: string, number, boolean, null, undefined và symbol (cùng object).', 'const age = 20;', 'Khai báo hằng số tuổi.', 'learned'],
  ['Operator trong JavaScript được chia thành mấy loại?', 'Gồm 7 loại chính: toán tử số học, so sánh, logic, gán, ba ngôi, chuỗi và kiểu.', 'a + b;', 'Cộng hai giá trị số.', 'review'],
  ['Câu lệnh điều kiện trong JavaScript?', 'Sử dụng if, else if, else hoặc switch để điều khiển luồng chạy của chương trình.', 'if (condition) { /* ... */ }', 'Thực hiện nhánh khi điều kiện đúng.', 'review'],
  ['Vòng lặp trong JavaScript có những loại nào?', 'Có 3 loại chính: for, while, do...while. Ngoài ra còn for...of và for...in.', 'for (let i = 0; i < 5; i++) { /* ... */ }', 'Lặp 5 lần với biến đếm i.', 'review'],
  ['Hàm (function) trong JavaScript có vai trò gì?', 'Giúp nhóm các đoạn mã và tái sử dụng chúng, đồng thời chia nhỏ bài toán thành phần dễ đọc hơn.', 'function greet() { /* ... */ }', 'Khai báo hàm greet.', 'new'],
  [
    'Hàm greet("ThinkUp") trả về gì?',
    'Chuỗi "Hello, ThinkUp" — tên truyền vào được nối sau chuỗi "Hello, ".',
    'const greet = (name) => "Hello, " + name;\ngreet("ThinkUp");',
    'Kết quả: Hello, ThinkUp',
    'new'
  ],
  ['Array trong JavaScript là gì?', 'Array là một cấu trúc dữ liệu dùng để lưu trữ nhiều giá trị trong một biến, truy cập theo chỉ số từ 0.', 'const nums = [1, 2, 3];', 'Tạo mảng gồm ba số.', 'new'],
  ['Object trong JavaScript là gì?', 'Object là kiểu dữ liệu dùng để lưu trữ tập hợp các cặp key - value, mô tả một thực thể.', 'const user = { name: "An" };', 'Tạo object với thuộc tính name.', 'new'],
  ['Arrow function khác function thường ở điểm nào?', 'Arrow function có cú pháp ngắn gọn và không có `this` riêng — `this` lấy từ phạm vi bao ngoài.', 'const sum = (a, b) => a + b;', 'Trả về biểu thức a + b.', 'learned'],
  ['Closure trong JavaScript là gì?', 'Closure là hàm ghi nhớ phạm vi nơi nó được tạo, vẫn truy cập được biến bên ngoài sau khi hàm cha đã chạy xong.', 'function counter() {\n  let count = 0;\n  return () => ++count;\n}', 'Mỗi lần gọi trả về tăng dần.', 'learned'],
  ['Promise là gì?', 'Promise đại diện cho một giá trị sẽ có trong tương lai, gồm ba trạng thái: pending, fulfilled và rejected.', 'fetch("/api").then((res) => res.json());', 'Gọi API và đọc JSON.', 'learned'],
  ['async/await dùng để làm gì?', 'async/await giúp viết code bất đồng bộ trông như đồng bộ, dễ đọc hơn chuỗi .then().', 'async function load() {\n  const res = await fetch("/api");\n  return res.json();\n}', 'Chờ response trước khi đọc dữ liệu.', 'learned'],
  ['DOM là gì?', 'DOM (Document Object Model) là cây biểu diễn cấu trúc HTML mà JavaScript có thể đọc và cập nhật.', 'document.querySelector(".card");', 'Chọn phần tử đầu tiên khớp selector.', 'learned'],
  ['Event delegation là gì?', 'Gắn một listener ở phần tử cha để xử lý sự kiện của nhiều phần tử con nhờ cơ chế bubbling, giảm số listener.', 'list.addEventListener("click", handler);', 'Một listener cho cả danh sách.', 'review'],
  ['map, filter, reduce khác nhau thế nào?', 'map biến đổi từng phần tử, filter giữ lại phần tử thoả điều kiện, reduce gộp mảng thành một giá trị.', '[1, 2, 3].map((n) => n * 2);', 'Trả về mảng [2, 4, 6].', 'new'],
  ['So sánh == và === khác nhau ra sao?', '== so sánh sau khi ép kiểu, === so sánh cả giá trị và kiểu dữ liệu. Nên dùng ===.', '1 == "1";  // true\n1 === "1"; // false', 'Khác biệt về kiểu dữ liệu.', 'new'],
  ['var, let, const khác nhau về phạm vi?', 'var có phạm vi function, let/const có phạm vi block. const không cho gán lại nhưng object bên trong vẫn có thể thay đổi.', 'for (let i = 0; i < 3; i++) { /* i chỉ tồn tại trong block */ }', 'let giới hạn trong block.', 'new'],
  ['localStorage và sessionStorage khác nhau thế nào?', 'localStorage lưu lâu dài cho tới khi bị xoá; sessionStorage chỉ tồn tại trong phiên tab hiện tại.', 'localStorage.setItem("token", value);', 'Lưu token phía client.', 'new']
]);

const HTML_CSS_CARDS: FlashcardCard[] = makeCards(
  'html-css',
  [
    ['Thẻ <!DOCTYPE html> dùng để làm gì?', 'Khai báo tài liệu là HTML5, giúp trình duyệt render ở chế độ tiêu chuẩn.', '<!DOCTYPE html>', 'Luôn đặt ở đầu tài liệu.', 'learned'],
    ['Thẻ <head> chứa những gì?', 'Metadata của trang: title, meta charset, viewport, link CSS và các thẻ script cần tải trước.', '<head>\n  <meta charset="utf-8" />\n</head>', 'Khai báo bảng mã UTF-8.', 'learned'],
    ['Sự khác nhau giữa <section> và <article>?', 'section là một vùng nội dung theo chủ đề; article là nội dung có thể đứng độc lập, tái sử dụng.', '<article>\n  <h2>Bài viết</h2>\n</article>', 'Article có thể tách khỏi ngữ cảnh.', 'learned'],
    ['Thuộc tính alt của ảnh dùng để làm gì?', 'Mô tả nội dung ảnh cho screen reader và hiển thị khi ảnh không tải được.', '<img src="hero.png" alt="Học viên đang lập trình" />', 'Alt nên mô tả mục đích ảnh.', 'learned'],
    ['Thẻ <label> liên kết với input như thế nào?', 'Dùng thuộc tính for trỏ tới id của input, hoặc bọc input bên trong label.', '<label for="email">Email</label>\n<input id="email" type="email" />', 'Bấm vào label sẽ focus input.', 'learned'],
    ['Box model gồm những phần nào?', 'Content, padding, border và margin. Mặc định kích thước phần tử chỉ tính content + padding + border khi dùng border-box.', '.box { box-sizing: border-box; }', 'Border-box dễ tính layout hơn.', 'learned'],
    ['Flexbox dùng để làm gì?', 'Bố cục một chiều theo hàng hoặc cột, căn chỉnh và phân phối khoảng trống giữa các phần tử.', '.row { display: flex; gap: 16px; }', 'Gap tạo khoảng cách đều.', 'learned'],
    ['CSS Grid khác Flexbox ở điểm nào?', 'Grid bố cục hai chiều (hàng và cột), Flexbox mạnh nhất ở bố cục một chiều.', '.grid { display: grid; grid-template-columns: repeat(3, 1fr); }', 'Ba cột bằng nhau.', 'learned'],
    ['Specificity trong CSS là gì?', 'Độ ưu tiên của selector: inline > id > class/attribute/pseudo-class > element. Selector càng cụ thể càng thắng.', '.card.is-active { color: #0088E8; }', 'Hai class có specificity cao hơn một.', 'learned'],
    ['Khi nào nên dùng position: absolute?', 'Khi cần đặt phần tử theo phần tử cha gần nhất có position khác static, thường cho badge hoặc overlay.', '.badge { position: absolute; top: 8px; right: 8px; }', 'Cha cần position: relative.', 'learned'],
    ['Biến CSS (custom properties) hoạt động ra sao?', 'Khai báo trong :root hoặc phạm vi component và dùng lại bằng var(--ten-bien), có thể ghi đè theo ngữ cảnh.', ':root { --brand: #0088E8; }\n.button { color: var(--brand); }', 'Token màu dùng lại toàn app.', 'learned'],
    ['Media query dùng để làm gì?', 'Áp dụng CSS theo điều kiện màn hình, ví dụ độ rộng tối thiểu để điều chỉnh layout.', '@media (min-width: 1024px) { /* ... */ }', 'Điểm breakpoint desktop.', 'learned'],
    ['Pseudo-class :focus-visible khác :focus thế nào?', ':focus-visible chỉ hiện khi người dùng điều hướng bằng bàn phím, tránh viền focus khi click chuột.', '.btn:focus-visible { outline: 2px solid #0088E8; }', 'Giữ khả năng truy cập bàn phím.', 'learned'],
    ['Làm sao căn giữa phần tử bằng Flexbox?', 'Dùng justify-content và align-items cùng giá trị center trên container.', '.center { display: flex; align-items: center; justify-content: center; }', 'Căn giữa cả hai trục.', 'learned'],
    ['Thuộc tính z-index hoạt động thế nào?', 'Chỉ so sánh giữa các phần tử trong cùng stacking context; phần tử có z-index lớn hơn nằm trên.', '.modal { position: fixed; z-index: 50; }', 'Modal nằm trên nội dung.', 'learned']
  ]
);

const SQL_CARDS: FlashcardCard[] = makeCards('sql', [
  ['SELECT dùng để làm gì?', 'Truy vấn và lấy dữ liệu từ một hoặc nhiều bảng.', 'SELECT name, email FROM users;', 'Lấy hai cột từ bảng users.', 'learned'],
  ['Mệnh đề WHERE có tác dụng gì?', 'Lọc bản ghi theo điều kiện trước khi trả về kết quả.', 'SELECT * FROM courses WHERE price > 500000;', 'Chỉ lấy khoá học giá trên 500k.', 'learned'],
  ['ORDER BY sắp xếp kết quả như thế nào?', 'Sắp xếp theo một hoặc nhiều cột, mặc định tăng dần; dùng DESC để giảm dần.', 'SELECT * FROM users ORDER BY created_at DESC;', 'Mới nhất lên đầu.', 'learned'],
  ['INNER JOIN khác LEFT JOIN ở đâu?', 'INNER JOIN chỉ lấy bản ghi khớp ở cả hai bảng; LEFT JOIN giữ toàn bộ bảng trái, cột phải NULL nếu không khớp.', 'SELECT u.name, o.total\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id;', 'Giữ cả user chưa có đơn.', 'learned'],
  ['GROUP BY dùng khi nào?', 'Gộp các bản ghi theo cột và thường đi cùng hàm tổng hợp như COUNT, SUM, AVG.', 'SELECT stage_id, COUNT(*) FROM skills GROUP BY stage_id;', 'Đếm kỹ năng theo giai đoạn.', 'learned'],
  ['HAVING khác WHERE thế nào?', 'WHERE lọc trước khi gộp nhóm, HAVING lọc sau khi đã GROUP BY.', 'SELECT stage_id, COUNT(*)\nFROM skills\nGROUP BY stage_id\nHAVING COUNT(*) > 5;', 'Chỉ giữ nhóm có hơn 5 kỹ năng.', 'learned'],
  ['INSERT INTO thêm dữ liệu ra sao?', 'Chỉ định bảng, danh sách cột và các giá trị tương ứng.', 'INSERT INTO users (name, email)\nVALUES ("An", "an@thinkup.vn");', 'Thêm một học viên.', 'learned'],
  ['UPDATE thay đổi dữ liệu như thế nào?', 'Cập nhật cột cho các bản ghi thoả điều kiện WHERE. Thiếu WHERE sẽ cập nhật toàn bộ bảng.', 'UPDATE users SET name = "An" WHERE id = 1;', 'Luôn kiểm tra WHERE trước.', 'learned'],
  ['DELETE khác TRUNCATE ở điểm nào?', 'DELETE xoá theo điều kiện và có thể rollback; TRUNCATE xoá nhanh toàn bộ bảng và thường không rollback.', 'DELETE FROM sessions WHERE expired_at < NOW();', 'Dọn phiên hết hạn.', 'learned'],
  ['Index dùng để làm gì?', 'Tăng tốc truy vấn đọc theo cột được đánh index, đổi lại tốn dung lượng và chậm hơn khi ghi.', 'CREATE INDEX idx_users_email ON users (email);', 'Tìm theo email nhanh hơn.', 'learned'],
  ['Primary key và foreign key khác nhau thế nào?', 'Primary key định danh duy nhất mỗi bản ghi; foreign key tham chiếu tới primary key của bảng khác.', 'FOREIGN KEY (user_id) REFERENCES users(id)', 'Ràng buộc liên kết bảng.', 'new'],
  ['UNIQUE constraint có tác dụng gì?', 'Đảm bảo giá trị trong cột không bị trùng, cho phép nhiều NULL tuỳ hệ quản trị.', 'ALTER TABLE users ADD UNIQUE (email);', 'Mỗi email chỉ một tài khoản.', 'new'],
  ['COUNT(*) và COUNT(column) khác nhau ra sao?', 'COUNT(*) đếm mọi hàng; COUNT(column) bỏ qua các giá trị NULL của cột đó.', 'SELECT COUNT(*), COUNT(phone) FROM users;', 'So sánh số hàng và số phone.', 'new'],
  ['LIMIT và OFFSET dùng để làm gì?', 'Giới hạn số bản ghi trả về và bỏ qua số bản ghi đầu — thường dùng để phân trang.', 'SELECT * FROM courses ORDER BY id LIMIT 10 OFFSET 20;', 'Trang thứ ba, 10 bản ghi.', 'new'],
  ['Transaction là gì?', 'Nhóm nhiều thao tác thành một đơn vị: hoặc tất cả thành công, hoặc rollback toàn bộ khi có lỗi.', 'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nCOMMIT;', 'Đảm bảo tính nhất quán.', 'new'],
  ['Subquery là gì?', 'Một truy vấn lồng bên trong truy vấn khác, dùng ở WHERE, FROM hoặc SELECT.', 'SELECT * FROM courses\nWHERE price > (SELECT AVG(price) FROM courses);', 'Khoá học giá trên trung bình.', 'new'],
  ['UNION và UNION ALL khác nhau thế nào?', 'UNION loại bỏ bản ghi trùng, UNION ALL giữ tất cả và chạy nhanh hơn.', 'SELECT email FROM users\nUNION\nSELECT email FROM leads;', 'Gộp danh sách email.', 'new'],
  ['CASE WHEN dùng để làm gì?', 'Tạo logic điều kiện ngay trong câu truy vấn, tương tự if/else.', 'SELECT name,\n  CASE WHEN score >= 70 THEN "Đạt" ELSE "Cần ôn" END AS result\nFROM tests;', 'Phân loại kết quả bài test.', 'new']
]);

const REACT_CARDS: FlashcardCard[] = makeCards(
  'react',
  [
    ['React là gì?', 'Thư viện JavaScript để xây dựng giao diện người dùng theo hướng component, cập nhật UI hiệu quả nhờ virtual DOM.', 'import { useState } from "react";', 'Hook phổ biến nhất.', 'learned'],
    ['JSX là gì?', 'Cú pháp mở rộng cho phép viết markup giống HTML trong JavaScript, được biên dịch thành lời gọi React.createElement.', 'const el = <h1>Hello</h1>;', 'JSX cần import React ở phiên bản cũ.', 'learned'],
    ['Props là gì?', 'Dữ liệu truyền từ component cha xuống con, chỉ đọc và không nên thay đổi bên trong component con.', '<Card title="React" />', 'Truyền prop title.', 'learned'],
    ['State là gì?', 'Dữ liệu nội bộ của component, thay đổi state sẽ kích hoạt render lại.', 'const [count, setCount] = useState(0);', 'Khởi tạo state bằng 0.', 'learned'],
    ['useEffect dùng để làm gì?', 'Chạy side effect sau khi render: gọi API, đăng ký listener, đồng bộ với hệ thống bên ngoài.', 'useEffect(() => { fetchData(); }, []);', 'Chạy một lần sau mount.', 'learned'],
    ['useMemo và useCallback khác nhau thế nào?', 'useMemo ghi nhớ giá trị tính toán; useCallback ghi nhớ hàm giữa các lần render.', 'const total = useMemo(() => items.length, [items]);', 'Chỉ tính lại khi items đổi.', 'learned'],
    ['useRef dùng khi nào?', 'Giữ giá trị không gây re-render hoặc tham chiếu trực tiếp tới DOM element.', 'const inputRef = useRef<HTMLInputElement>(null);', 'Truy cập input để focus.', 'learned'],
    ['Key trong danh sách có tác dụng gì?', 'Giúp React nhận diện phần tử giữa các lần render, tránh render lại sai phần tử khi danh sách thay đổi.', 'items.map((item) => <Row key={item.id} {...item} />);', 'Key nên là id ổn định.', 'learned'],
    ['Component bị re-render khi nào?', 'Khi state hoặc props thay đổi, hoặc component cha render lại (trừ khi được memo hoá).', 'const Row = memo(function Row() { /* ... */ });', 'memo tránh render lại khi props không đổi.', 'learned'],
    ['Context API giải quyết vấn đề gì?', 'Chia sẻ dữ liệu tới nhiều component mà không cần truyền props qua từng tầng.', 'const ThemeContext = createContext("light");', 'Tạo context với giá trị mặc định.', 'learned'],
    ['Custom hook là gì?', 'Hàm bắt đầu bằng use, đóng gói logic có state để tái sử dụng giữa các component.', 'function useDebounce(value, delay) { /* ... */ }', 'Tách logic debounce.', 'learned'],
    ['useReducer phù hợp khi nào?', 'Khi state phức tạp, nhiều hành động liên quan hoặc lần chuyển trạng thái cần mô tả rõ ràng.', 'const [state, dispatch] = useReducer(reducer, initialState);', 'Quản lý state theo action.', 'learned'],
    ['Lifting state up nghĩa là gì?', 'Đưa state lên component cha gần nhất để nhiều component con cùng chia sẻ và đồng bộ.', 'const [value, setValue] = useState("");', 'Cha giữ state, con nhận props.', 'learned'],
    ['Portal trong React là gì?', 'Render component ra ngoài cây DOM của cha, thường dùng cho modal, tooltip, dropdown.', 'createPortal(<Modal />, document.body);', 'Modal thoát khỏi overflow của cha.', 'learned'],
    ['Error boundary dùng để làm gì?', 'Bắt lỗi trong cây component con và hiển thị UI dự phòng thay vì làm hỏng toàn bộ ứng dụng.', 'class ErrorBoundary extends Component { /* ... */ }', 'Error boundary phải là class.', 'learned'],
    ['React.memo khác useMemo thế nào?', 'React.memo bọc component để tránh re-render; useMemo ghi nhớ một giá trị trong component.', 'export default memo(Card);', 'Bọc component Card.', 'learned'],
    ['So sánh state và props?', 'State do component tự quản lý và có thể thay đổi; props do cha truyền vào và chỉ đọc.', 'setCount((c) => c + 1);', 'Cập nhật state dựa trên giá trị cũ.', 'learned'],
    ['Fragment dùng để làm gì?', 'Nhóm nhiều phần tử mà không thêm node DOM thừa.', '<>\n  <Title />\n  <Body />\n</>', 'Fragment rút gọn.', 'learned'],
    ['StrictMode có tác dụng gì?', 'Bật cảnh báo và kiểm tra bổ sung ở môi trường phát triển, có thể gọi effect hai lần để phát hiện side effect sai.', '<StrictMode>\n  <App />\n</StrictMode>', 'Chỉ ảnh hưởng môi trường dev.', 'learned'],
    ['Lazy loading component trong React?', 'Dùng React.lazy và Suspense để tải component theo nhu cầu, giảm bundle ban đầu.', 'const Page = lazy(() => import("./Page"));', 'Bọc bằng Suspense fallback.', 'learned'],
    ['React Router dùng để làm gì?', 'Quản lý điều hướng SPA, ánh xạ URL tới component và hỗ trợ nested route, guard.', 'const router = createBrowserRouter(routes);', 'Khởi tạo router.', 'learned'],
    ['Controlled component là gì?', 'Form element có giá trị điều khiển bởi state React và cập nhật qua onChange.', '<input value={name} onChange={(e) => setName(e.target.value)} />', 'Value luôn đồng bộ với state.', 'learned'],
    ['Uncontrolled component là gì?', 'Form element giữ giá trị trong DOM, đọc qua ref khi cần thay vì lưu vào state.', 'const ref = useRef<HTMLInputElement>(null);', 'Đọc ref.current.value khi submit.', 'learned'],
    ['Code splitting giúp gì cho hiệu năng?', 'Chia bundle thành nhiều phần nhỏ, chỉ tải phần cần thiết cho route hiện tại.', 'const Checkout = lazy(() => import("./Checkout"));', 'Tải Checkout khi vào route.', 'learned'],
    ['Khi nào nên dùng useLayoutEffect?', 'Khi cần đọc/ghi layout đồng bộ trước khi trình duyệt paint, ví dụ đo kích thước phần tử.', 'useLayoutEffect(() => { measure(); }, []);', 'Ưu tiên useEffect nếu không cần đo layout.', 'learned']
  ]
);

const ALGO_CARDS: FlashcardCard[] = makeCards(
  'algo',
  [
    ['Big O là gì?', 'Ký hiệu mô tả tốc độ tăng của thời gian chạy hoặc bộ nhớ theo kích thước dữ liệu đầu vào.', 'O(1) < O(log n) < O(n) < O(n log n) < O(n²)', 'Thứ tự từ nhanh tới chậm.', 'learned'],
    ['Array và Linked List khác nhau thế nào?', 'Array truy cập theo chỉ số O(1) nhưng chèn/xoá giữa O(n); Linked List chèn/xoá O(1) khi đã có node nhưng truy cập O(n).', 'const next = node.next;', 'Linked List duyệt qua next.', 'learned'],
    ['Stack hoạt động theo nguyên tắc nào?', 'LIFO — phần tử vào sau cùng ra đầu tiên. Dùng cho undo, call stack, kiểm tra ngoặc.', 'stack.push(item); stack.pop();', 'Push và pop ở cùng một đầu.', 'learned'],
    ['Queue hoạt động theo nguyên tắc nào?', 'FIFO — phần tử vào trước ra trước. Dùng cho hàng đợi xử lý, BFS.', 'queue.push(item); queue.shift();', 'Thêm cuối, lấy đầu.', 'learned'],
    ['Hash Table là gì?', 'Cấu trúc lưu key-value, dùng hàm băm để tìm vị trí, trung bình O(1) cho tìm/chèn/xoá.', 'const map = new Map();\nmap.set("a", 1);', 'Map trong JavaScript.', 'learned'],
    ['Binary Search hoạt động ra sao?', 'Tìm trên mảng đã sắp xếp bằng cách chia đôi phạm vi mỗi bước, độ phức tạp O(log n).', 'while (left <= right) {\n  const mid = (left + right) >> 1;\n}', 'mid dùng dịch bit để chia đôi.', 'learned'],
    ['Bubble Sort có độ phức tạp bao nhiêu?', 'Trung bình và xấu nhất O(n²), tốt nhất O(n) khi mảng đã sắp xếp và có cờ dừng sớm.', 'for (let i = 0; i < n - 1; i++) { /* ... */ }', 'So sánh các cặp kề nhau.', 'learned'],
    ['Merge Sort hoạt động thế nào?', 'Chia mảng đôi, sắp xếp từng nửa rồi trộn lại; luôn O(n log n) nhưng cần bộ nhớ phụ.', 'mergeSort(left); mergeSort(right); merge(left, right);', 'Chia để trị.', 'learned'],
    ['BFS và DFS khác nhau ở đâu?', 'BFS duyệt theo từng lớp dùng queue; DFS đi sâu tối đa dùng stack/đệ quy.', 'const queue = [start];', 'BFS dùng queue.', 'learned'],
    ['Cây nhị phân tìm kiếm (BST) là gì?', 'Cây mà mọi node trái nhỏ hơn node gốc, mọi node phải lớn hơn; tìm kiếm trung bình O(log n).', 'if (value < node.value) goLeft();', 'So sánh để chọn nhánh.', 'learned'],
    ['Đệ quy là gì?', 'Hàm gọi lại chính nó với bài toán nhỏ hơn, cần có điều kiện dừng để tránh lặp vô hạn.', 'function fact(n) {\n  return n <= 1 ? 1 : n * fact(n - 1);\n}', 'Tính giai thừa.', 'learned'],
    ['Two Pointers dùng khi nào?', 'Khi cần duyệt mảng đã sắp xếp với hai chỉ số để giảm từ O(n²) xuống O(n).', 'let left = 0, right = arr.length - 1;', 'Hai đầu mảng tiến vào nhau.', 'learned'],
    ['Sliding Window là gì?', 'Kỹ thuật giữ một cửa sổ liên tiếp và trượt qua mảng để tính lại kết quả mà không duyệt lại toàn bộ.', 'let sum = 0;\nfor (let i = 0; i < k; i++) sum += arr[i];', 'Tính tổng cửa sổ đầu tiên.', 'review'],
    ['Dynamic Programming là gì?', 'Chia bài toán thành bài toán con chồng lấp, lưu kết quả đã tính để tránh lặp lại.', 'const dp = new Array(n + 1).fill(0);', 'Mảng lưu kết quả từng bước.', 'review'],
    ['Độ phức tạp bộ nhớ của đệ quy phụ thuộc gì?', 'Phụ thuộc độ sâu call stack, thường O(n) với đệ quy tuyến tính.', 'fact(n - 1);', 'Mỗi lời gọi chiếm một frame.', 'new'],
    ['Khi nào dùng Set thay vì Array?', 'Khi cần kiểm tra tồn tại nhanh và không cần thứ tự hay phần tử trùng.', 'const seen = new Set();', 'Kiểm tra trùng trong O(1).', 'new'],
    ['Tại sao nên sắp xếp trước khi dùng Binary Search?', 'Binary Search chỉ đúng khi dữ liệu đã có thứ tự, nếu không sẽ loại sai nửa phạm vi.', 'arr.sort((a, b) => a - b);', 'Sắp xếp tăng dần.', 'new'],
    ['Heap là gì?', 'Cây nhị phân hoàn chỉnh giữ tính chất heap, dùng cho priority queue và tìm min/max nhanh.', 'heap.push(value); heap.pop();', 'Thêm và lấy phần tử ưu tiên.', 'new'],
    ['Độ phức tạp của việc chèn vào đầu Array?', 'O(n) vì phải dịch toàn bộ phần tử phía sau sang một vị trí.', 'arr.unshift(item);', 'unshift là thao tác O(n).', 'new'],
    ['Graph có thể biểu diễn bằng cách nào?', 'Danh sách kề (adjacency list) hoặc ma trận kề (adjacency matrix).', 'const graph = new Map();', 'Adjacency list tiết kiệm bộ nhớ.', 'new'],
    ['Topological Sort dùng cho bài toán gì?', 'Sắp xếp các đỉnh của đồ thị có hướng không chu trình (DAG) theo thứ tự phụ thuộc.', 'const order = [];', 'Ví dụ thứ tự học kỹ năng.', 'new'],
    ['Tại sao Hash Table có thể suy biến O(n)?', 'Khi nhiều key băm vào cùng bucket, các phần tử dồn thành danh sách dài.', 'hash(key) % buckets;', 'Hàm băm tốt giảm va chạm.', 'new'],
    ['BFS tìm đường đi ngắn nhất trên đồ thị không trọng số như thế nào?', 'BFS duyệt theo lớp nên lần đầu chạm đích chính là đường đi ngắn nhất tính theo số cạnh.', 'queue.push([start, 0]);', 'Lưu kèm khoảng cách.', 'new'],
    ['Đệ quy và vòng lặp nên chọn cái nào?', 'Đệ quy dễ đọc với bài toán chia để trị; vòng lặp tiết kiệm bộ nhớ và tránh tràn stack.', 'while (stack.length) { /* ... */ }', 'Mô phỏng đệ quy bằng stack.', 'new'],
    ['Độ phức tạp của Quick Sort?', 'Trung bình O(n log n), xấu nhất O(n²) khi pivot luôn là phần tử nhỏ/lớn nhất.', 'quickSort(arr, 0, arr.length - 1);', 'Chọn pivot tốt để tránh xấu nhất.', 'new'],
    ['Tại sao cần kiểm tra biên trong thuật toán?', 'Tránh truy cập ngoài mảng, chia cho 0 hoặc lặp vô hạn khi dữ liệu rỗng.', 'if (arr.length === 0) return 0;', 'Xử lý mảng rỗng trước.', 'new'],
    ['Memoization là gì?', 'Lưu kết quả của hàm theo tham số để lần gọi sau trả về ngay, thường dùng trong DP top-down.', 'const memo = new Map();', 'Kiểm tra memo trước khi tính.', 'new'],
    ['Độ phức tạp tìm kiếm trong Linked List?', 'O(n) vì phải duyệt tuần tự từ head tới node cần tìm.', 'while (node) node = node.next;', 'Không truy cập theo chỉ số.', 'new'],
    ['Khi nào nên dùng cấu trúc dữ liệu cây?', 'Khi dữ liệu có quan hệ phân cấp như menu, thư mục, DOM hoặc cần tìm kiếm có thứ tự.', 'const root = { children: [] };', 'Mỗi node có danh sách con.', 'new']
  ]
);

export const MOCK_FLASHCARD_SETS: FlashcardSet[] = [
  {
    id: 'js-basics',
    title: 'JavaScript Cơ bản',
    desc: 'Các khái niệm và cú pháp cơ bản trong JavaScript.',
    icon: 'code',
    tint: '#E6F4FF',
    accent: '#0088E8',
    createdAt: '2025-09-10',
    cards: JS_CARDS
  },
  {
    id: 'html-css',
    title: 'HTML & CSS',
    desc: 'Các thẻ HTML và thuộc tính CSS thường dùng.',
    icon: 'code',
    tint: '#F3ECFF',
    accent: '#7C3AED',
    createdAt: '2025-09-05',
    cards: HTML_CSS_CARDS
  },
  {
    id: 'sql-basics',
    title: 'SQL Cơ bản',
    desc: 'Các câu lệnh SQL cơ bản: SELECT, INSERT, UPDATE, DELETE...',
    icon: 'database',
    tint: '#E6F7EE',
    accent: '#16A34A',
    createdAt: '2025-09-02',
    cards: SQL_CARDS
  },
  {
    id: 'reactjs',
    title: 'ReactJS',
    desc: 'Các khái niệm và hook trong React.',
    icon: 'atom',
    tint: '#FFE9D6',
    accent: '#EA7317',
    createdAt: '2025-08-28',
    cards: REACT_CARDS
  },
  {
    id: 'algorithms',
    title: 'Thuật toán & Cấu trúc dữ liệu',
    desc: 'Các cấu trúc dữ liệu và thuật toán cơ bản.',
    icon: 'algorithm',
    tint: '#FFE4EF',
    accent: '#EC4899',
    createdAt: '2025-08-20',
    cards: ALGO_CARDS
  }
];
