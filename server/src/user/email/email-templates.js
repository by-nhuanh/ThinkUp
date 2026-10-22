/**
 * ThinkUp Email Templates System
 * Thiết kế giao diện email chuẩn Gmail / Email clients với tông màu xanh dương chủ đạo của ThinkUp:
 * - Primary Brand Color: #0088E8 (ThinkUp Blue)
 * - Gradient Accent: #0088E8 -> #257FE6 -> #3898EC
 * - Neutral Dark: #0F172A / #090909
 * - Background: #F4F7FB
 * - Container Card: #FFFFFF với border radius 16px, shadow mềm và viền subtle
 */

function getCleanClientUrl(url) {
  const fallback = 'https://think-up-edu.vercel.app';
  if (!url) return fallback;
  const first = url.split(',')[0].trim();
  return first.replace(/\/+$/, '') || fallback;
}

/**
 * Layout bọc chung cho tất cả email ThinkUp
 */
export function renderBaseEmailLayout({
  previewText = '',
  title = '',
  contentHtml = '',
  clientUrl = '',
}) {
  const currentYear = new Date().getFullYear();
  const primarySiteUrl = getCleanClientUrl(clientUrl || process.env.CLIENT_URL);

  return `
<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title || 'ThinkUp Education'}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #F4F7FB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; border-radius: 0 !important; }
      .content-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .otp-code { font-size: 28px !important; letter-spacing: 6px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F7FB; color: #334155;">
  <!-- Preview Text (Hiển thị tóm tắt ngoài danh sách hộp thư Gmail) -->
  ${previewText ? `
  <div style="display: none; font-size: 1px; color: #F4F7FB; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    ${previewText}
    &#847; &zwnj; &nbsp; &#8199; &shy; &#847; &zwnj; &nbsp; &#8199; &shy;
  </div>` : ''}

  <!-- Outer Background Table -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F4F7FB; width: 100%;">
    <tr>
      <td align="center" style="padding: 36px 12px 48px 12px;">

        <!-- Main Card Container (Max Width 580px) -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 580px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 8px 30px rgba(0, 136, 232, 0.06); margin: 0 auto;">

          <!-- Top Brand Accent Bar (Gradient ThinkUp Blue) -->
          <tr>
            <td style="background: linear-gradient(90deg, #0088E8 0%, #257FE6 60%, #3898EC 100%); height: 5px; font-size: 0; line-height: 0;">
              &nbsp;
            </td>
          </tr>

          <!-- Header: Brand Logo ThinkUp -->
          <tr>
            <td align="center" style="padding: 32px 32px 16px 32px;" class="content-padding">
              <a href="${primarySiteUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                  <tr>
                    <td style="vertical-align: middle; padding-right: 10px;">
                      <!-- ThinkUp Logo Icon (SVG hình học chuẩn logo thương hiệu ThinkUp) -->
                      <svg width="34" height="33" viewBox="0 0 33 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                        <path d="M8.11094 14.2222C12.1978 14.2222 15.5109 11.0385 15.5109 7.11111C15.5109 3.18375 12.1978 0 8.11094 0C4.02403 0 0.710938 3.18375 0.710938 7.11111C0.710938 11.0385 4.02403 14.2222 8.11094 14.2222Z" fill="#3898EC"/>
                        <path d="M32.0891 0H17.2891V14.2222H32.0891V0Z" fill="#090909"/>
                        <path d="M0.710938 15.6445H15.5109V32.0001L0.710938 15.6445Z" fill="#9BD1FF"/>
                        <path d="M32.0891 22.9137V15.6445H24.6891H17.2891V32.0001H24.2996C28.6015 32.0001 32.0891 27.9319 32.0891 22.9137Z" fill="#257FE6"/>
                      </svg>
                    </td>
                    <td style="vertical-align: middle;">
                      <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; display: inline-block;">
                        <span style="color: #090909;">THINK</span><span style="color: #0088E8;">UP</span>
                      </span>
                    </td>
                  </tr>
                </table>
              </a>
              <div style="font-size: 12px; color: #64748B; margin-top: 6px; font-weight: 500; letter-spacing: 0.2px;">
                Nền tảng học tập & phát triển kỹ năng công nghệ
              </div>
            </td>
          </tr>

          <!-- Subtle Divider -->
          <tr>
            <td style="padding: 0 32px;" class="content-padding">
              <div style="height: 1px; background-color: #F1F5F9; width: 100%;"></div>
            </td>
          </tr>

          <!-- Card Body Content -->
          <tr>
            <td style="padding: 28px 36px 36px 36px;" class="content-padding">



              ${title ? `
              <!-- Main Email Title -->
              <h1 style="color: #0F172A; font-size: 22px; font-weight: 700; line-height: 1.35; margin-top: 0; margin-bottom: 18px; letter-spacing: -0.3px;">
                ${title}
              </h1>` : ''}

              <!-- Main Dynamic Content -->
              ${contentHtml}

            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #F1F5F9; padding: 24px 32px 28px 32px; text-align: center;" class="content-padding">

              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748B; line-height: 1.5;">
                Bạn nhận được email này vì địa chỉ của bạn đã được đăng ký trên hệ thống ThinkUp Education.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">
                © ${currentYear} ThinkUp Education. All rights reserved. • Email tự động, vui lòng không phản hồi trực tiếp.
              </p>
            </td>
          </tr>


        </table>
        <!-- End Main Card -->

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * 1. Template: Email kích hoạt tài khoản học viên (Signup Verification)
 */
export function renderSignupVerificationEmail({ name, verificationLink, expireHours = 12, clientUrl = '' }) {
  const userName = name || 'Học viên ThinkUp';

  const contentHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0; margin-bottom: 16px;">
      Xin chào <strong style="color: #0F172A;">${userName}</strong>,
    </p>

    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
      Chào mừng bạn gia nhập cộng đồng <strong>ThinkUp Education</strong>! Để bắt đầu khám phá các khóa học công nghệ và kích hoạt tài khoản của mình, vui lòng nhấn vào nút bên dưới:
    </p>

    <!-- Primary Action Button (ThinkUp Blue) -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0; width: 100%;">
      <tr>
        <td align="center">
          <a href="${verificationLink}" target="_blank" style="display: inline-block; padding: 14px 34px; background: linear-gradient(135deg, #0088E8 0%, #006AB5 100%); color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(0, 136, 232, 0.35); text-align: center; mso-padding-alt: 0;">
            <!--[if mso]><i style="letter-spacing: 25px; mso-font-width: -100%; mso-text-raise: 30pt">&nbsp;</i><![endif]-->
            <span style="mso-text-raise: 15pt;">Kích hoạt tài khoản ngay &rarr;</span>
            <!--[if mso]><i style="letter-spacing: 25px; mso-font-width: -100%">&nbsp;</i><![endif]-->
          </a>
        </td>
      </tr>
    </table>

    <!-- Expiration Warning Alert -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #0088E8; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
        ⏱️ <strong>Thời hạn hiệu lực:</strong> Liên kết kích hoạt này có hiệu lực trong vòng <strong>${expireHours} giờ</strong>.
      </p>
    </div>

    <!-- Fallback URL Container -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748B; font-weight: 600;">
        Nếu nút bấm trên không hoạt động, hãy copy liên kết sau dán vào trình duyệt:
      </p>
      <a href="${verificationLink}" target="_blank" style="font-size: 12px; color: #0088E8; word-break: break-all; text-decoration: underline; line-height: 1.4;">
        ${verificationLink}
      </a>
    </div>

    <p style="font-size: 13px; color: #94A3B8; margin-top: 24px; margin-bottom: 0; line-height: 1.5;">
      Nếu bạn không yêu cầu tạo tài khoản trên ThinkUp, vui lòng bỏ qua email này. Tài khoản của bạn sẽ không được kích hoạt nếu không có sự xác nhận từ bạn.
    </p>
  `;

  return renderBaseEmailLayout({
    previewText: `Chào mừng ${userName} đến với ThinkUp! Vui lòng xác thực tài khoản để bắt đầu học tập.`,
    title: 'Xác thực tài khoản học viên ThinkUp',
    contentHtml,
    clientUrl,
  });
}

/**
 * 2. Template: Email gửi lại liên kết kích hoạt (Resend Verification)
 */
export function renderResendVerificationEmail({ name, verificationLink, expireHours = 12, clientUrl = '' }) {
  const userName = name || 'Học viên ThinkUp';

  const contentHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0; margin-bottom: 16px;">
      Xin chào <strong style="color: #0F172A;">${userName}</strong>,
    </p>

    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
      Chúng tôi nhận được yêu cầu gửi lại liên kết kích hoạt cho tài khoản ThinkUp của bạn. Vui lòng bấm vào nút dưới đây để hoàn tất việc xác thực email:
    </p>

    <!-- Primary Action Button -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0; width: 100%;">
      <tr>
        <td align="center">
          <a href="${verificationLink}" target="_blank" style="display: inline-block; padding: 14px 34px; background: linear-gradient(135deg, #0088E8 0%, #006AB5 100%); color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 14px rgba(0, 136, 232, 0.35); text-align: center;">
            Kích hoạt tài khoản ngay &rarr;
          </a>
        </td>
      </tr>
    </table>

    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #0088E8; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
        ⏱️ <strong>Lưu ý:</strong> Liên kết mới này có hiệu lực trong vòng <strong>${expireHours} giờ</strong>. Liên kết cũ đã bị vô hiệu hóa.
      </p>
    </div>

    <!-- Fallback URL -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748B; font-weight: 600;">
        Hoặc copy liên kết sau vào trình duyệt của bạn:
      </p>
      <a href="${verificationLink}" target="_blank" style="font-size: 12px; color: #0088E8; word-break: break-all; text-decoration: underline; line-height: 1.4;">
        ${verificationLink}
      </a>
    </div>

    <p style="font-size: 13px; color: #94A3B8; margin-top: 24px; margin-bottom: 0; line-height: 1.5;">
      Nếu bạn không thực hiện yêu cầu này, hãy yên tâm bỏ qua email này.
    </p>
  `;

  return renderBaseEmailLayout({
    previewText: `Liên kết kích hoạt tài khoản ThinkUp mới của bạn (hiệu lực ${expireHours} giờ).`,
    title: 'Liên kết kích hoạt tài khoản ThinkUp',
    contentHtml,
    clientUrl,
  });
}

/**
 * 3. Template: Email mã xác thực OTP đặt lại mật khẩu (Forgot Password OTP)
 */
export function renderForgotPasswordOtpEmail({ otpCode, expireMinutes = 5, clientUrl = '' }) {
  const contentHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0; margin-bottom: 16px;">
      Xin chào bạn,
    </p>

    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
      Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ThinkUp của bạn. Vui lòng nhập mã OTP 6 chữ số dưới đây vào màn hình xác thực:
    </p>

    <!-- Prominent OTP Code Container (ThinkUp Light Blue + Primary Blue Border) -->
    <div style="background: linear-gradient(180deg, #F0F7FF 0%, #E6F2FF 100%); border: 2px dashed #0088E8; border-radius: 12px; padding: 22px 16px; text-align: center; margin: 24px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #006AB5; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 10px;">
        MÃ XÁC THỰC CỦA BẠN (OTP)
      </div>
      <div class="otp-code" style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #006AB5; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; padding-left: 10px; text-shadow: 0 1px 2px rgba(0, 106, 181, 0.15);">
        ${otpCode}
      </div>
      <div style="margin-top: 10px; font-size: 13px; color: #475569; font-weight: 500;">
        ⏱️ Mã có hiệu lực trong vòng <strong>${expireMinutes} phút</strong>
      </div>
    </div>

    <!-- Security Warning Shield Box -->
    <div style="background-color: #FEF2F2; border: 1px solid #FEE2E2; border-left: 4px solid #EF4444; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #991B1B;">
        Cảnh báo bảo mật quan trọng:
      </p>
      <p style="margin: 0; font-size: 12.5px; color: #7F1D1D; line-height: 1.5;">
        Tuyệt đối không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên tự xưng từ ThinkUp. Nếu bạn không gửi yêu cầu này, có thể ai đó đang cố gắng truy cập tài khoản của bạn — vui lòng đổi mật khẩu ngay lập tức.
      </p>
    </div>
  `;

  return renderBaseEmailLayout({
    previewText: `Mã xác thực OTP ThinkUp của bạn là: ${otpCode} (hiệu lực ${expireMinutes} phút).`,
    title: 'Mã xác thực đặt lại mật khẩu',
    contentHtml,
    clientUrl,
  });
}

/**
 * 4. Template: Email chào mừng đăng ký nhận bản tin (Newsletter Welcome)
 */
export function renderNewsletterWelcomeEmail({ email = '', clientUrl = '' }) {
  const primarySiteUrl = getCleanClientUrl(clientUrl || process.env.CLIENT_URL);
  const blogUrl = `${primarySiteUrl}/blog`;

  const contentHtml = `
    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0; margin-bottom: 16px;">
      Xin chào bạn,
    </p>

    <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
      Cảm ơn bạn đã đăng ký nhận bản tin từ <strong>ThinkUp Education</strong>! Từ bây giờ, bạn sẽ luôn là người đầu tiên cập nhật những thông tin và kiến thức công nghệ hữu ích nhất:
    </p>

    <!-- Highlights Features Table -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0 24px 0;">
      <tr>
        <td style="padding: 12px 14px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; margin-bottom: 10px;">
          <div style="font-size: 14px; font-weight: 700; color: #006AB5; margin-bottom: 4px;">
            Bài viết chuyên sâu công nghệ
          </div>
          <div style="font-size: 13px; color: #64748B; line-height: 1.5;">
            Các bài phân tích, thủ thuật lập trình Web, Cloud, AI và công nghệ mới.
          </div>
        </td>
      </tr>
      <tr><td style="height: 10px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
      <tr>
        <td style="padding: 12px 14px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;">
          <div style="font-size: 14px; font-weight: 700; color: #006AB5; margin-bottom: 4px;">
            Định hướng & lộ trình nghề nghiệp IT
          </div>
          <div style="font-size: 13px; color: #64748B; line-height: 1.5;">
            Kinh nghiệm thực chiến, mẹo phỏng vấn và lộ trình thăng tiến dành cho lập trình viên.
          </div>
        </td>
      </tr>
    </table>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0; width: 100%;">
      <tr>
        <td align="center">
          <a href="${blogUrl}" target="_blank" style="display: inline-block; padding: 13px 32px; background: linear-gradient(135deg, #0088E8 0%, #006AB5 100%); color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 14px rgba(0, 136, 232, 0.35); text-align: center;">
            Khám phá ThinkUp Blog &rarr;
          </a>
        </td>
      </tr>
    </table>

    <p style="font-size: 13px; color: #94A3B8; margin-top: 24px; margin-bottom: 0; line-height: 1.5;">
      Nếu bạn không thực hiện đăng ký này, vui lòng bỏ qua email.
    </p>
  `;

  return renderBaseEmailLayout({
    previewText: 'Chào mừng bạn đến với Bản tin ThinkUp! Cập nhật kiến thức lập trình & công nghệ mới nhất.',
    title: 'Chào mừng bạn đến với ThinkUp Blog!',
    contentHtml,
    clientUrl,
  });
}

/**
 * 5. Template: Email thông báo bài viết Blog mới xuất bản (New Blog Post Alert)
 */
export function renderNewBlogPostEmail({
  title,
  description = '',
  category = 'Công nghệ',
  readTime = '5 phút đọc',
  coverImage = '',
  postUrl = '',
  clientUrl = '',
}) {
  const contentHtml = `
    <div style="margin-bottom: 16px;">
      <span style="display: inline-block; padding: 4px 12px; background-color: #EEF7FF; color: #006AB5; border: 1px solid #B7E1FF; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase;">
        ${category}
      </span>
      <span style="margin-left: 8px; font-size: 12.5px; color: #64748B;">
        • ⏱️ ${readTime}
      </span>
    </div>

    ${coverImage ? `
    <div style="margin: 18px 0; border-radius: 10px; overflow: hidden; border: 1px solid #E2E8F0;">
      <a href="${postUrl}" target="_blank">
        <img src="${coverImage}" alt="${title}" style="width: 100%; max-height: 300px; object-fit: cover; display: block;" />
      </a>
    </div>` : ''}

    <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 16px 0 24px 0;">
      ${description}
    </p>

    <!-- Action Button -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0; width: 100%;">
      <tr>
        <td align="center">
          <a href="${postUrl}" target="_blank" style="display: inline-block; padding: 13px 32px; background: linear-gradient(135deg, #0088E8 0%, #006AB5 100%); color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14.5px; box-shadow: 0 4px 14px rgba(0, 136, 232, 0.35); text-align: center;">
            Đọc bài viết ngay &rarr;
          </a>
        </td>
      </tr>
    </table>
  `;

  return renderBaseEmailLayout({
    previewText: `Bài viết mới: ${title} | ${category} (${readTime})`,
    title: title,
    contentHtml,
    clientUrl,
  });
}
