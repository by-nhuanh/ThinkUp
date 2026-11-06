import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
interface FacebookSdk {
  init(options: { appId: string; version: string; cookie: boolean; xfbml: boolean }): void;
  login(callback: (result: { authResponse?: { accessToken?: string } }) => void, options: { scope: string }): void;
}
@Injectable({ providedIn: 'root' })
export class FacebookAuthService {
  private pending: Promise<FacebookSdk> | null = null;
  private sdk: FacebookSdk | null = null;
  private loginPending = false;
  private isConfigured(): boolean {
    return /^\d+$/.test(environment.facebookAppId) && /^v\d+\.\d+$/.test(environment.facebookGraphVersion);
  }
  prepare(): Promise<FacebookSdk> {
    if (this.sdk) return Promise.resolve(this.sdk);
    if (this.pending) return this.pending;
    if (!this.isConfigured()) {
      return Promise.reject(new Error('Đăng nhập Facebook đang được cập nhật.'));
    }
    this.pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 15000);
      const fail = () => { clearTimeout(timer); script.remove(); this.pending = null; reject(new Error('Không tải được Facebook. Vui lòng thử lại.')); };
      script.src = 'https://connect.facebook.net/en_US/sdk.js'; script.async = true;
      script.onerror = fail;
      script.onload = () => {
        clearTimeout(timer);
        const sdk = (window as unknown as { FB?: FacebookSdk }).FB;
        if (!sdk) { fail(); return; }
        try { sdk.init({ appId: environment.facebookAppId, version: environment.facebookGraphVersion, cookie: false, xfbml: false }); } catch { fail(); return; }
        this.sdk = sdk; resolve(sdk);
      };
      document.head.appendChild(script);
    });
    return this.pending;
  }
  login(): Promise<string> {
    // The SDK must be ready before calling FB.login from the user's click.
    if (!this.sdk) {
      return this.prepare().then(() => { throw new Error('Facebook đã sẵn sàng. Vui lòng nhấn lại nút Facebook.'); });
    }
    if (this.loginPending) return Promise.reject(new Error('Đang chờ xác thực Facebook.'));
    this.loginPending = true;
    return new Promise<string>((resolve, reject) => this.sdk!.login(result => {
      const token = result.authResponse?.accessToken;
      if (token) resolve(token);
      else reject(new Error('Bạn chưa hoàn tất xác thực Facebook.'));
    }, { scope: 'public_profile,email' })).finally(() => { this.loginPending = false; });
  }
}
