import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Testimonial { name: string; role: string; image: string; quote: string; }

@Component({ selector: 'app-instructor-landing', standalone: true, imports: [RouterLink], templateUrl: './instructor-landing.component.html', styleUrl: './instructor-landing.component.css' })
export class InstructorLandingComponent {
  readonly testimonials: Testimonial[] = [
    { name: 'Trần Quốc Bảo', role: 'Giảng viên Lập trình', image: '/assets/instructor-application/avatar-1.png', quote: 'Nền tảng giúp tôi tiếp cận hàng ngàn học viên và có nguồn thu nhập ổn định mỗi tháng. Rất đáng để bắt đầu!' },
    { name: 'Lê Hoàng Yến', role: 'Giảng viên Kỹ năng', image: '/assets/instructor-application/avatar-2.png', quote: 'Công cụ tạo khóa học rất chuyên nghiệp và dễ dùng. Cộng đồng giảng viên cũng rất tích cực và hỗ trợ nhau.' },
    { name: 'Phạm Anh Khoa', role: 'Giảng viên Marketing', image: '/assets/instructor-application/avatar-3.png', quote: 'Tôi đã xây dựng thương hiệu cá nhân và tăng thu nhập đáng kể nhờ giảng dạy online. Cảm ơn nền tảng tuyệt vời này!' },
    { name: 'Nguyễn Thu Hà', role: 'Giảng viên Marketing', image: '/assets/instructor-application/avatar-1.png', quote: 'Nhờ ThinkUp, tôi đã chuyển kinh nghiệm thực tế thành khóa học và tiếp cận nhiều học viên trên khắp cả nước.' },
    { name: 'Đỗ Minh Tuấn', role: 'Giảng viên Công nghệ', image: '/assets/instructor-application/avatar-2.png', quote: 'Doanh thu khóa học tăng đều mỗi tháng. Công cụ quản lý nội dung và học viên rất trực quan, tiết kiệm nhiều thời gian.' },
    { name: 'Vũ Ngọc Lan', role: 'Giảng viên Kỹ năng mềm', image: '/assets/instructor-application/avatar-3.png', quote: 'Tôi tự tin xây dựng cộng đồng học tập của riêng mình và luôn nhận được sự hỗ trợ tận tâm từ đội ngũ ThinkUp.' },
  ];
}
