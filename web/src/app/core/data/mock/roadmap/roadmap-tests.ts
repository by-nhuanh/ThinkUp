// TODO(pre-deploy): Nhớ xóa ngân hàng câu hỏi mock khi backend trả về đề thi theo tag_id.
import { RoadmapStage, RoadmapTest, RoadmapTestQuestion } from '../../../../features/roadmap/models/roadmap.model';

const CORE_FRONTEND_QUESTIONS: RoadmapTestQuestion[] = [
  {
    id: 'cf-1',
    prompt: 'Thẻ HTML nào mô tả đúng nhất vai trò của phần nội dung chính trong trang?',
    options: [
      { id: 'a', label: '<section> – một vùng nội dung độc lập theo chủ đề.' },
      { id: 'b', label: '<main> – nội dung chính, chỉ nên xuất hiện một lần mỗi trang.' },
      { id: 'c', label: '<div> – khối bao dùng chung cho mọi nội dung.' },
      { id: 'd', label: '<article> – nội dung có thể đứng độc lập và tái sử dụng.' }
    ],
    correctOptionId: 'b',
    skillId: 'html-semantic',
    tag: 'HTML & Semantic'
  },
  {
    id: 'cf-2',
    prompt: 'Class nào sau đây sẽ thắng khi hai selector cùng trỏ vào một phần tử?',
    code: '.card { color: #4D5461; }\n.card.is-active { color: #0088E8; }',
    language: 'css',
    options: [
      { id: 'a', label: '.card, vì được khai báo trước.' },
      { id: 'b', label: '.card.is-active, vì có độ đặc hiệu (specificity) cao hơn.' },
      { id: 'c', label: 'Cả hai hoà nhau nên trình duyệt chọn ngẫu nhiên.' },
      { id: 'd', label: 'Không class nào áp dụng vì thiếu !important.' }
    ],
    correctOptionId: 'b',
    skillId: 'css-engineering',
    tag: 'CSS Engineering'
  },
  {
    id: 'cf-3',
    prompt: 'Đoạn mã HTML và CSS dưới đây sẽ hiển thị kết quả như thế nào?',
    code: '<div class="box">\n  <h3>Learning</h3>\n  <p>Build your future</p>\n</div>\n\n.box {  background-color: #e0f2fe;\n  padding: 16px;\n  border-radius: 8px;\n}',
    language: 'html',
    options: [
      { id: 'a', label: 'Một khung màu xanh dương đậm, chữ màu trắng, bo góc 8px, có padding 16px.' },
      { id: 'b', label: 'Một khung màu xanh nhạt (#e0f2fe), chữ màu đen, bo góc 8px, có padding 16px.' },
      { id: 'c', label: 'Chỉ hiển thị tiêu đề "Learning" với chữ màu xanh dương.' },
      { id: 'd', label: 'Một khung màu xám, không có bo góc.' }
    ],
    correctOptionId: 'b',
    skillId: 'css-engineering',
    tag: 'CSS Engineering'
  },
  {
    id: 'cf-4',
    prompt: 'Đơn vị nào phù hợp nhất để chữ vẫn co giãn theo thiết lập của người dùng?',
    options: [
      { id: 'a', label: 'px, vì luôn cố định trên mọi thiết bị.' },
      { id: 'b', label: 'rem, vì dựa trên font-size gốc của trình duyệt.' },
      { id: 'c', label: 'cm, vì đơn vị vật lý chính xác.' },
      { id: 'd', label: 'pt, vì dùng chuẩn trong in ấn.' }
    ],
    correctOptionId: 'b',
    skillId: 'responsive-design',
    tag: 'Responsive Design'
  },
  {
    id: 'cf-5',
    prompt: 'Kết quả của đoạn code sau là gì?',
    code: 'console.log(1);\nsetTimeout(() => console.log(2), 0);\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);',
    language: 'javascript',
    options: [
      { id: 'a', label: '1, 2, 3, 4' },
      { id: 'b', label: '1, 4, 3, 2' },
      { id: 'c', label: '1, 4, 2, 3' },
      { id: 'd', label: '4, 1, 3, 2' }
    ],
    correctOptionId: 'b',
    skillId: 'javascript-engineering',
    tag: 'JavaScript Engineering'
  },
  {
    id: 'cf-6',
    prompt: 'Cách nào giúp giảm số lượng event listener khi render một danh sách dài?',
    options: [
      { id: 'a', label: 'Gắn listener cho từng item sau khi render.' },
      { id: 'b', label: 'Dùng event delegation, gắn một listener ở phần tử cha.' },
      { id: 'c', label: 'Dùng inline onclick trong mỗi item.' },
      { id: 'd', label: 'Tắt bubbling bằng stopPropagation cho từng item.' }
    ],
    correctOptionId: 'b',
    skillId: 'dom-events',
    tag: 'DOM Manipulation & Events'
  },
  {
    id: 'cf-7',
    prompt: 'Phương thức nào trả về một mảng mới mà không thay đổi mảng gốc?',
    options: [
      { id: 'a', label: 'push()' },
      { id: 'b', label: 'splice()' },
      { id: 'c', label: 'map()' },
      { id: 'd', label: 'sort()' }
    ],
    correctOptionId: 'c',
    skillId: 'javascript-engineering',
    tag: 'JavaScript Engineering'
  },
  {
    id: 'cf-8',
    prompt: 'Theo mô hình box model mặc định, kích thước phần tử được tính như thế nào?',
    options: [
      { id: 'a', label: 'content + padding + border + margin' },
      { id: 'b', label: 'content + padding + border' },
      { id: 'c', label: 'Chỉ content, padding và border nằm ngoài.' },
      { id: 'd', label: 'content + margin' }
    ],
    correctOptionId: 'b',
    skillId: 'css-engineering',
    tag: 'CSS Engineering'
  },
  {
    id: 'cf-9',
    prompt: 'Cách nào đảm bảo một ô nhập liệu được screen reader đọc đúng nhãn?',
    options: [
      { id: 'a', label: 'Đặt placeholder mô tả nội dung.' },
      { id: 'b', label: 'Dùng <label for> trỏ tới id của input.' },
      { id: 'c', label: 'Đặt title cho input.' },
      { id: 'd', label: 'Đặt màu chữ tương phản cao.' }
    ],
    correctOptionId: 'b',
    skillId: 'html-semantic',
    tag: 'HTML & Semantic'
  },
  {
    id: 'cf-10',
    prompt: 'Khi gọi API thất bại, giao diện nên xử lý như thế nào?',
    options: [
      { id: 'a', label: 'Ẩn toàn bộ trang để tránh hiển thị dữ liệu sai.' },
      { id: 'b', label: 'Hiển thị trạng thái lỗi kèm hành động thử lại.' },
      { id: 'c', label: 'Tự động gọi lại vô hạn cho tới khi thành công.' },
      { id: 'd', label: 'Bỏ qua lỗi và hiển thị dữ liệu rỗng.' }
    ],
    correctOptionId: 'b',
    skillId: 'browser-apis',
    tag: 'Browser APIs'
  }
];

/**
 * Đề thi mẫu cho từng giai đoạn. Với giai đoạn chưa có đề riêng, hệ thống sinh đề
 * từ danh mục kỹ năng của giai đoạn để luồng "Làm bài test" luôn hoạt động.
 */
const AUTHORED_TESTS: Record<string, RoadmapTestQuestion[]> = {
  'fe-stage-2': CORE_FRONTEND_QUESTIONS
};

export function buildStageTest(roadmapId: string, stage: RoadmapStage): RoadmapTest {
  const authored = AUTHORED_TESTS[stage.id];
  const questions = authored ?? buildFallbackQuestions(stage);

  return {
    id: `${roadmapId}::${stage.id}`,
    roadmapId,
    stageId: stage.id,
    title: stage.name,
    subtitle: `Trả lời các câu hỏi dưới đây để kiểm tra kỹ năng của bạn. Bạn cần hoàn thành tất cả câu hỏi.`,
    durationMinutes: 20,
    questions
  };
}

function buildFallbackQuestions(stage: RoadmapStage): RoadmapTestQuestion[] {
  const bank: RoadmapTestQuestion[] = [];
  const skills = stage.skills.length ? stage.skills : [{ id: 'general', title: stage.name } as never];

  for (let index = 0; index < 10; index += 1) {
    const skill = skills[index % skills.length];
    const title = (skill as { title: string }).title;
    bank.push({
      id: `${stage.id}-q${index + 1}`,
      prompt: `Trong giai đoạn "${stage.name}", đâu là cách tiếp cận đúng khi làm việc với ${title}?`,
      options: [
        { id: 'a', label: 'Bắt đầu từ ví dụ nhỏ, kiểm tra kết quả rồi mở rộng dần.' },
        { id: 'b', label: 'Viết toàn bộ tính năng trước khi kiểm tra bất kỳ phần nào.' },
        { id: 'c', label: 'Sao chép giải pháp có sẵn mà không đọc hiểu.' },
        { id: 'd', label: 'Bỏ qua tài liệu và chỉ thử ngẫu nhiên.' }
      ],
      correctOptionId: 'a',
      skillId: skill.id,
      tag: title
    });
  }

  return bank;
}
