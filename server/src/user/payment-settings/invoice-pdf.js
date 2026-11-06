import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

// PDFKit requires embeddable TrueType fonts. The WOFF files from fontsource
// are intended for browsers and can render Vietnamese combining marks poorly
// in generated PDFs. Use the full Noto Sans TTF files bundled with the server.
const regularFont = fileURLToPath(new URL('../../assets/fonts/NotoSans-Regular.ttf', import.meta.url));
const boldFont = fileURLToPath(new URL('../../assets/fonts/NotoSans-Bold.ttf', import.meta.url));
const money = value => new Intl.NumberFormat('vi-VN').format(Number(value) || 0) + ' ₫';

export function createInvoicePdf(detail) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: detail.invoice.code } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.registerFont('NotoSans', regularFont).registerFont('NotoSansBold', boldFont);

    doc.font('NotoSansBold').fontSize(22).fillColor('#1E4AD7').text('THINKUP');
    doc.fontSize(18).fillColor('#0F172A').text('HÓA ĐƠN THANH TOÁN', { align: 'right' });
    doc.moveDown().font('NotoSans').fontSize(10).fillColor('#475569');
    doc.text(`Mã hóa đơn: ${detail.invoice.code}`);
    doc.text(`Mã đơn hàng: ${detail.order_id}`);
    doc.text(`Ngày phát hành: ${detail.invoice.issuedAt}`);
    doc.moveDown().font('NotoSansBold').fontSize(12).fillColor('#0F172A').text('THÔNG TIN NGƯỜI MUA');
    doc.font('NotoSans').fontSize(10).text(`Họ tên: ${detail.buyer.name}`);
    doc.text(`Email: ${detail.buyer.email || '-'}`);
    doc.text(`Số điện thoại: ${detail.buyer.phone || '-'}`);
    doc.moveDown().font('NotoSansBold').fontSize(12).text('NỘI DUNG ĐƠN HÀNG');
    detail.order.courses.forEach((course, index) => {
      doc.font('NotoSansBold').fontSize(10).text(`${index + 1}. ${course.title}`);
      doc.font('NotoSans').fillColor('#475569').text(`Giảng viên: ${course.instructor}   Thành tiền: ${money(course.price_number)}`);
    });
    doc.moveDown().fillColor('#0F172A').font('NotoSans').text(`Tạm tính: ${money(detail.order.subtotal_number)}`, { align: 'right' });
    doc.text(`Giảm giá khóa học: -${money(detail.order.course_discount_number)}`, { align: 'right' });
    if (detail.order.voucher_discount_number) doc.text(`Mã ${detail.order.voucher_code}: -${money(detail.order.voucher_discount_number)}`, { align: 'right' });
    doc.font('NotoSansBold').fontSize(13).fillColor('#1E4AD7').text(`TỔNG THANH TOÁN: ${money(detail.order.total_number)}`, { align: 'right' });
    doc.moveDown().fillColor('#0F172A').fontSize(12).text('THÔNG TIN THANH TOÁN');
    doc.font('NotoSans').fontSize(10).text(`Phương thức: ${detail.payment.method}`);
    doc.text(`Mã giao dịch: ${detail.transaction_id}`);
    doc.text(`Thời gian thanh toán: ${detail.payment.paidAt}`);
    doc.text(`Trạng thái: ${detail.status_label}`);
    doc.moveDown(2).fontSize(9).fillColor('#64748B').text('Hóa đơn được tạo từ hệ thống ThinkUp.', { align: 'center' });
    doc.end();
  });
}
