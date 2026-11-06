import { renderBaseEmailLayout } from './email-templates.js';

/**
 * Định dạng tiền tệ VND cho email
 */
function formatEmailVND(value) {
  const num = Math.round(Number(value) || 0);
  return `${new Intl.NumberFormat('vi-VN').format(num)}đ`;
}

/**
 * Render email hóa đơn / biên lai thanh toán thành công khóa học
 *
 * @param {object} params
 * @param {string} params.userName - Họ tên học viên
 * @param {string} params.orderId - Mã đơn hàng (VD: DH2026102100000001)
 * @param {string} params.transactionId - Mã giao dịch (VD: GD2026102100000001)
 * @param {string} params.paymentMethod - Tên phương thức thanh toán
 * @param {number} params.totalAmount - Tổng số tiền thanh toán thực trả
 * @param {Array<{id: string, title: string, price: number, thumbnail?: string}>} params.courses - Danh sách khóa học
 * @param {string} params.paidAt - Thời gian thanh toán (VD: "21/10/2026 09:30:00")
 * @param {string} params.clientUrl - Địa chỉ frontend (để tạo nút Xem khóa học / Xem hóa đơn)
 * @returns {string} HTML string email
 */
export function renderPaymentReceiptEmail({
  userName = 'Học viên',
  orderId = '',
  transactionId = '',
  paymentMethod = 'Chuyển khoản trực tiếp',
  totalAmount = 0,
  courses = [],
  paidAt = '',
  clientUrl = '',
}) {
  const coursesListHtml = courses.map((c) => `
    <tr style="border-bottom: 1px solid #E2E8F0;">
      <td style="padding: 12px 0; color: #1E293B; font-weight: 500; font-size: 14px;">
        ${c.title}
      </td>
      <td style="padding: 12px 0; text-align: right; color: #0F172A; font-weight: 600; font-size: 14px; white-space: nowrap;">
        ${formatEmailVND(c.price || c.salePrice || 0)}
      </td>
    </tr>
  `).join('');

  const baseUrl = (clientUrl || process.env.CLIENT_URL || 'https://think-up-edu.vercel.app').split(',')[0].trim().replace(/\/+$/, '');
  const myCoursesUrl = `${baseUrl}/main/my-courses`;
  const invoiceUrl = `${baseUrl}/main/profile/billing/${encodeURIComponent(orderId)}`;

  const contentHtml = `
    <!-- Header Thông báo thành công -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 64px; height: 64px; line-height: 64px; border-radius: 50%; background-color: #DEF7EC; color: #0E9F6E; font-size: 32px; font-weight: bold; margin-bottom: 12px;">
        ✓
      </div>
      <h2 style="color: #0F172A; font-size: 20px; font-weight: 700; margin: 0 0 6px 0;">
        Thanh toán thành công!
      </h2>
      <p style="color: #64748B; font-size: 14px; margin: 0;">
        Xin chào <strong>${userName}</strong>, ThinkUp đã kích hoạt đầy đủ quyền truy cập các khóa học của bạn.
      </p>
    </div>

    <!-- Hộp tóm tắt đơn hàng & giao dịch -->
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding: 4px 0; color: #64748B; font-size: 13px;">Mã đơn hàng:</td>
          <td style="padding: 4px 0; text-align: right; color: #0F172A; font-weight: 600; font-size: 13.5px;">${orderId}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B; font-size: 13px;">Mã giao dịch:</td>
          <td style="padding: 4px 0; text-align: right; color: #0088E8; font-weight: 600; font-size: 13.5px;">${transactionId}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B; font-size: 13px;">Phương thức:</td>
          <td style="padding: 4px 0; text-align: right; color: #0F172A; font-size: 13px;">${paymentMethod}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #64748B; font-size: 13px;">Thời gian thanh toán:</td>
          <td style="padding: 4px 0; text-align: right; color: #0F172A; font-size: 13px;">${paidAt || new Date().toLocaleString('vi-VN')}</td>
        </tr>
      </table>
    </div>

    <!-- Danh sách khóa học được mở khóa -->
    <div style="margin-bottom: 24px;">
      <h3 style="color: #0F172A; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
        Chi tiết khóa học đã kích hoạt (${courses.length})
      </h3>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #E2E8F0;">
            <th align="left" style="padding: 8px 0; color: #64748B; font-size: 12px; text-transform: uppercase;">Khóa học</th>
            <th align="right" style="padding: 8px 0; color: #64748B; font-size: 12px; text-transform: uppercase;">Học phí</th>
          </tr>
        </thead>
        <tbody>
          ${coursesListHtml}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding: 16px 0 0 0; color: #0F172A; font-weight: 700; font-size: 15px;">Tổng thanh toán:</td>
            <td style="padding: 16px 0 0 0; text-align: right; color: #0088E8; font-weight: 800; font-size: 18px;">
              ${formatEmailVND(totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Nút hành động kêu gọi vào học & xem hóa đơn -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 16px 0;">
      <tr>
        <td align="center">
          <a href="${myCoursesUrl}" target="_blank" style="display: inline-block; padding: 13px 32px; background: linear-gradient(135deg, #0088E8 0%, #006AB5 100%); color: #FFFFFF; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14.5px; box-shadow: 0 4px 14px rgba(0, 136, 232, 0.35); text-align: center; margin-right: 10px;">
            Vào học ngay &rarr;
          </a>
          <a href="${invoiceUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background: #F1F5F9; color: #334155; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; text-align: center; border: 1px solid #CBD5E1;">
            Xem hóa đơn điện tử
          </a>
        </td>
      </tr>
    </table>

    <p style="color: #64748B; font-size: 12.5px; line-height: 1.5; text-align: center; margin: 20px 0 0 0;">
      Hóa đơn điện tử hợp lệ theo quy định đã được phát hành và lưu trữ trong tài khoản của bạn tại mục <strong>Lịch sử mua hàng</strong>.
    </p>
  `;

  return renderBaseEmailLayout({
    previewText: `Thanh toán thành công đơn hàng ${orderId} - Khóa học của bạn đã sẵn sàng`,
    title: `Biên lai thanh toán đơn hàng ${orderId}`,
    contentHtml,
    clientUrl: baseUrl,
  });
}
