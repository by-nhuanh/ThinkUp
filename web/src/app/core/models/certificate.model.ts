/**
 * Chứng chỉ đã cấp cho học viên.
 * `code` là mã tra cứu công khai, đồng thời là định danh trên artwork chứng chỉ.
 */
export interface Certificate {
  code: string;
  /** Tên hiển thị trên trang tra cứu / danh sách. */
  studentName: string;
  /** Tên in trên artwork (chữ in hoa, kèm mã học viên nếu có). */
  certificateName: string;
  courseTitle: string;
  /** Ngày cấp dạng dd/MM/yyyy. */
  issuedAt: string;
  /** Ngày cấp dạng MMM d, yyyy dùng cho artwork. */
  issuedAtEn: string;
  status: CertificateStatus;
  /** Mã học viên in kèm tên trên chứng chỉ (không bắt buộc). */
  studentCode?: string;
}

export type CertificateStatus = 'valid' | 'revoked';

export interface CertificateVerification {
  certificate: Certificate;
  /** Thời điểm xác thực theo giờ máy chủ, dạng HH:mm dd/MM/yyyy. */
  verifiedAt: string;
}
