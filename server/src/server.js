import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import {
  registerUser,
  verifyEmailVerificationToken,
  resendVerificationLink,
  registerWithGoogle,
  registerWithFacebook,
  loginWithCredentials,
  loginWithGoogle,
  loginWithFacebook,
  getCurrentUser,
  verifyAuthSession,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resendForgotPasswordOtp,
  resetPasswordWithToken,
  verifyJwt,
} from './user/auth/auth.user.js';
import {
  skipOnboarding,
  submitOnboarding,
  getOnboardingCourseList,
} from './user/onboarding/onboarding.user.js';
import { createBlogRouter } from './user/blog/blog.user.js';
import { createPurchaseRouter } from './user/purchase/purchase.user.js';
import { createBillingRouter } from './user/purchase/billing.user.js';
import { createStudyRoomRouter } from './user/studyroom/studyroom.user.js';
import { createRoadmapRouter } from './user/roadmap/roadmap.user.js';
import { createFlashcardRouter } from './user/flashcard/flashcard.user.js';

const app = express();
const PORT = process.env.PORT || 5000;
const rawClientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
const CLIENT_URL = rawClientUrl.split(',')[0].trim().replace(/\/+$/, '');

// ─── 1. Cấu hình CORS ────────────────────────────────────────────────────────
const defaultOrigins = [
  'https://think-up-edu.vercel.app',
  'https://thinkup-edu.vercel.app',
  'http://localhost:4200',
  'http://localhost:4201',
  'http://localhost:3000',
  'http://127.0.0.1:4200',
];

const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(cors({
  origin: (origin, callback) => {
    // Cho phép gọi không origin (như cURL, Mobile App, Postman) hoặc origin nằm trong danh sách
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(null, true); // Chế độ thoáng cho môi trường demo / kiểm thử
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── 2. Middleware Trích Xuất Token Xác Thực ─────────────────────────────────
function extractBearerUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  try {
    const payload = verifyJwt(token);
    return payload.sub || payload.userId || payload.id || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const userId = extractBearerUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'Yêu cầu đăng nhập để thực hiện chức năng này.' });
  }
  req.userId = userId;
  next();
}

// ─── 3. Health Check Endpoints ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ThinkUp API Server is running',
    clientUrl: CLIENT_URL,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── 4. Router Xác Thực: /api/auth ───────────────────────────────────────────
const authRouter = express.Router();

// 4.1. Đăng ký tài khoản (Sign Up)
authRouter.post('/register', async (req, res, next) => {
  try {
    const result = await registerUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// 4.2. Kích hoạt tài khoản qua link email (Verify Token)
authRouter.get('/verify', async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) {
      const err = new Error('Mã liên kết xác thực không hợp lệ.');
      err.status = 400;
      throw err;
    }
    const result = await verifyEmailVerificationToken({ token });

    // Nếu người dùng mở trực tiếp từ trình duyệt (click link trong email): Điều hướng về trang login kèm thông báo
    const acceptsHtml = req.accepts('html') && !req.accepts('json');
    const isBrowserNavigation = (req.headers['sec-fetch-dest'] === 'document' || acceptsHtml) && !req.xhr;
    if (isBrowserNavigation) {
      const redirectUrl = `${CLIENT_URL}/auth/login?activated=true&email=${encodeURIComponent(result.email)}`;
      return res.redirect(redirectUrl);
    }

    res.json(result);
  } catch (err) {
    const acceptsHtml = req.accepts('html') && !req.accepts('json');
    const isBrowserNavigation = (req.headers['sec-fetch-dest'] === 'document' || acceptsHtml) && !req.xhr;
    if (isBrowserNavigation) {
      const redirectUrl = `${CLIENT_URL}/auth/login?error=${encodeURIComponent(err.message || 'Xác thực thất bại')}`;
      return res.redirect(redirectUrl);
    }
    next(err);
  }
});

// 4.3. Gửi lại liên kết xác thực (Resend Verification)
authRouter.post('/resend-verification', async (req, res, next) => {
  try {
    const result = await resendVerificationLink(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.4. Đăng ký nhanh Google OAuth
authRouter.post('/google/signup', async (req, res, next) => {
  try {
    const result = await registerWithGoogle(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.5. Đăng ký nhanh Facebook OAuth
authRouter.post('/facebook/signup', async (req, res, next) => {
  try {
    const result = await registerWithFacebook(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.6. Đăng nhập qua Email & Mật khẩu (Sign In)
authRouter.post('/login', async (req, res, next) => {
  try {
    const result = await loginWithCredentials(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.7. Đăng nhập Google OAuth
authRouter.post('/google/login', async (req, res, next) => {
  try {
    const result = await loginWithGoogle(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.8. Đăng nhập Facebook OAuth
authRouter.post('/facebook/login', async (req, res, next) => {
  try {
    const result = await loginWithFacebook(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.9. Lấy hồ sơ học viên hiện tại (Current Profile)
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await getCurrentUser(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.9b. Cập nhật hồ sơ & ảnh đại diện học viên (Update Profile & Avatar)
authRouter.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const db = await (await import('./user/db.js')).getMongoDb();
    const { ObjectId } = await import('mongodb');
    const { avatarUrl, avatar, full_name, name, firstName, lastName, headline, location, bio, phone } = req.body;
    const newAvatar = avatarUrl || avatar;
    const nextName = [firstName, lastName].filter(Boolean).join(' ').trim() || full_name || name;

    const updateFields = {
      updated_at: new Date(),
    };
    if (nextName) updateFields.full_name = nextName;
    if (phone) updateFields.phone = phone;
    if (headline !== undefined) updateFields.headline = headline;
    if (location !== undefined) updateFields.location = location;
    if (bio !== undefined) updateFields.bio = bio;

    if (newAvatar) {
      updateFields.avatar_url = newAvatar;
      updateFields.is_custom_avatar = true; // Đánh dấu người dùng đã tự upload ảnh mới
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: updateFields }
    );

    const updatedUser = await getCurrentUser(req.userId);
    res.json({
      success: true,
      message: 'Cập nhật hồ sơ thành công!',
      data: updatedUser.user,
    });
  } catch (err) {
    next(err);
  }
});

// 4.10. Kiểm tra phiên đăng nhập cho Header (Session Check)
authRouter.get('/session', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const result = await verifyAuthSession(authHeader);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.11. Quên mật khẩu: Yêu cầu OTP 6 số
authRouter.post('/forgot-password', async (req, res, next) => {
  try {
    const email = req.body.email || req.body.contact;
    const result = await sendForgotPasswordOtp({ email });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.12. Xác thực OTP 6 số (hỗ trợ cả endpoint chuẩn và alias /verify-otp từ FE)
const verifyOtpHandler = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyForgotPasswordOtp({ email, otp });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
authRouter.post('/verify-forgot-otp', verifyOtpHandler);
authRouter.post('/verify-otp', verifyOtpHandler);

// 4.13. Gửi lại OTP (hỗ trợ cả endpoint chuẩn và alias /resend-otp từ FE)
const resendOtpHandler = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await resendForgotPasswordOtp({ email });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
authRouter.post('/resend-forgot-otp', resendOtpHandler);
authRouter.post('/resend-otp', resendOtpHandler);

// 4.14. Đặt lại mật khẩu mới (Reset Password)
authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const resetToken = req.body.resetToken || req.body.token;
    const newPassword = req.body.newPassword || req.body.password;
    const confirmPassword = req.body.confirmPassword;
    const result = await resetPasswordWithToken({ resetToken, newPassword, confirmPassword });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.15. Đăng xuất (Logout)
authRouter.post('/logout', (req, res) => {
  res.json({ message: 'Đăng xuất thành công' });
});

app.use('/api/auth', authRouter);

// ─── 5. Router Khảo Sát Onboarding: /api/user/onboarding ─────────────────────
const onboardingRouter = express.Router();

onboardingRouter.post('/skip', requireAuth, async (req, res, next) => {
  try {
    const result = await skipOnboarding(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

onboardingRouter.post('/submit', requireAuth, async (req, res, next) => {
  try {
    const result = await submitOnboarding(req.userId, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

onboardingRouter.get('/courses', requireAuth, async (req, res, next) => {
  try {
    const result = await getOnboardingCourseList(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.use('/api/user/onboarding', onboardingRouter);

// ─── 5b. Alias Routes: /api/v1/onboarding (tương thích FE Angular) ───────────
// FE Angular đang gọi /api/v1/onboarding/submit và /api/v1/onboarding/skip
// Alias này đảm bảo FE không cần thay đổi code, BE tự route về cùng handler.
app.use('/api/v1/onboarding', onboardingRouter);

// ─── 5b2. Router Profile Học viên: /api/user/profile ─────────────────────────
const profileRouter = express.Router();
profileRouter.put('/', requireAuth, async (req, res, next) => {
  try {
    const db = await (await import('./user/db.js')).getMongoDb();
    const { ObjectId } = await import('mongodb');
    const { avatarUrl, avatar, full_name, name, firstName, lastName, headline, location, bio, phone } = req.body;
    const newAvatar = avatarUrl || avatar;
    const nextName = [firstName, lastName].filter(Boolean).join(' ').trim() || full_name || name;

    const updateFields = {
      updated_at: new Date(),
    };
    if (nextName) updateFields.full_name = nextName;
    if (phone) updateFields.phone = phone;
    if (headline !== undefined) updateFields.headline = headline;
    if (location !== undefined) updateFields.location = location;
    if (bio !== undefined) updateFields.bio = bio;

    if (newAvatar) {
      updateFields.avatar_url = newAvatar;
      updateFields.is_custom_avatar = true;
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: updateFields }
    );

    const updatedUser = await getCurrentUser(req.userId);
    res.json({
      success: true,
      message: 'Cập nhật hồ sơ thành công!',
      data: updatedUser.user,
    });
  } catch (err) {
    next(err);
  }
});
app.use('/api/user/profile', profileRouter);
app.use('/api/v1/user/profile', profileRouter);

// ─── 5c. Router Blog & Bản Tin (Newsletter): /api/blog & /api/newsletter ──────
const blogRouter = createBlogRouter(express);
app.use('/api/blog', blogRouter);
app.use('/api/v1/blog', blogRouter); // Hỗ trợ tiền tố v1 nếu FE gọi
app.use('/api/v1/posts', blogRouter); // Hỗ trợ endpoint chuẩn theo đặc tả: /api/v1/posts & /api/v1/posts/draft
app.use('/api/newsletter', blogRouter); // Hỗ trợ endpoint đăng ký nhận bản tin trực tiếp
app.use('/api/upload', blogRouter); // Hỗ trợ endpoint upload ảnh cho thanh công cụ soạn thảo bài viết

// ─── 5d. Router Lịch Sử Mua Hàng & Hóa Đơn: /api/user/purchase & /api/user/billing ──
const purchaseRouter = createPurchaseRouter(express, requireAuth);
app.use('/api/user/purchase', purchaseRouter);
app.use('/api/v1/purchase', purchaseRouter); // Hỗ trợ tiền tố v1

const billingRouter = createBillingRouter(express, requireAuth);
app.use('/api/user/billing', billingRouter);
app.use('/api/v1/billing', billingRouter); // Hỗ trợ tiền tố v1

// ─── 5e. Router Phòng Học Ảo (Study Room): /api/study-room ───────────────────
const studyRoomRouter = createStudyRoomRouter(express, requireAuth);
app.use('/api/study-room', studyRoomRouter);
app.use('/api/v1/study-room', studyRoomRouter); // Hỗ trợ tiền tố v1

// ─── 5f. Router Lộ Trình Học Nghề Nghiệp (Career Roadmap): /api/user/roadmap ──
const roadmapRouter = createRoadmapRouter(express, requireAuth);
app.use('/api/user/roadmap', roadmapRouter);
app.use('/api/v1/roadmap', roadmapRouter); // Hỗ trợ tiền tố v1

// ─── 5g. Router Thẻ Ghi Nhớ (Flashcard): /api/user/flashcards ───────────────
const flashcardRouter = createFlashcardRouter(express, requireAuth);
app.use('/api/user/flashcards', flashcardRouter);
app.use('/api/v1/user/flashcards', flashcardRouter); // Hỗ trợ tiền tố v1
app.use('/api/flashcards', flashcardRouter); // Alias thuận tiện cho client

// ─── 6. Bộ Xử Lý Lỗi Tập Trung (Tương thích quy tắc bảo mật writing-block) ──
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  const responsePayload = {
    message: err.message || 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
  };

  if (err.code) responsePayload.code = err.code;
  if (err.field) responsePayload.field = err.field;
  if (err.retryAfter) responsePayload.retryAfter = err.retryAfter;

  // Log lỗi nội bộ nhưng không rò rỉ stack trace ra ngoài response (BR Bảo mật 8)
  if (status >= 500) {
    console.error(`[Server Error ${status}]:`, err);
  }

  res.status(status).json(responsePayload);
});

// ─── 7. Khởi Chạy Server ────────────────────────────────────────────────────
import url from 'node:url';

const isDirectRun = process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href;
if (isDirectRun || process.env.NODE_ENV === 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 ThinkUp Backend Server is listening on http://localhost:${PORT}`);
    console.log(`🔗 Allowed Client Demo URL: ${CLIENT_URL}`);
  });
}

export default app;
