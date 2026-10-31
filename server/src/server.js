import dotenv from 'dotenv';
dotenv.config({ quiet: true });

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
  readAuthToken, verifyAccessToken, setAuthCookie, clearAuthCookie,
  requireCookieCsrf, createCsrfToken,
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
import { createPaymentRouter } from './user/payment/payment.router.js';
import { recoverPayments } from './user/payment/payment.service.js';
import { createCartRouter } from './user/cart/cart.user.js';
import { createCourseRouter } from './user/course/course.user.js';
import { createFavoritesRouter } from './user/favorites/favorites.user.js';
import { createLessonRouter } from './user/lesson/lesson.user.js';
import { createCertificateRouter } from './user/certificate/certificate.user.js';
import { createProfileRouter, cleanUpOldActivityLogs } from './user/profile/profile.user.js';
import { createAdminAuthMiddleware, createAdminAuthRouter } from './admin/auth/auth.admin.js';
import { createNotificationRouter } from './user/notification/notification.user.js';
import { createSupportRouter } from './user/support/support.user.js';
import { createAccountSecurityRouter, logoutSecuritySession, recoverSecurityEvents } from './user/account-security/account-security.user.js';
import { createPaymentSettingsRouter } from './user/payment-settings/payment-settings.user.js';
import { createLearningSettingsRouter } from './user/learning-settings/learning-settings.user.js';

const app = express();
const PORT = process.env.PORT || 5000;
const rawClientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
const CLIENT_URL = rawClientUrl.split(',')[0].trim().replace(/\/+$/, '');

// ─── 1. Cấu hình CORS ────────────────────────────────────────────────────────
const defaultOrigins = [
  'https://think-up-edu.vercel.app',
  'https://thinkup-edu.vercel.app',
  'https://think-up-admin.vercel.app',
  'https://thinkup-admin.vercel.app',
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
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-CSRF-Token', 'Idempotency-Key'],
}));

app.use(express.json({ limit: '10mb', verify: (req, res, buffer) => {
  if (/^\/api\/(?:user\/|v1\/)?payment\/webhook\/stripe\/?$/.test(req.path)) {
    req.rawBody = Buffer.from(buffer);
  }
} }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ message: 'Origin không được phép.', code: 'ORIGIN_FORBIDDEN' });
  }
  next();
});
app.use(requireCookieCsrf);

// ─── 2. Middleware Trích Xuất Token Xác Thực ─────────────────────────────────
async function extractBearerUserId(req) {
  const token = readAuthToken(req);
  if (!token) return null;
  try {
    verifyAccessToken(token);
  } catch {
    return null;
  }
  const session = await verifyAuthSession(token);
  if (!session.isAuthenticated) req.authFailureReason = session.reason;
  return session.isAuthenticated ? session.user.id : null;
}

async function requireAuth(req, res, next) {
  try {
    const userId = await extractBearerUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'Yêu cầu đăng nhập để thực hiện chức năng này.',
        code: req.authFailureReason || 'AUTH_REQUIRED' });
    }
    req.userId = userId;
    next();
  } catch { next(Object.assign(new Error('Không thể xác thực phiên lúc này. Vui lòng thử lại.'),
    { status: 503, code: 'AUTH_UNAVAILABLE' })); }
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
    const result = await registerUser(req.body, { ip: req.ip });
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
    const result = await resendVerificationLink(req.body, { ip: req.ip });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.4. Đăng ký nhanh Google OAuth
authRouter.post('/google/signup', async (req, res, next) => {
  try {
    const result = await registerWithGoogle(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
    setAuthCookie(res, result, 'user', req.body.rememberMe);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.5. Đăng ký nhanh Facebook OAuth
authRouter.post('/facebook/signup', async (req, res, next) => {
  try {
    const result = await registerWithFacebook(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
    setAuthCookie(res, result, 'user', req.body.rememberMe);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.6. Đăng nhập qua Email & Mật khẩu (Sign In)
authRouter.post('/login', async (req, res, next) => {
  try {
    const result = await loginWithCredentials(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
    setAuthCookie(res, result, 'user', req.body.rememberMe);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.7. Đăng nhập Google OAuth
authRouter.post('/google/login', async (req, res, next) => {
  try {
    const result = await loginWithGoogle(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
    setAuthCookie(res, result, 'user', req.body.rememberMe);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.8. Đăng nhập Facebook OAuth
authRouter.post('/facebook/login', async (req, res, next) => {
  try {
    const result = await loginWithFacebook(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
    setAuthCookie(res, result, 'user', req.body.rememberMe);
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
    const token = readAuthToken(req);
    res.set('Cache-Control', 'no-store');
    if (token) {
      try { verifyAccessToken(token); } catch {
        return res.json({ isAuthenticated: false, user: null, reason: 'TOKEN_INVALID' });
      }
    }
    const result = await verifyAuthSession(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.11. Quên mật khẩu: Yêu cầu OTP 6 số
authRouter.post('/forgot-password', async (req, res, next) => {
  try {
    const email = req.body.email || req.body.contact;
    const result = await sendForgotPasswordOtp({ email }, { ip: req.ip });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.12. Xác thực OTP 6 số (hỗ trợ cả endpoint chuẩn và alias /verify-otp từ FE)
const verifyOtpHandler = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyForgotPasswordOtp({ email, otp }, { ip: req.ip });
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
    const result = await resendForgotPasswordOtp({ email }, { ip: req.ip });
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
    const result = await resetPasswordWithToken({ resetToken, newPassword, confirmPassword }, { ip: req.ip });
    clearAuthCookie(res);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4.15. Đăng xuất (Logout)
authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = readAuthToken(req);
    let payload;
    if (token) {
      try { payload = verifyAccessToken(token); } catch { /* Invalid tokens cannot identify a live session. */ }
    }
    if (payload && (await verifyAuthSession(token)).isAuthenticated) await logoutSecuritySession(payload);
    clearAuthCookie(res);
    res.json({ message: 'Đăng xuất thành công' });
  } catch { next(Object.assign(new Error('Chưa đăng xuất được phiên. Vui lòng thử lại.'),
    { status: 503, code: 'SECURITY_UNAVAILABLE' })); }
});

authRouter.get('/csrf', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: createCsrfToken(readAuthToken(req)) });
});

app.use('/api/auth', authRouter);
app.use('/api/user/settings/payment', createPaymentSettingsRouter(express, requireAuth));
app.use('/api/user/settings/learning', createLearningSettingsRouter(express, requireAuth));
app.use('/api/user/settings', createAccountSecurityRouter(express, requireAuth, {
  readAccessPayload: req => verifyAccessToken(readAuthToken(req)), setAuthCookie,
}));

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
const notificationRouter = createNotificationRouter(express, requireAuth);
app.use('/api/user/notifications', notificationRouter);
app.use('/api/v1/user/notifications', notificationRouter);
const supportRouter = createSupportRouter(express, requireAuth, optionalAuth);
app.use('/api/support', supportRouter);
app.use('/api/v1/support', supportRouter);
app.use('/api/v1/onboarding', onboardingRouter);
app.use('/api/onboarding', onboardingRouter); // Alias gọi trực tiếp không cần tiền tố

// ─── 5b2. Router Profile Học viên: /api/user/profile ─────────────────────────
const profileRouter = createProfileRouter(express, requireAuth, getCurrentUser);
app.use('/api/user/profile', profileRouter);
app.use('/api/v1/user/profile', profileRouter);

// BR-PRF-06: Tự động chạy ngầm dọn dẹp rác User_Activity_Logs (> 30 ngày)
setInterval(() => {
  cleanUpOldActivityLogs(30).catch((err) => console.error('[Garbage Collection] Lỗi dọn log hoạt động cũ:', err));
}, 24 * 60 * 60 * 1000); // Định kỳ 24h chạy 1 lần

// ─── 5c. Router Blog & Bản Tin (Newsletter): /api/blog & /api/newsletter ──────
const blogAdminAuth = createAdminAuthMiddleware();
const requireBlogDeleteAuth = (req, res, next) => {
  const token = readAuthToken(req, 'admin');
  if (token) {
    try {
      verifyAccessToken(token, 'admin');
      return blogAdminAuth(req, res, next);
    } catch {
      // A Bearer token can belong to User; let the existing User middleware decide.
    }
  }
  return requireAuth(req, res, next);
};
const blogRouter = createBlogRouter(express, requireAuth, blogAdminAuth, requireBlogDeleteAuth, optionalAuth);
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

// ─── 5h. Router Cổng Thanh Toán & Webhook: /api/payment & /api/user/payment ──
const paymentRouter = createPaymentRouter(express, requireAuth);
app.use('/api/payment', paymentRouter);
app.use('/api/user/payment', paymentRouter);
app.use('/api/v1/payment', paymentRouter); // Hỗ trợ tiền tố v1

// ─── 5i. Router Giỏ Hàng Học Viên & Khách: /api/user/cart ───────────────────
async function optionalAuth(req, res, next) {
  try {
    const userId = await extractBearerUserId(req);
    if (userId) req.userId = userId;
    next();
  } catch (error) { next(error); }
}
const cartRouter = createCartRouter(express, requireAuth, optionalAuth);
app.use('/api/user/cart', cartRouter);
app.use('/api/v1/user/cart', cartRouter); // Hỗ trợ tiền tố v1
app.use('/api/cart', cartRouter); // Alias tương thích trực tiếp

// ─── 5j. Router Thẻ & Danh Sách Khóa Học: /api/user/courses & /api/courses ───
const courseCardRouter = createCourseRouter(express, optionalAuth, requireAuth);
app.use('/api/user/courses', courseCardRouter);
app.use('/api/v1/user/courses', courseCardRouter);
app.use('/api/courses', courseCardRouter); // Alias gọi trực tiếp không cần user prefix

// Hỗ trợ endpoint Dashboard khóa học của tôi: /api/user/dashboard mà Frontend đang gọi
app.get('/api/user/dashboard', requireAuth, async (req, res, next) => {
  try {
    const { getUserEnrolledCourses } = await import('./user/course/course.user.js');
    const data = await getUserEnrolledCourses(req.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
app.get('/api/v1/user/dashboard', requireAuth, async (req, res, next) => {
  try {
    const { getUserEnrolledCourses } = await import('./user/course/course.user.js');
    const data = await getUserEnrolledCourses(req.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Hỗ trợ endpoint Hồ sơ giảng viên công khai: /api/instructors/:id & /api/user/instructors/:id
app.get(['/api/instructors/:id', '/api/v1/instructors/:id', '/api/user/instructors/:id', '/api/v1/user/instructors/:id'], optionalAuth, async (req, res, next) => {
  try {
    const { getInstructorProfileDetail } = await import('./user/course/course.user.js');
    const data = await getInstructorProfileDetail(req.params.id, req.userId || null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── 5k. Router Khóa Học Yêu Thích: /api/user/favorites & /api/favorites ──────
const favoritesRouter = createFavoritesRouter(express, requireAuth, optionalAuth);
app.use('/api/user/favorites', favoritesRouter);
app.use('/api/v1/user/favorites', favoritesRouter); // Hỗ trợ tiền tố v1
app.use('/api/favorites', favoritesRouter); // Alias tương thích trực tiếp

// ─── 5l. Router Quản Trị Viên (Admin Auth & Security): /api/admin/auth ───────
const adminAuthRouter = createAdminAuthRouter(express);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/v1/admin/auth', adminAuthRouter); // Hỗ trợ tiền tố v1

// ─── 5m. Router Bài Học & Học Tập: /api/user/lessons ─────────────────────────
const lessonRouter = createLessonRouter(express, requireAuth, optionalAuth);
app.use('/api/user/lessons', lessonRouter);
app.use('/api/v1/user/lessons', lessonRouter);
app.use('/api/lessons', lessonRouter); // Alias tương thích trực tiếp

// ─── 5n. Router Quản Lý & Tra Cứu Chứng Chỉ: /api/certificates & /api/v1/certificates ──
const certificateRouter = createCertificateRouter(express, requireAuth);
app.use('/api/certificates', certificateRouter);
app.use('/api/v1/certificates', certificateRouter);
app.use('/api/user/certificates', certificateRouter); // Alias tương thích user prefix

// ─── 6. Bộ Xử Lý Lỗi Tập Trung (Tương thích quy tắc bảo mật writing-block) ──
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  const hideAuthError = req.path.startsWith('/api/auth/') && status >= 500 &&
    !['EMAIL_DELIVERY_FAILED', 'OAUTH_NOT_CONFIGURED', 'OAUTH_UNAVAILABLE'].includes(err.code);
  const responsePayload = {
    message: hideAuthError ? 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.' : err.message || 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
  };

  if (err.code && !hideAuthError) responsePayload.code = err.code;
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
  let recoveringSecurity = false;
  const securityRecoveryTimer = setInterval(async () => {
    if (recoveringSecurity) return;
    recoveringSecurity = true;
    try {
      const result = await recoverSecurityEvents();
      if (result.failed) console.error('[Account security] Có email bảo mật cần kiểm tra hoặc thử lại.');
    } catch { console.error('[Account security] Chưa phục hồi được sự kiện bảo mật.'); }
    finally { recoveringSecurity = false; }
  }, 30000);
  securityRecoveryTimer.unref();
  let recoveringPayments = false;
  const recoveryTimer = setInterval(async () => {
    if (recoveringPayments) return;
    recoveringPayments = true;
    try {
      const result = await recoverPayments();
      if (result.failed) console.error('[Payment Recovery] Một số giao dịch cần thử lại:', result.failed);
    } catch { console.error('[Payment Recovery] Chưa kết nối được kho thanh toán.'); }
    finally { recoveringPayments = false; }
  }, 60000);
  recoveryTimer.unref();
}

export default app;
