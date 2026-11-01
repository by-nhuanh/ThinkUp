import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';

interface Testimonial { name: string; role: string; image: string; quote: string; }

interface BenefitCard {
  title: string;
  text: string;
  bullets: string[];
  revenue?: boolean;
  image?: string;
}

interface WhyCard { title: string; text: string; }

interface CtaCheck { title: string; text: string; }

@Component({
  selector: 'app-instructor-landing',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './instructor-landing.component.html',
  styleUrl: './instructor-landing.component.css',
})
export class InstructorLandingComponent {
  readonly avatars = [
    '/assets/instructor-application/avatar-1.png',
    '/assets/instructor-application/avatar-2.png',
    '/assets/instructor-application/avatar-3.png',
    '/assets/instructor-application/avatar-4.png',
  ];

  readonly barAvatars = this.avatars.slice(0, 3);

  readonly benefits: BenefitCard[] = [
    {
      title: '1. Lợi ích tài chính',
      text: 'Kiếm tiền từ mỗi khóa học bạn tạo ra. Doanh thu tăng trưởng theo thời gian, mà không cần làm việc nhiều hơn.',
      bullets: [
        'Thu nhập từ mỗi lượt đăng ký khóa học',
        'Chủ động thiết lập giá và chương trình ưu đãi',
        'Theo dõi doanh thu minh bạch, cập nhật liên tục',
        'Nhận thanh toán định kỳ, an toàn và thuận tiện',
      ],
      revenue: true,
    },
    {
      title: '2. Công cụ hỗ trợ giảng dạy',
      text: 'Bộ công cụ toàn diện giúp bạn tạo khóa học chuyên nghiệp, tương tác và quản lý dễ dàng.',
      bullets: [
        'Tạo bài giảng video, tài liệu, quiz, bài tập',
        'Quản lý học viên, theo dõi tiến độ học tập',
        'Thống kê chi tiết, báo cáo trực quan',
        'Tích hợp thanh toán & tiếp thị khóa học',
      ],
      image: '/assets/instructor-application/teaching-dashboard.png',
    },
    {
      title: '3. Cộng đồng giảng viên',
      text: 'Kết nối, học hỏi và phát triển cùng hàng nghìn giảng viên trên toàn quốc.',
      bullets: [
        'Tham gia cộng đồng giảng viên sôi nổi',
        'Chia sẻ kinh nghiệm & chiến lược giảng dạy',
        'Nhận hỗ trợ từ đội ngũ chuyên nghiệp',
        'Cơ hội hợp tác & phát triển thương hiệu',
      ],
      image: '/assets/instructor-application/instructor-community.png',
    },
  ];

  readonly why: WhyCard[] = [
    { title: 'Rất dễ sử dụng', text: 'Giao diện thân thiện, dễ làm quen và sử dụng.' },
    { title: 'Chi phí hợp lý', text: 'Chia sẻ doanh thu minh bạch, không phí ẩn.' },
    { title: 'Hỗ trợ tận tâm', text: 'Đội ngũ hỗ trợ 24/7 sẵn sàng giúp bạn thành công.' },
    { title: 'Bảo mật tuyệt đối', text: 'Thông tin và dữ liệu của bạn luôn được bảo vệ.' },
  ];

  readonly testimonials: Testimonial[] = [
    { name: 'Trần Quốc Bảo', role: 'Giảng viên Lập trình', image: '/assets/instructor-application/avatar-1.png', quote: 'Nền tảng giúp tôi tiếp cận hàng ngàn học viên và có nguồn thu nhập ổn định mỗi tháng. Rất đáng để bắt đầu!' },
    { name: 'Lê Hoàng Yến', role: 'Giảng viên Kỹ năng', image: '/assets/instructor-application/avatar-2.png', quote: 'Công cụ tạo khóa học rất chuyên nghiệp và dễ dùng. Cộng đồng giảng viên cũng rất tích cực và hỗ trợ nhau.' },
    { name: 'Phạm Anh Khoa', role: 'Giảng viên Marketing', image: '/assets/instructor-application/avatar-3.png', quote: 'Tôi đã xây dựng thương hiệu cá nhân và tăng thu nhập đáng kể nhờ giảng dạy online. Cảm ơn nền tảng tuyệt vời này!' },
    { name: 'Nguyễn Thu Hà', role: 'Giảng viên Marketing', image: '/assets/instructor-application/avatar-1.png', quote: 'Nhờ ThinkUp, tôi đã chuyển kinh nghiệm thực tế thành khóa học và tiếp cận nhiều học viên trên khắp cả nước.' },
    { name: 'Đỗ Minh Tuấn', role: 'Giảng viên Công nghệ', image: '/assets/instructor-application/avatar-2.png', quote: 'Doanh thu khóa học tăng đều mỗi tháng. Công cụ quản lý nội dung và học viên rất trực quan, tiết kiệm nhiều thời gian.' },
    { name: 'Vũ Ngọc Lan', role: 'Giảng viên Kỹ năng mềm', image: '/assets/instructor-application/avatar-3.png', quote: 'Tôi tự tin xây dựng cộng đồng học tập của riêng mình và luôn nhận được sự hỗ trợ tận tâm từ đội ngũ ThinkUp.' },
  ];

  readonly ctaChecks: CtaCheck[] = [
    { title: 'Giảng dạy linh hoạt', text: 'Chủ động thời gian, dạy mọi nơi' },
    { title: 'Thu nhập bền vững', text: 'Kiếm tiền ngay cả khi bạn nghỉ' },
    { title: 'Tạo ảnh hưởng tích cực', text: 'Giúp học viên phát triển mỗi ngày' },
  ];
}
