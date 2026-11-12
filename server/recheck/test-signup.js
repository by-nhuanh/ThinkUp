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
  console.log(`  🧪 KIỂM TRA CHỨC NĂNG ĐĂNG KÝ HỌC VIÊN (SIGN UP)`);
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

  // Loại bỏ dấu / ở cuối nếu có
  apiBase = apiBase.replace(/\/+$/, '');
  console.log(`\n🎯 Đang trỏ tới: ${apiBase}\n`);

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const defaultFullName = 'Học Viên ThinkUp Test';
  const defaultPhone = '098' + Math.floor(1000000 + Math.random() * 9000000);
  const defaultEmail = `student_${Date.now()}@thinkup.vn`;
  const defaultPassword = 'ThinkUp@2026Test!';

  console.log(`💡 Mẹo: Nhấn Enter để dùng dữ liệu mẫu tự động sinh hợp lệ.\n`);

  const fullName = await ask('1. Nhập Họ và tên', defaultFullName);
  const phone = await ask('2. Nhập Số điện thoại (10 số, đầu 03/05/07/08/09)', defaultPhone);
  const email = await ask('3. Nhập Email', defaultEmail);
  const password = await ask('4. Nhập Mật khẩu (hoa, thường, số, ký tự đặc biệt)', defaultPassword);
  const confirmPassword = await ask('5. Xác nhận mật khẩu', password);

  const payload = {
    fullName,
    phone,
    email,
    password,
    confirmPassword,
    termsAccepted: true,
  };

  console.log(`\n⏳ Đang gửi yêu cầu đăng ký tới: POST ${apiBase}/api/auth/register ...`);

  try {
    const res = await fetch(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`\n👉 Mã phản hồi: HTTP ${res.status} ${res.statusText}`);
    console.log('👉 Chi tiết kết quả phản hồi từ Backend:');
    console.log(JSON.stringify(data, null, 2));

    if (res.ok) {
      console.log(`\n🎉 ĐĂNG KÝ HỌC VIÊN THÀNH CÔNG!`);
      if (data.studentId) {
        console.log(`🎓 Mã học viên được cấp: ${data.studentId}`);
      }

      // Xử lý kích hoạt tài khoản ngay nếu có token kích hoạt
      if (data.verificationToken || data.verificationLink) {
        let verifyUrl = data.verificationLink;
        if (!verifyUrl && data.verificationToken) {
          verifyUrl = `${apiBase}/api/auth/verify?token=${encodeURIComponent(data.verificationToken)}`;
        }

        console.log(`\n🔗 Link kích hoạt tài khoản:`);
        console.log(`   ${verifyUrl}`);

        const autoActivate = await ask('\n👉 Bạn có muốn kích hoạt tài khoản này ngay không? (y/n)', 'y');
        if (autoActivate.toLowerCase() === 'y') {
          console.log(`⏳ Đang thực hiện kích hoạt tài khoản...`);
          const tokenParam = data.verificationToken || new URL(verifyUrl).searchParams.get('token');
          const verifyEndpoint = `${apiBase}/api/auth/verify?token=${encodeURIComponent(tokenParam)}`;

          const verifyRes = await fetch(verifyEndpoint, {
            headers: { Accept: 'application/json' },
          });
          const verifyData = await verifyRes.json();

          console.log(`👉 Kết quả kích hoạt: HTTP ${verifyRes.status}`);
          console.log(JSON.stringify(verifyData, null, 2));

          if (verifyRes.ok) {
            console.log(`\n✅ TÀI KHOẢN ĐÃ ĐƯỢC KÍCH HOẠT THÀNH CÔNG!`);
            console.log(`👉 Bạn có thể dùng email [${email}] và mật khẩu [${password}] để kiểm tra đăng nhập qua lệnh:`);
            console.log(`   npm run recheck:signin`);
          } else {
            console.log(`\n❌ Kích hoạt không thành công: ${verifyData.message}`);
          }
        }
      }
    } else {
      console.log(`\n❌ Đăng ký thất bại: ${data.message || 'Lỗi không xác định'}`);
    }
  } catch (err) {
    console.error(`\n❌ Lỗi kết nối tới máy chủ:`, err.message);
    console.log(`💡 Hãy đảm bảo bạn đã chạy 'npm start' hoặc 'npm run dev' ở terminal backend.`);
  } finally {
    rl.close();
  }
}

main();
