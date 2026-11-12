import {
  renderBaseEmailLayout,
  renderSignupVerificationEmail,
  renderResendVerificationEmail,
  renderForgotPasswordOtpEmail,
  renderNewsletterWelcomeEmail,
  renderNewBlogPostEmail,
} from '../src/user/email/email-templates.js';

console.log('--- TEST EMAIL TEMPLATES ---');

// 1. Signup verification
const email1 = renderSignupVerificationEmail({
  name: 'Nguyễn Văn A',
  verificationLink: 'https://think-up-edu.vercel.app/api/auth/verify?token=example_jwt_token_123',
  expireHours: 12,
});
console.log('1. Signup verification email length:', email1.length);
if (!email1.includes('THINK') || !email1.includes('#0088E8') || !email1.includes('Kích hoạt tài khoản ngay')) {
  throw new Error('Email 1 missing brand tokens');
}

// 2. Resend verification
const email2 = renderResendVerificationEmail({
  name: 'Trần Thị B',
  verificationLink: 'https://think-up-edu.vercel.app/api/auth/verify?token=example_jwt_token_456',
  expireHours: 12,
});
console.log('2. Resend verification email length:', email2.length);
if (!email2.includes('GỬI LẠI XÁC THỰC') || !email2.includes('#0088E8')) {
  throw new Error('Email 2 missing brand tokens');
}

// 3. Forgot password OTP
const email3 = renderForgotPasswordOtpEmail({
  otpCode: '852941',
  expireMinutes: 5,
});
console.log('3. Forgot password OTP email length:', email3.length);
if (!email3.includes('852941') || !email3.includes('#0088E8') || !email3.includes('MÃ XÁC THỰC CỦA BẠN (OTP)')) {
  throw new Error('Email 3 missing OTP tokens');
}

// 4. Newsletter Welcome
const email4 = renderNewsletterWelcomeEmail({
  email: 'learner@thinkup.vn',
});
console.log('4. Newsletter welcome email length:', email4.length);
if (!email4.includes('Bản tin ThinkUp') || !email4.includes('#0088E8')) {
  throw new Error('Email 4 missing newsletter tokens');
}

// 5. New Blog Post
const email5 = renderNewBlogPostEmail({
  title: 'Lộ trình trở thành Fullstack Developer 2026',
  description: 'Khám phá tất tần tật các công nghệ cần học từ Frontend Angular/React đến Backend NodeJS và AI.',
  category: 'Lộ trình nghề nghiệp',
  readTime: '7 phút đọc',
  coverImage: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97',
  postUrl: 'https://think-up-edu.vercel.app/blog/fullstack-roadmap-2026',
});
console.log('5. New blog post email length:', email5.length);
if (!email5.includes('Fullstack Developer 2026') || !email5.includes('#0088E8')) {
  throw new Error('Email 5 missing blog tokens');
}

console.log('✅ ALL EMAIL TEMPLATES VALIDATED SUCCESSFULLY!');
