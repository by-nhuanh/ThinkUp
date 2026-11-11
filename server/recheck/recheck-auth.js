import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';
dotenv.config();

// ANSI color helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

const c = {
  header: (txt) => `${colors.bright}${colors.cyan}${txt}${colors.reset}`,
  success: (txt) => `${colors.bright}${colors.green}${txt}${colors.reset}`,
  error: (txt) => `${colors.bright}${colors.red}${txt}${colors.reset}`,
  warn: (txt) => `${colors.bright}${colors.yellow}${txt}${colors.reset}`,
  info: (txt) => `${colors.blue}${txt}${colors.reset}`,
  dim: (txt) => `${colors.dim}${txt}${colors.reset}`,
  key: (txt) => `${colors.magenta}${txt}${colors.reset}`,
};

let currentTargetUrl = 'http://localhost:5000'; // Mặc định local, có thể đổi sang Railway bằng menu [9]
let lastSavedToken = '';
let lastSavedResetToken = '';
let lastSavedEmail = '';

const rl = readline.createInterface({ input, output });

async function ask(question, defaultValue = '') {
  const prompt = defaultValue ? `${question} [${c.dim(defaultValue)}]: ` : `${question}: `;
  const ans = await rl.question(prompt);
  return ans.trim() || defaultValue;
}

async function sendRequest(path, method = 'GET', body = null, token = '') {
  const url = `${currentTargetUrl}${path}`;
  console.log(`\n${c.dim('─'.repeat(60))}`);
  console.log(`${c.key(method)} ${c.info(url)}`);

  const headers = {
    'Accept': 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const start = Date.now();
  try {
    const res = await fetch(url, options);
    const duration = Date.now() - start;
    const isOk = res.ok;
    const statusText = isOk
      ? c.success(`HTTP ${res.status} ${res.statusText}`)
      : c.error(`HTTP ${res.status} ${res.statusText}`);

    console.log(`Kết quả: ${statusText} ${c.dim(`(${duration}ms)`)}`);

    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
      console.log(`Dữ liệu phản hồi (JSON):`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      data = await res.text();
      console.log(`Dữ liệu phản hồi: ${data}`);
    }
    console.log(`${c.dim('─'.repeat(60))}\n`);
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    console.log(c.error(`❌ Lỗi kết nối tới máy chủ:`), err.message);
    console.log(c.warn(`💡 Gợi ý: Hãy chắc chắn bạn đã chạy 'npm start' ở terminal khác nếu test localhost.`));
    console.log(`${c.dim('─'.repeat(60))}\n`);
    return { ok: false, error: err };
  }
}

// ─── 1. Test Đăng Ký Học Viên (Sign Up) ──────────────────────────────────────
async function testRegister() {
  console.log(c.header('\n=== 📝 1. TEST ĐĂNG KÝ HỌC VIÊN (POST /api/auth/register) ==='));
  const fullName = await ask('Nhập Họ và tên', 'Nguyễn Văn Test');
  const phone = await ask('Nhập Số điện thoại di động (10 số, đầu 03/05/07/08/09)', '0912345678');
  const email = await ask('Nhập Email', `user_${Date.now()}@gmail.com`);
  const password = await ask('Nhập Mật khẩu (>= 8 ký tự, gồm hoa, thường, số, ký tự đặc biệt)', 'TestPass123!');
  const confirmPassword = await ask('Nhập Xác nhận mật khẩu', password);
  const terms = await ask('Đồng ý điều khoản? (y/n)', 'y');

  const payload = {
    fullName,
    phone,
    email,
    password,
    confirmPassword,
    termsAccepted: terms.toLowerCase() === 'y',
  };

  const res = await sendRequest('/api/auth/register', 'POST', payload);
  if (res?.ok) {
    lastSavedEmail = email;
    if (res.data?.verificationToken) {
      lastSavedToken = res.data.verificationToken;
      console.log(c.success(`✅ Đăng ký thành công! Token kích hoạt đã được ghi nhớ.`));
      if (res.data.verificationLink) {
        console.log(c.info(`🔗 Link kích hoạt email: ${res.data.verificationLink}`));
      }
    }
  }
}

// ─── 2. Test Kích Hoạt Tài Khoản (Verify Email Token) ────────────────────────
async function testVerifyEmail() {
  console.log(c.header('\n=== 🔑 2. TEST KÍCH HOẠT TÀI KHOẢN (GET /api/auth/verify?token=...) ==='));
  const token = await ask('Nhập Verification Token', lastSavedToken);
  if (!token) {
    console.log(c.error('Vui lòng cung cấp token để kích hoạt.'));
    return;
  }
  await sendRequest(`/api/auth/verify?token=${encodeURIComponent(token)}`, 'GET');
}

// ─── 3. Test Gửi Lại Link Kích Hoạt (Resend Verification) ────────────────────
async function testResendVerification() {
  console.log(c.header('\n=== 🔄 3. TEST GỬI LẠI LINK KÍCH HOẠT (POST /api/auth/resend-verification) ==='));
  const email = await ask('Nhập Email tài khoản cần kích hoạt', lastSavedEmail);
  const res = await sendRequest('/api/auth/resend-verification', 'POST', { email });
  if (res?.ok && res.data?.verificationToken) {
    lastSavedToken = res.data.verificationToken;
    console.log(c.success('✅ Đã cấp lại token kích hoạt mới!'));
  }
}

// ─── 4. Test Đăng Nhập Học Viên (Sign In) ────────────────────────────────────
async function testLogin() {
  console.log(c.header('\n=== 🚪 4. TEST ĐĂNG NHẬP (POST /api/auth/login) ==='));
  const email = await ask('Nhập Email đăng nhập', lastSavedEmail || 'nguyenvana@gmail.com');
  const password = await ask('Nhập Mật khẩu', 'Password123!');
  const remember = await ask('Ghi nhớ đăng nhập? (y/n)', 'n');

  const payload = {
    email,
    password,
    rememberMe: remember.toLowerCase() === 'y',
  };

  const res = await sendRequest('/api/auth/login', 'POST', payload);
  if (res?.ok && res.data?.accessToken) {
    lastSavedToken = res.data.accessToken;
    lastSavedEmail = email;
    console.log(c.success(`✅ Đăng nhập thành công! Đã lưu accessToken để kiểm tra /me và /session.`));
  }
}

// ─── 5. Test Quên Mật Khẩu - Gửi OTP ─────────────────────────────────────────
async function testForgotPassword() {
  console.log(c.header('\n=== 📧 5. TEST QUÊN MẬT KHẨU - GỬI OTP (POST /api/auth/forgot-password) ==='));
  const email = await ask('Nhập Email cần khôi phục mật khẩu', lastSavedEmail || 'nguyenvana@gmail.com');
  lastSavedEmail = email;
  await sendRequest('/api/auth/forgot-password', 'POST', { email });
}

// ─── 6. Test Xác Thực Mã OTP ────────────────────────────────────────────────
async function testVerifyOtp() {
  console.log(c.header('\n=== 🔢 6. TEST XÁC THỰC MÃ OTP (POST /api/auth/verify-forgot-otp) ==='));
  const email = await ask('Nhập Email', lastSavedEmail || 'nguyenvana@gmail.com');
  const otp = await ask('Nhập Mã OTP (6 số)', '123456');

  const res = await sendRequest('/api/auth/verify-forgot-otp', 'POST', { email, otp });
  if (res?.ok && res.data?.resetToken) {
    lastSavedResetToken = res.data.resetToken;
    console.log(c.success(`✅ OTP chính xác! Đã lưu resetToken để dùng cho bước Đặt lại mật khẩu.`));
  }
}

// ─── 7. Test Đặt Lại Mật Khẩu Mới (Reset Password) ───────────────────────────
async function testResetPassword() {
  console.log(c.header('\n=== 🔒 7. TEST ĐẶT LẠI MẬT KHẨU MỚI (POST /api/auth/reset-password) ==='));
  const resetToken = await ask('Nhập Reset Token', lastSavedResetToken);
  if (!resetToken) {
    console.log(c.error('Thiếu resetToken. Vui lòng thực hiện bước xác thực OTP trước.'));
    return;
  }
  const newPassword = await ask('Nhập Mật khẩu mới', 'NewSecretPass123!');
  const confirmPassword = await ask('Xác nhận Mật khẩu mới', newPassword);

  await sendRequest('/api/auth/reset-password', 'POST', {
    resetToken,
    newPassword,
    confirmPassword,
  });
}

// ─── 8. Test Lấy Hồ Sơ Học Viên & Phiên Làm Việc ─────────────────────────────
async function testProfileAndSession() {
  console.log(c.header('\n=== 👤 8. TEST THÔNG TIN HỒ SƠ & PHIÊN ĐĂNG NHẬP ==='));
  const token = await ask('Nhập Access Token', lastSavedToken);
  if (!token) {
    console.log(c.error('Vui lòng đăng nhập trước hoặc dán Bearer token.'));
    return;
  }
  console.log(c.info('👉 Gọi GET /api/auth/me...'));
  await sendRequest('/api/auth/me', 'GET', null, token);

  console.log(c.info('👉 Gọi GET /api/auth/session...'));
  await sendRequest('/api/auth/session', 'GET', null, token);
}

// ─── 9. Đổi URL Máy Chủ Mục Tiêu ─────────────────────────────────────────────
async function changeTargetUrl() {
  console.log(c.header('\n=== 🌐 9. ĐỔI MÁY CHỦ MỤC TIÊU (LOCAL / RAILWAY) ==='));
  console.log(`Máy chủ hiện tại: ${c.key(currentTargetUrl)}`);
  const newUrl = await ask('Nhập URL mới (ví dụ: https://<ten-app>.up.railway.app hoặc http://localhost:5000)');
  if (newUrl) {
    currentTargetUrl = newUrl.replace(/\/$/, '');
    console.log(c.success(`✅ Đã cập nhật máy chủ mục tiêu thành: ${currentTargetUrl}`));
  }
}

// ─── MAIN MENU ───────────────────────────────────────────────────────────────
async function mainMenu() {
  while (true) {
    console.log(`\n${c.header('╔═══════════════════════════════════════════════════════════════╗')}`);
    console.log(`${c.header('║       THINKUP BACKEND INTERACTIVE RECHECK TOOL (AUTH)         ║')}`);
    console.log(`${c.header('╚═══════════════════════════════════════════════════════════════╝')}`);
    console.log(`🌐 Mục tiêu API: ${c.success(currentTargetUrl)}`);
    if (lastSavedEmail) console.log(`📧 Email đang lưu: ${c.info(lastSavedEmail)}`);
    if (lastSavedToken) console.log(`🔑 Token đang lưu: ${c.dim(lastSavedToken.slice(0, 25) + '...')}`);
    console.log(`${c.dim('─'.repeat(63))}`);
    console.log(`  ${c.bright('[1]')} 📝 Đăng ký tài khoản học viên (Register)`);
    console.log(`  ${c.bright('[2]')} 🔑 Kích hoạt tài khoản qua Token (Verify Email)`);
    console.log(`  ${c.bright('[3]')} 🔄 Gửi lại link kích hoạt tài khoản (Resend Verification)`);
    console.log(`  ${c.bright('[4]')} 🚪 Đăng nhập Email & Mật khẩu (Login)`);
    console.log(`  ${c.bright('[5]')} 📧 Quên mật khẩu - Yêu cầu gửi OTP (Forgot Password)`);
    console.log(`  ${c.bright('[6]')} 🔢 Xác thực mã OTP 6 số (Verify OTP)`);
    console.log(`  ${c.bright('[7]')} 🔒 Đặt lại mật khẩu mới (Reset Password)`);
    console.log(`  ${c.bright('[8]')} 👤 Kiểm tra hồ sơ & Phiên đăng nhập (/me & /session)`);
    console.log(`  ${c.bright('[9]')} 🌐 Đổi URL máy chủ mục tiêu (Localhost / Railway)`);
    console.log(`  ${c.bright('[0]')} ❌ Thoát (Exit)`);
    console.log(`${c.dim('─'.repeat(63))}`);

    const choice = await ask('Chọn chức năng [0-9]', '1');

    switch (choice) {
      case '1':
        await testRegister();
        break;
      case '2':
        await testVerifyEmail();
        break;
      case '3':
        await testResendVerification();
        break;
      case '4':
        await testLogin();
        break;
      case '5':
        await testForgotPassword();
        break;
      case '6':
        await testVerifyOtp();
        break;
      case '7':
        await testResetPassword();
        break;
      case '8':
        await testProfileAndSession();
        break;
      case '9':
        await changeTargetUrl();
        break;
      case '0':
        console.log(c.success('\n👋 Tạm biệt! Kết thúc phiên recheck.\n'));
        rl.close();
        return;
      default:
        console.log(c.error('Lựa chọn không hợp lệ, vui lòng chọn từ 0 đến 9.'));
    }
  }
}

mainMenu().catch((err) => {
  console.error('Lỗi ngoài dự kiến:', err);
  rl.close();
});
