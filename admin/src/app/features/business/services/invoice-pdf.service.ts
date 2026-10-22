import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { BusinessOrder } from '../models/business.models';

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  private fontData?: Promise<string>;

  async download(order: BusinessOrder): Promise<void> {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await this.registerVietnameseFont(pdf);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;
    const total = order.originalAmount - order.discount;
    const issuedAt = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
    }).format(new Date(order.createdAt));

    pdf.setFillColor(7, 27, 72);
    pdf.rect(0, 0, pageWidth, 46, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.text('THINKUP', margin, 19);
    pdf.setFontSize(9);
    pdf.text('NỀN TẢNG GIÁO DỤC TRỰC TUYẾN', margin, 27);
    pdf.setFontSize(15);
    pdf.text('HÓA ĐƠN BÁN HÀNG', pageWidth - margin, 18, { align: 'right' });
    pdf.setFontSize(9);
    pdf.text('SALES INVOICE', pageWidth - margin, 25, { align: 'right' });
    pdf.text(`Số: ${order.invoiceId ?? order.id}`, pageWidth - margin, 34, { align: 'right' });

    let y = 57;
    this.sectionTitle(pdf, 'THÔNG TIN HÓA ĐƠN', margin, y, contentWidth);
    y += 12;
    const invoiceColumnGap = 10;
    const invoiceColumnWidth = (contentWidth - invoiceColumnGap) / 2;
    const rightInvoiceColumn = margin + invoiceColumnWidth + invoiceColumnGap;
    this.labelValueRow(pdf, 'Ngày phát hành', issuedAt, margin, y, invoiceColumnWidth);
    this.labelValueRow(pdf, 'Mã đơn hàng', order.id, rightInvoiceColumn, y, invoiceColumnWidth);
    y += 10;
    this.labelValueRow(pdf, 'Trạng thái', this.statusLabel(order), margin, y, invoiceColumnWidth);
    this.labelValueRow(pdf, 'Mã giao dịch', order.transactionId ?? 'Chưa có', rightInvoiceColumn, y, invoiceColumnWidth);

    y += 17;
    this.sectionTitle(pdf, 'ĐƠN VỊ CUNG CẤP', margin, y, contentWidth / 2 - 3);
    this.sectionTitle(pdf, 'THÔNG TIN KHÁCH HÀNG', pageWidth / 2 + 3, y, contentWidth / 2 - 3);
    y += 12;
    this.contactLine(pdf, 'Nền tảng giáo dục ThinkUp', margin, y, true);
    this.labelValueRow(pdf, 'Họ và tên', order.learner, rightInvoiceColumn, y, invoiceColumnWidth);
    y += 8;
    this.contactLine(pdf, 'Dịch vụ đào tạo trực tuyến', margin, y);
    this.labelValueRow(pdf, 'Gmail', order.email, rightInvoiceColumn, y, invoiceColumnWidth);
    y += 8;
    this.contactLine(pdf, 'Hóa đơn điện tử được phát hành tự động', margin, y);
    this.labelValueRow(pdf, 'Số điện thoại', order.phone, rightInvoiceColumn, y, invoiceColumnWidth);

    y += 18;
    this.sectionTitle(pdf, 'CHI TIẾT DỊCH VỤ', margin, y, contentWidth);
    y += 9;
    pdf.setFillColor(243, 248, 254);
    pdf.rect(margin, y, contentWidth, 10, 'F');
    pdf.setTextColor(66, 91, 125);
    pdf.setFontSize(8);
    pdf.text('STT', margin + 3, y + 6.5);
    pdf.text('TÊN KHÓA HỌC / DỊCH VỤ', margin + 16, y + 6.5);
    pdf.text('THÀNH TIỀN', pageWidth - margin - 3, y + 6.5, { align: 'right' });
    y += 10;

    const unitPrice = Math.round(order.originalAmount / Math.max(order.courses.length, 1));
    order.courses.forEach((course, index) => {
      const lines = pdf.splitTextToSize(course, 105) as string[];
      const rowHeight = Math.max(12, lines.length * 5 + 5);
      pdf.setDrawColor(226, 234, 244);
      pdf.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      pdf.setTextColor(24, 44, 81);
      pdf.setFontSize(9);
      pdf.text(String(index + 1).padStart(2, '0'), margin + 3, y + 7);
      pdf.text(lines, margin + 16, y + 7);
      const amount = index === order.courses.length - 1 ? order.originalAmount - unitPrice * (order.courses.length - 1) : unitPrice;
      pdf.text(this.currency(amount), pageWidth - margin - 3, y + 7, { align: 'right' });
      y += rowHeight;
    });

    y += 7;
    this.totalRow(pdf, 'Tạm tính', order.originalAmount, y, pageWidth, margin);
    if (order.discount > 0) {
      y += 8;
      this.totalRow(pdf, `Giảm giá${order.voucherCode ? ` (${order.voucherCode})` : ''}`, -order.discount, y, pageWidth, margin);
    }
    y += 10;
    pdf.setFillColor(232, 241, 255);
    pdf.roundedRect(108, y - 6, pageWidth - margin - 108, 15, 2, 2, 'F');
    pdf.setTextColor(7, 90, 209);
    pdf.setFontSize(10);
    pdf.text('TỔNG THANH TOÁN', 112, y + 3);
    pdf.setFontSize(13);
    pdf.text(this.currency(total), pageWidth - margin - 3, y + 3, { align: 'right' });

    y += 22;
    pdf.setTextColor(66, 91, 125);
    pdf.setFontSize(9);
    pdf.text(`Phương thức thanh toán: ${order.method}`, margin, y);
    y += 7;
    pdf.text('Ghi chú: Hóa đơn được tạo tự động từ hệ thống ThinkUp.', margin, y);
    pdf.setDrawColor(220, 231, 243);
    pdf.line(margin, 278, pageWidth - margin, 278);
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.text('Cảm ơn bạn đã tin tưởng và học tập cùng ThinkUp.', pageWidth / 2, 285, { align: 'center' });
    pdf.save(`hoa-don-${order.invoiceId ?? order.id}.pdf`);
  }

  private async registerVietnameseFont(pdf: jsPDF): Promise<void> {
    this.fontData ??= fetch('/assets/fonts/DejaVuSans.ttf').then(response => {
      if (!response.ok) throw new Error('Không tải được phông chữ hóa đơn.');
      return response.arrayBuffer();
    }).then(buffer => this.toBase64(buffer));
    const font = await this.fontData;
    pdf.addFileToVFS('DejaVuSans.ttf', font);
    pdf.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    pdf.setFont('DejaVuSans', 'normal');
  }

  private toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return btoa(binary);
  }

  private sectionTitle(pdf: jsPDF, title: string, x: number, y: number, width: number): void {
    pdf.setFillColor(247, 250, 253);
    pdf.roundedRect(x, y - 5, width, 9, 1.5, 1.5, 'F');
    pdf.setTextColor(7, 27, 72);
    pdf.setFontSize(9);
    pdf.text(title, x + 3, y + 1);
  }

  /**
   * Một ô metadata luôn dùng một baseline: label có vùng cố định bên trái,
   * value chiếm phần còn lại để các cột thẳng hàng và không thể chồng dòng.
   */
  private labelValueRow(pdf: jsPDF, label: string, value: string, x: number, y: number, width: number): void {
    const labelWidth = 28;
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.text(label, x, y);
    pdf.setTextColor(24, 44, 81);
    pdf.setFontSize(9);
    const valueLines = pdf.splitTextToSize(value, width - labelWidth) as string[];
    pdf.text(valueLines[0] ?? '', x + labelWidth, y);
  }

  /** Giữ nhịp dòng ổn định cho hai cột nhà cung cấp và khách hàng. */
  private contactLine(pdf: jsPDF, value: string, x: number, y: number, emphasized = false): void {
    pdf.setTextColor(emphasized ? 24 : 100, emphasized ? 44 : 116, emphasized ? 81 : 139);
    pdf.setFontSize(emphasized ? 10 : 9);
    pdf.text(value, x, y);
  }

  private totalRow(pdf: jsPDF, label: string, value: number, y: number, pageWidth: number, margin: number): void {
    pdf.setTextColor(66, 91, 125);
    pdf.setFontSize(9);
    pdf.text(label, 112, y);
    pdf.setTextColor(24, 44, 81);
    pdf.text(this.currency(value), pageWidth - margin - 3, y, { align: 'right' });
  }

  private currency(value: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
  }

  private statusLabel(order: BusinessOrder): string {
    return { success: 'Thành công', pending: 'Chờ thanh toán', cancelled: 'Đã hủy' }[order.status];
  }
}
