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
  console.log(`\n===============================================================`);
  console.log(`  🧪 KIỂM TRA QUÊN MẬT KHẨU & ĐẶT LẠI MẬT KHẨU (FORGOT PASSWORD)`);
  console.log(`===============================================================\n`);

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

  // BƯỚC 1: YÊU CẦU MÃ OTP
  console.log(`──────────────────────────────────────────────────`);
  console.log(`BƯỚC 1: GỬI MÃ OTP KHÔI PHỤC MẬT KHẨU`);
  console.log(`──────────────────────────────────────────────────`);
  const email = await ask('Nhập Email cần khôi phục', 'test_forgot_user@thinkup.vn');

  console.log(`\n⏳ Đang gửi yêu cầu tới: POST ${apiBase}/api/auth/forgot-password ...`);
  try {
    const res1 = await fetch(`${apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });

    const data1 = await res1.json();
    console.log(`👉 Mã phản hồi: HTTP ${res1.status} ${res1.statusText}`);
    console.log(JSON.stringify(data1, null, 2));

    if (!res1.ok) {
      console.log(`\n❌ Yêu cầu OTP thất bại: ${data1.message}`);
      rl.close();
      return;
    }

    console.log(`\n📩 Đã gửi yêu cầu OTP tới email: ${data1.maskedEmail || email}`);
    console.log(`💡 Mẹo: Kiểm tra hộp thư Gmail của bạn (kể cả hòm thư Spam/Rác) để lấy mã OTP 6 số.`);

    // BƯỚC 2: XÁC THỰC MÃ OTP
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`BƯỚC 2: XÁC THỰC MÃ OTP`);
    console.log(`──────────────────────────────────────────────────`);
    const otp = await ask('Nhập mã OTP gồm 6 chữ số');

    console.log(`\n⏳ Đang xác thực OTP tới: POST ${apiBase}/api/auth/verify-forgot-otp ...`);
    const res2 = await fetch(`${apiBase}/api/auth/verify-forgot-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
    });

    const data2 = await res2.json();
    console.log(`👉 Mã phản hồi: HTTP ${res2.status} ${res2.statusText}`);
    console.log(JSON.stringify(data2, null, 2));

    const resetToken = data2.resetToken || data2.token;

    if (!res2.ok || !resetToken) {
      console.log(`\n❌ Xác thực OTP không thành công: ${data2.message || 'Mã OTP không đúng hoặc đã hết hạn.'}`);
      rl.close();
      return;
    }

    console.log(`\n✅ XÁC THỰC OTP THÀNH CÔNG!`);
    console.log(`🔑 Reset Token được cấp: ${resetToken.slice(0, 30)}...`);

    // BƯỚC 3: ĐẶT MẬT KHẨU MỚI
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`BƯỚC 3: THIẾT LẬP MẬT KHẨU MỚI`);
    console.log(`──────────────────────────────────────────────────`);
    const defaultNewPass = 'ThinkUp@NewPass2026!';
    const newPassword = await ask('Nhập Mật khẩu mới', defaultNewPass);
    const confirmPassword = await ask('Xác nhận Mật khẩu mới', newPassword);

    console.log(`\n⏳ Đang cập nhật mật khẩu mới tới: POST ${apiBase}/api/auth/reset-password ...`);
    const res3 = await fetch(`${apiBase}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken,
        newPassword: newPassword.trim(),
        confirmPassword: confirmPassword.trim(),
      }),
    });

    const data3 = await res3.json();
    console.log(`👉 Mã phản hồi: HTTP ${res3.status} ${res3.statusText}`);
    console.log(JSON.stringify(data3, null, 2));

    if (res3.ok) {
      console.log(`\n🎉 CHÚC MỪNG! ĐÃ ĐỔI MẬT KHẨU THÀNH CÔNG!`);
      console.log(`👉 Bạn có thể đăng nhập ngay với mật khẩu mới bằng lệnh:`);
      console.log(`   npm run recheck:signin`);
    } else {
      console.log(`\n❌ Đổi mật khẩu thất bại: ${data3.message}`);
    }
  } catch (err) {
    console.error(`\n❌ Lỗi kết nối:`, err.message);
  } finally {
    rl.close();
  }
}

main();
