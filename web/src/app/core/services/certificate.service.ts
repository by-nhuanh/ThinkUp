import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, delay, map, of, throwError } from 'rxjs';
import { toDataURL } from 'qrcode';
import { environment } from '../../../environments/environment';
import { Certificate, CertificateVerification } from '../models/certificate.model';
import { MOCK_CERTIFICATES } from '../data/mock/mock-certificates';

const PUBLIC_WEB_ORIGIN = 'https://thinkup.vn';

// TODO(pre-deploy): Nhớ xóa cờ mock và dữ liệu mock khi backend cung cấp API chứng chỉ.
const USE_MOCK_DATA = true;

@Injectable({ providedIn: 'root' })
export class CertificateService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** Tra cứu công khai theo mã chứng chỉ (không cần đăng nhập). */
  verify(code: string): Observable<CertificateVerification> {
    const normalized = this.normalizeCode(code);

    if (USE_MOCK_DATA) {
      const certificate = MOCK_CERTIFICATES.find(item => this.normalizeCode(item.code) === normalized);
      return (certificate
        ? of({ certificate, verifiedAt: this.formatVerificationTime(new Date()) })
        : throwError(() => new Error('CERTIFICATE_NOT_FOUND'))
      ).pipe(delay(450));
    }

    // TODO(pre-deploy): Chốt endpoint thật với backend, hiện chưa có handoff API tra cứu.
    return this.http
      .get<CertificateVerification>(`${this.apiUrl}/certificates/verify`, { params: { code: normalized } })
      .pipe(catchError(error => throwError(() => error)));
  }

  /** Danh sách chứng chỉ của học viên đang đăng nhập. */
  getMyCertificates(): Observable<Certificate[]> {
    if (USE_MOCK_DATA) {
      return of(MOCK_CERTIFICATES).pipe(delay(350));
    }

    // TODO(pre-deploy): Chốt endpoint thật với backend, hiện chưa có handoff API chứng chỉ cá nhân.
    return this.http
      .get<Certificate[]>(`${this.apiUrl}/certificates/me`)
      .pipe(catchError(error => throwError(() => error)));
  }

  getShareUrl(code: string): string {
    return `${PUBLIC_WEB_ORIGIN}/chung-chi/${code}`;
  }

  getVerificationUrl(code: string): string {
    return `${PUBLIC_WEB_ORIGIN}/verify?code=${encodeURIComponent(code)}`;
  }

  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  formatVerificationTime(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  async createQrDataUrl(code: string): Promise<string> {
    return toDataURL(this.getVerificationUrl(code), {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 320,
      color: { dark: '#081433', light: '#FFFFFF' }
    });
  }

  /**
   * Xuất chứng chỉ ra PDF thông qua hộp thoại in của trình duyệt.
   * TODO(pre-deploy): Thay bằng API xuất PDF chất lượng cao (tên file ThinkUp_Certificate_{Mã}.pdf).
   */
  async printCertificate(certificate: Certificate): Promise<void> {
    // Mở cửa sổ in ngay trong sự kiện click để trình duyệt không chặn popup.
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) return;

    try {
      const qr = await this.createQrDataUrl(certificate.code);
      printWindow.document.write(this.buildPrintDocument(certificate, qr));
      printWindow.document.close();
      printWindow.focus();

      const triggerPrint = () => printWindow.print();
      if (printWindow.document.readyState === 'complete') {
        triggerPrint();
      } else {
        printWindow.addEventListener('load', triggerPrint, { once: true });
      }
    } catch {
      printWindow.close();
    }
  }

  private buildPrintDocument(certificate: Certificate, qr: string): string {
    const background = new URL('assets/certificate/certificate-bg.png', document.baseURI).href;
    const escape = (value: string) =>
      value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

    return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>ThinkUp_Certificate_${escape(certificate.code)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .certificate {
    position: relative;
    width: 100%;
    max-width: 1375px;
    aspect-ratio: 1375 / 1024;
    background-image: url('${background}');
    background-size: 100% 100%;
    background-repeat: no-repeat;
    container-type: inline-size;
  }
  .name { position: absolute; left: 30.4%; top: 45.51%; width: 61.1%; margin: 0; color: #0B63E5; font-family: Inter, Arial, sans-serif; font-weight: 700; font-size: 2.4727cqw; line-height: 3.2cqw; }
  .course { position: absolute; left: 30.4%; top: 63.67%; width: 49.5%; margin: 0; color: #081433; font-family: Inter, Arial, sans-serif; font-weight: 700; font-size: 2.9818cqw; line-height: 3.927cqw; }
  .meta { position: absolute; left: 22.11%; width: 12.36%; margin: 0; color: #050B19; font-family: Inter, Arial, sans-serif; font-weight: 500; font-size: 1.4545cqw; line-height: 2.036cqw; }
  .date { top: 78.71%; }
  .id { top: 83.89%; }
  .qr { position: absolute; left: 32.44%; top: 77.25%; width: 11.64%; height: 14.45%; padding: 0; background: #ffffff; border: 1px solid #DBE3F0; border-radius: 0.58cqw; display: flex; align-items: center; justify-content: center; }
  .qr img { width: 82%; height: auto; aspect-ratio: 1; object-fit: contain; }
</style>
</head>
<body>
  <div class="certificate">
    <p class="name">${escape(certificate.certificateName)}</p>
    <p class="course">${escape(certificate.courseTitle)}</p>
    <p class="meta date">${escape(certificate.issuedAtEn)}</p>
    <p class="meta id">${escape(certificate.code)}</p>
    <div class="qr"><img src="${qr}" alt=""></div>
  </div>
</body>
</html>`;
  }
}
