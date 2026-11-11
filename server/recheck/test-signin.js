import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';
dotenv.config();

const rl = readline.createInterface({ input, output });

async function ask(question, defaultValue = '') {
  const prompt = defaultValue ? `${question} [Mặc định: ${defaultValue}]: ` : `${question}: `;
  const answer = await rl.question(prompt);
  return answer.trim() || defaultValue;
}

async function main() {
  console.log(`\n==================================================`);
  console.log(`  🧪 KIỂM TRA CHỨC NĂNG ĐĂNG NHẬP (SIGN IN)`);
  console.log(`==================================================\n`);

  console.log(`Chọn máy chủ để kiểm tra:`);
  console.log(`  1. Local Server (http://localhost:5000) [Khuyến nghị khi test local]`);
  console.log(`  2. Production Railway (${process.env.API_URL || 'https://thinkup-production-b2bd.up.railway.app'})`);
  console.log(`  3. Nhập URL máy chủ tùy chỉnh\n`);

  const envChoice = await ask('Chọn môi trường (1/2/3)', '1');
  let apiBase = 'http://localhost:5000';
  if (envChoice === '2') {
    apiBase = process.env.API_URL || 'https://thinkup-production-b2bd.up.railway.app';
  } else if (envChoice === '3') {
    apiBase = await ask('Nhập API Base URL', 'http://localhost:5000');
  }

  apiBase = apiBase.replace(/\/+$/, '');
  console.log(`\n🎯 Đang trỏ tới: ${apiBase}\n`);

  const email = await ask('1. Nhập Email học viên', 'test_signin_sample@thinkup.vn');
  const password = await ask('2. Nhập Mật khẩu', 'TestPass123!');
  const remember = await ask('3. Ghi nhớ đăng nhập (Remember Me)? (y/n)', 'n');

  const payload = {
    email: email.trim(),
    password: password.trim(),
    rememberMe: remember.toLowerCase() === 'y',
  };

  console.log(`\n⏳ Đang gửi yêu cầu đăng nhập tới: POST ${apiBase}/api/auth/login ...`);

  try {
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`\n👉 Mã phản hồi: HTTP ${res.status} ${res.statusText}`);
    console.log('👉 Chi tiết kết quả phản hồi từ Backend:');
    console.log(JSON.stringify(data, null, 2));

    if (res.ok) {
      console.log(`\n🎉 ĐĂNG NHẬP THÀNH CÔNG!`);
      const token = data.accessToken || data.token;

      if (token) {
        console.log(`🔑 Access Token: Bearer ${token.slice(0, 35)}...`);

        // Tự động kiểm tra phiên đăng nhập qua /api/auth/session
        console.log(`\n⏳ Đang kiểm tra phiên đăng nhập (GET ${apiBase}/api/auth/session)...`);
        const sessionRes = await fetch(`${apiBase}/api/auth/session`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });
        const sessionData = await sessionRes.json();
        console.log(`👉 Kết quả xác thực phiên: HTTP ${sessionRes.status}`);
        console.log(JSON.stringify(sessionData, null, 2));

        if (sessionRes.ok && sessionData.isAuthenticated) {
          console.log(`\n✅ PHIÊN ĐĂNG NHẬP HỢP LỆ! Token được máy chủ xác nhận 100%.`);
        }
      }
    } else {
      console.log(`\n❌ Đăng nhập thất bại: ${data.message || 'Lỗi không xác định'}`);
    }
  } catch (err) {
    console.error(`\n❌ Lỗi kết nối tới máy chủ:`, err.message);
    console.log(`💡 Hãy đảm bảo bạn đã chạy 'npm start' hoặc 'npm run dev' ở terminal backend.`);
  } finally {
    rl.close();
  }
}

main();
