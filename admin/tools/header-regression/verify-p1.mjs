/**
 * P1 E2E: account menu, read-only profile, /me mapping, copy, logout online/offline.
 *
 * Uses the production build (adminDemoLogin=false) served on :4212 and intercepts
 * the real backend URLs via CDP Fetch. This exercises the frontend integration without
 * requiring a reachable backend; the backend itself is covered by server tests.
 *
 * Usage: node verify-p1.mjs [--out=dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CdpClient,
  connectPage,
  launchBrowser,
  navigate,
  screenshot,
  setViewport,
  sleep,
  stopBrowser,
  tempDir,
  waitFor
} from './lib.mjs';

const BASE = process.env.P1_BASE_PROD || 'http://127.0.0.1:4212';
const ADMIN_ID = '65f123456789abcdef012345';
const PROFILE = {
  success: true,
  admin: {
    id: ADMIN_ID,
    email: 'admin@thinkup.edu.vn',
    full_name: 'Quản trị viên ThinkUp',
    role: 'ADMIN',
    status: 'ACTIVE',
    is_2fa_enabled: true,
    created_at: '2026-01-10T08:00:00.000Z',
    last_login_at: '2026-11-01T10:00:00.000Z',
    lastLogin: {
      at: '2026-11-01T10:00:00.000Z',
      ipMasked: '14.233.18.xxx',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    },
    currentSession: {
      ipMasked: '113.172.56.xxx',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/156'
    },
    passwordStatus: { isExpired: false, isWarning: false, daysLeft: 80 }
  }
};
const SESSION = {
  token: 'p1-real-access-token',
  user: {
    id: 'demo-admin@thinkup.edu.vn',
    email: 'admin@thinkup.edu.vn',
    fullName: 'Quản trị viên ThinkUp',
    role: 'admin',
    avatar: null,
    passwordExpiresAt: null,
    mustChangePassword: false,
    twoFactorSetupRequired: false
  }
};

function parseArgs(argv) {
  const args = { out: tempDir('p1-e2e'), port: 9335 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function fulfillJson(cdp, requestId, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return cdp.send('Fetch.fulfillRequest', {
    requestId,
    responseCode: status,
    responseHeaders: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Cache-Control', value: 'no-store' },
      { name: 'Access-Control-Allow-Origin', value: BASE },
      { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,OPTIONS' }
    ],
    body
  });
}

async function seedSession(cdp) {
  await navigate(cdp, `${BASE}/login`);
  await cdp.evaluate(`(() => {
    localStorage.setItem('access_token', ${JSON.stringify(SESSION.token)});
    localStorage.setItem('thinkup_admin_user', ${JSON.stringify(JSON.stringify(SESSION.user))});
    localStorage.setItem('thinkup_admin_toolbar_dock', 'right');
    localStorage.setItem('thinkup_admin_toolbar_offset', '16');
    return true;
  })()`);
  await navigate(cdp, `${BASE}/`);
  await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
  await cdp.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
  await sleep(250);
}

async function click(cdp, selector) {
  const clicked = await cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Cannot click ${selector}`);
  await sleep(180);
}

async function key(cdp, keyName, code, vk) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: keyName,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyName,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk
  });
  await sleep(120);
}

async function clickOutside(cdp) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 8, y: 8, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 8, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(180);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p1-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const browserCdp = await CdpClient.connect(launch.version.webSocketDebuggerUrl);
  const results = [];
  const consoleErrors = [];
  const meRequests = [];
  const logoutRequests = [];
  const screenshots = [];
  let meMode = 'ok';
  let logoutMode = 'ok';

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail).slice(0, 260)}` : ''}`);
  };

  const capture = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await screenshot(cdp, { x: 0, y: 0, width: 1920, height: 1080 }, file);
    screenshots.push(file);
  };

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
    }
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.text || 'exception');
  });

  try {
    await cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*be-thinkup.vercel.app/api/admin/auth/*', requestStage: 'Request' }]
    });
    cdp.on('Fetch.requestPaused', async (params) => {
      const requestId = params.requestId;
      const url = params.request?.url || '';
      const method = params.request?.method || 'GET';
      try {
        if (method === 'OPTIONS') {
          await cdp.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 204,
            responseHeaders: [
              { name: 'Access-Control-Allow-Origin', value: BASE },
              { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' },
              { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,OPTIONS' },
              { name: 'Access-Control-Max-Age', value: '600' }
            ]
          });
          return;
        }
        if (url.includes('/api/admin/auth/me')) {
          meRequests.push(url);
          if (meMode === 'error') {
            await fulfillJson(cdp, requestId, 500, { message: 'Server error for P1 test' });
          } else if (meMode === 'unauthorized') {
            await fulfillJson(cdp, requestId, 401, { message: 'Phiên quản trị viên đã hết hạn.', code: 'TOKEN_EXPIRED' });
          } else {
            await fulfillJson(cdp, requestId, 200, PROFILE);
          }
          return;
        }
        if (url.includes('/api/admin/auth/logout')) {
          logoutRequests.push(url);
          if (logoutMode === 'fail') {
            await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
          } else {
            await fulfillJson(cdp, requestId, 200, { success: true, message: 'Đăng xuất thành công' });
          }
          return;
        }
        await cdp.send('Fetch.continueRequest', { requestId });
      } catch (error) {
        consoleErrors.push(`Fetch handler: ${error?.message || error}`);
      }
    });

    await setViewport(cdp, 1920, 1080);
    await seedSession(cdp);

    // 1. Account menu content + role + no fake fields.
    await click(cdp, '.account-tool');
    await waitFor(cdp, '!!document.querySelector(".account-popover")');
    const menu = await cdp.evaluate(`(() => {
      const popover = document.querySelector('.account-popover');
      const trigger = document.querySelector('.account-tool');
      return {
        expanded: trigger?.getAttribute('aria-expanded'),
        hasPopup: trigger?.getAttribute('aria-haspopup'),
        controls: trigger?.getAttribute('aria-controls'),
        popoverRole: popover?.getAttribute('role'),
        popoverLabel: popover?.getAttribute('aria-label'),
        text: popover?.innerText || '',
        items: Array.from(popover?.querySelectorAll('[data-account-item]') || []).map((node) => node.textContent.trim().slice(0, 80)),
        activeIsItem: !!document.activeElement?.hasAttribute?.('data-account-item')
      };
    })()`);
    record('account-menu-content', /Quản trị viên/.test(menu.text)
      && /Hồ sơ cá nhân/.test(menu.text)
      && /Mật khẩu và bảo mật tài khoản/.test(menu.text)
      && /Đăng xuất/.test(menu.text)
      && menu.items.length === 3
      && menu.expanded === 'true', menu);
    record('account-menu-disclosure-aria',
      menu.hasPopup === null
        && menu.controls === 'account-popover'
        && menu.popoverRole === 'group'
        && menu.popoverLabel === 'Tài khoản',
      { hasPopup: menu.hasPopup, controls: menu.controls, role: menu.popoverRole, label: menu.popoverLabel });
    record('account-menu-no-fake-identity', !/Super Admin|Organization|SSO|UUID/i.test(menu.text), menu.text.slice(0, 200));
    record('account-menu-initial-focus', menu.activeIsItem === true, { activeIsItem: menu.activeIsItem });
    await capture('account-menu');

    // 2. Keyboard navigation + Escape + focus return.
    await key(cdp, 'ArrowDown', 'ArrowDown', 40);
    const afterDown = await cdp.evaluate('document.activeElement?.textContent?.trim().slice(0, 40) || ""');
    await key(cdp, 'End', 'End', 35);
    const afterEnd = await cdp.evaluate('document.activeElement?.textContent?.trim().slice(0, 40) || ""');
    await key(cdp, 'Home', 'Home', 36);
    const afterHome = await cdp.evaluate('document.activeElement?.textContent?.trim().slice(0, 40) || ""');
    record('account-menu-keyboard', /Mật khẩu/.test(afterDown) && /Đăng xuất/.test(afterEnd) && /Hồ sơ/.test(afterHome), { afterDown, afterEnd, afterHome });
    await key(cdp, 'Escape', 'Escape', 27);
    const escaped = await cdp.evaluate(`({
      open: !!document.querySelector('.account-popover'),
      focusAccount: document.activeElement?.classList?.contains('account-tool') === true
    })`);
    record('account-menu-escape-focus', escaped.open === false && escaped.focusAccount === true, escaped);

    // 3. Outside click closes.
    await click(cdp, '.account-tool');
    await waitFor(cdp, '!!document.querySelector(".account-popover")');
    await clickOutside(cdp);
    const outside = await cdp.evaluate('!!document.querySelector(".account-popover")');
    record('account-menu-outside-close', outside === false, { open: outside });

    // 4. Security item navigates to the existing change-password route with returnUrl.
    await click(cdp, '.account-tool');
    await cdp.evaluate('document.querySelectorAll("[data-account-item]")[1]?.click(); true');
    await waitFor(cdp, 'location.pathname === "/auth/change-password"', { timeoutMs: 10000 });
    const security = await cdp.evaluate('({ path: location.pathname, search: location.search })');
    record('account-security-navigation', security.path === '/auth/change-password' && /returnUrl=/.test(security.search), security);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 15000 });

    // 5. Profile modal with /me mapping.
    await click(cdp, '.account-tool');
    await click(cdp, '[data-account-item]');
    await waitFor(cdp, '!!document.querySelector("app-admin-profile-dialog dialog.admin-dialog[open]")', { timeoutMs: 10000 });
    await sleep(250);
    const profile = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('app-admin-profile-dialog dialog.admin-dialog');
      const text = dialog?.innerText || '';
      const footerButton = dialog?.querySelector('.admin-dialog__footer button');
      const sections = Array.from(dialog?.querySelectorAll('.profile-section h3') || []).map((node) => node.textContent.trim());
      const body = dialog?.querySelector('.admin-dialog__body');
      return {
        text,
        sections,
        footerButton: footerButton ? footerButton.textContent.trim() : null,
        hasCopy: !!dialog?.querySelector('.profile-copy'),
        hasRole: /Quản trị viên/.test(text),
        hasStatus: /Đang hoạt động/.test(text),
        has2fa: /Đã bật/.test(text),
        hasPassword: /Còn 80 ngày/.test(text),
        hasMaskedIp: /113\\.172\\.56\\.xxx/.test(text),
        hasLastLogin: /14\\.233\\.18\\.xxx/.test(text),
        hasId: text.includes(${JSON.stringify(ADMIN_ID)}),
        hasOrgUnavailable: /Mã tổ chức \\(Organization ID\\)/.test(text) && /Chưa được hệ thống cung cấp/.test(text),
        hasSsoUnavailable: /SSO \\/ Directory ID/.test(text) && /Chưa liên kết \\/ Chưa được hỗ trợ/.test(text),
        hasPermissionNote: /Hệ thống chưa cung cấp danh sách quyền chi tiết/.test(text),
        hasReadonlyNote: /Bạn không thể chỉnh sửa tại đây/.test(text),
        horizontalOverflow: body ? body.scrollWidth - body.clientWidth : 0
      };
    })()`);
    record('profile-real-fields', profile.hasRole && profile.hasStatus && profile.has2fa && profile.hasPassword && profile.hasMaskedIp && profile.hasLastLogin && profile.hasId, profile);
    record('profile-ba-three-sections',
      profile.sections.length === 3
        && profile.sections[0] === '01. Định danh hệ thống & tổ chức'
        && profile.sections[1] === '02. Vai trò & Thẩm quyền hệ thống'
        && profile.sections[2] === '03. Bảo mật & Phiên làm việc',
      profile.sections);
    record('profile-unavailable-fields-honest',
      profile.hasOrgUnavailable && profile.hasSsoUnavailable && profile.hasPermissionNote && profile.hasReadonlyNote,
      { hasOrgUnavailable: profile.hasOrgUnavailable, hasSsoUnavailable: profile.hasSsoUnavailable, hasPermissionNote: profile.hasPermissionNote, hasReadonlyNote: profile.hasReadonlyNote });
    record('profile-no-fake-governance', !/Super Admin|UUID/i.test(profile.text), profile.text.slice(0, 200));
    record('profile-read-only-no-footer-button', profile.footerButton === null, { footerButton: profile.footerButton });
    record('profile-me-called-once', meRequests.length === 1, { requests: meRequests.length });
    await capture('profile-modal');

    // 5. Copy ID (clipboard permission may be unavailable in headless).
    let clipboardGranted = true;
    try {
      await browserCdp.send('Browser.grantPermissions', {
        origin: BASE,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
      });
    } catch (error) {
      clipboardGranted = false;
      consoleErrors.push(`clipboard permission: ${error?.message || error}`);
    }
    await click(cdp, '.profile-copy');
    await sleep(150);
    const copyStatus = await cdp.evaluate(`(() => {
      const button = document.querySelector('.profile-copy');
      return button?.getAttribute('title') || '';
    })()`);
    let clipboardText = '';
    try {
      clipboardText = await cdp.evaluate('navigator.clipboard ? navigator.clipboard.readText().catch(() => "") : ""');
    } catch {
      clipboardText = '';
    }
    record('profile-copy-id', clipboardGranted && copyStatus === 'Đã sao chép' && clipboardText === ADMIN_ID, { granted: clipboardGranted, status: copyStatus, clipboard: clipboardText, expected: ADMIN_ID });
    if (!clipboardGranted) {
      record('profile-copy-id (limitation)', false, 'Clipboard permission unavailable in headless browser');
    }

    // 6. Esc closes dialog and focus returns to avatar.
    await key(cdp, 'Escape', 'Escape', 27);
    await sleep(250);
    const closed = await cdp.evaluate(`({
      dialog: !!document.querySelector('app-admin-profile-dialog dialog[open]'),
      focusAccount: document.activeElement?.classList?.contains('account-tool') === true
    })`);
    record('profile-escape-focus', closed.dialog === false && closed.focusAccount === true, closed);

    // 7. /me error keeps local session data and shows a retry banner.
    meMode = 'error';
    await click(cdp, '.account-tool');
    await click(cdp, '[data-account-item]');
    await waitFor(cdp, '!!document.querySelector("app-admin-profile-dialog dialog.admin-dialog[open]")', { timeoutMs: 10000 });
    await sleep(300);
    const errorProfile = await cdp.evaluate(`({
      alert: !!document.querySelector('.profile-alert'),
      retry: !!document.querySelector('.profile-text-button'),
      name: document.querySelector('.profile-hero-copy h3')?.textContent || ''
    })`);
    record('profile-me-error-banner', errorProfile.alert && errorProfile.retry && /Quản trị viên ThinkUp/.test(errorProfile.name), errorProfile);
    await key(cdp, 'Escape', 'Escape', 27);
    await sleep(200);

    // 8. 401 from /me uses the existing interceptor: clear session and go to /login.
    meMode = 'unauthorized';
    await click(cdp, '.account-tool');
    await click(cdp, '[data-account-item]');
    await waitFor(cdp, 'location.pathname === "/login"', { timeoutMs: 10000 });
    const unauthorized = await cdp.evaluate(`({
      path: location.pathname,
      token: localStorage.getItem('access_token') || sessionStorage.getItem('access_token'),
      user: localStorage.getItem('thinkup_admin_user') || sessionStorage.getItem('thinkup_admin_user')
    })`);
    record('profile-me-401-interceptor', unauthorized.path === '/login' && unauthorized.token === null && unauthorized.user === null, unauthorized);
    meMode = 'ok';
    await seedSession(cdp);

    // 9. Logout online: request is sent, local session cleared, route /login.
    logoutMode = 'ok';
    await click(cdp, '.account-tool');
    await click(cdp, '.account-logout');
    await sleep(600);
    const online = await cdp.evaluate(`({
      path: location.pathname,
      token: localStorage.getItem('access_token'),
      user: localStorage.getItem('thinkup_admin_user')
    })`);
    record('logout-online', online.path === '/login' && online.token === null && online.user === null && logoutRequests.length === 1, { ...online, requests: logoutRequests.length });

    // 10. Logout offline: API fails but the user is never stuck.
    await seedSession(cdp);
    logoutMode = 'fail';
    await click(cdp, '.account-tool');
    await click(cdp, '.account-logout');
    await sleep(2600);
    const offline = await cdp.evaluate(`({
      path: location.pathname,
      token: localStorage.getItem('access_token'),
      user: localStorage.getItem('thinkup_admin_user')
    })`);
    record('logout-offline', offline.path === '/login' && offline.token === null && offline.user === null && logoutRequests.length >= 2, { ...offline, requests: logoutRequests.length });
    logoutMode = 'ok';

    // 11. Responsive menu/profile at project viewports and effective zoom widths.
    await seedSession(cdp);
    meMode = 'ok';
    const responsiveViewports = [
      { label: '1920x1080', width: 1920, height: 1080 },
      { label: '1440x900', width: 1440, height: 900 },
      { label: '1366x768', width: 1366, height: 768 },
      { label: '1280x800', width: 1280, height: 800 },
      { label: '1100x800', width: 1100, height: 800 },
      { label: '1024x768', width: 1024, height: 768 },
      { label: '900x700', width: 900, height: 700 },
      { label: '768x700', width: 768, height: 700 },
      { label: '1920@150', width: 1280, height: 720 },
      { label: '1920@200', width: 960, height: 540 },
      { label: '1366@200', width: 683, height: 384 }
    ];
    for (const viewport of responsiveViewports) {
      await setViewport(cdp, viewport.width, viewport.height);
      await waitFor(cdp, `window.innerWidth === ${viewport.width} && window.innerHeight === ${viewport.height}`, { timeoutMs: 5000 });
      await cdp.evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
      await sleep(120);
      await click(cdp, '.account-tool');
      await waitFor(cdp, '!!document.querySelector(".account-popover")');
      const menuRect = await cdp.evaluate(`(() => {
        const popover = document.querySelector('.account-popover');
        const r = popover.getBoundingClientRect();
        const anchor = document.querySelector('.account-tool').getBoundingClientRect();
        const anchorBox = popover.parentElement.getBoundingClientRect();
        return {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          innerWidth, innerHeight,
          style: popover.getAttribute('style'),
          anchor: { top: anchor.top, bottom: anchor.bottom, left: anchor.left, right: anchor.right },
          anchorBox: { top: anchorBox.top, left: anchorBox.left },
          panelHeight: r.height
        };
      })()`);
      const menuOk = menuRect.left >= 0 && menuRect.top >= 0
        && menuRect.right <= menuRect.innerWidth + 0.5
        && menuRect.bottom <= menuRect.innerHeight + 0.5;
      await key(cdp, 'Escape', 'Escape', 27);
      await sleep(150);

      await click(cdp, '.account-tool');
      await click(cdp, '[data-account-item]');
      await waitFor(cdp, '!!document.querySelector("app-admin-profile-dialog dialog.admin-dialog[open]")', { timeoutMs: 10000 });
      await sleep(200);
      const dialogRect = await cdp.evaluate(`(() => {
        const surface = document.querySelector('app-admin-profile-dialog .admin-dialog__surface').getBoundingClientRect();
        const footer = document.querySelector('app-admin-profile-dialog .admin-dialog__footer');
        const body = document.querySelector('app-admin-profile-dialog .admin-dialog__body');
        const footerStyle = footer ? getComputedStyle(footer) : null;
        return {
          left: surface.left, top: surface.top, right: surface.right, bottom: surface.bottom,
          footerHidden: !footer || footerStyle.display === 'none',
          bodyOverflow: body ? body.scrollWidth - body.clientWidth : 0,
          innerWidth, innerHeight
        };
      })()`);
      const dialogOk = dialogRect.left >= 0 && dialogRect.top >= 0
        && dialogRect.right <= dialogRect.innerWidth + 0.5
        && dialogRect.bottom <= dialogRect.innerHeight + 0.5
        && dialogRect.footerHidden === true
        && dialogRect.bodyOverflow <= 1;
      record(`responsive-${viewport.label}`, menuOk && dialogOk, { menuOk, dialogOk, menuRect, dialogRect });
      await key(cdp, 'Escape', 'Escape', 27);
      await sleep(180);
    }
    await setViewport(cdp, 1920, 1080);

    // 12. Popover containment at 683x384 (1366x768 @ 200% effective zoom) for all four docks.
    const dockMatrix = ['right', 'top', 'bottom', 'left'];
    for (const dock of dockMatrix) {
      await setViewport(cdp, 683, 384);
      await cdp.evaluate(`(() => {
        localStorage.setItem('thinkup_admin_toolbar_dock', ${JSON.stringify(dock)});
        localStorage.setItem('thinkup_admin_toolbar_offset', '16');
        return true;
      })()`);
      await navigate(cdp, `${BASE}/`);
      await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
      await waitFor(cdp, 'window.innerWidth === 683 && window.innerHeight === 384', { timeoutMs: 5000 });
      await sleep(320);
      await click(cdp, '.account-tool');
      await waitFor(cdp, '!!document.querySelector(".account-popover")');
      await sleep(180);
      const dockRect = await cdp.evaluate(`(() => {
        const popover = document.querySelector('.account-popover').getBoundingClientRect();
        const bar = document.querySelector('header.top-utility-bar');
        return {
          popover: { left: popover.left, top: popover.top, right: popover.right, bottom: popover.bottom, width: popover.width, height: popover.height },
          barClass: bar?.className || '',
          innerWidth,
          innerHeight
        };
      })()`);
      const dockOk = dockRect.popover.left >= -0.5 && dockRect.popover.top >= -0.5
        && dockRect.popover.right <= dockRect.innerWidth + 0.5
        && dockRect.popover.bottom <= dockRect.innerHeight + 0.5
        && dockRect.barClass.includes(`dock-${dock}`) && dockRect.popover.width === 300;
      const file = path.join(outDir, `dock-683x384-${dock}.png`);
      await screenshot(cdp, { x: 0, y: 0, width: 683, height: 384 }, file);
      screenshots.push(file);
      record(`popover-dock-${dock}-683x384`, dockOk, { ...dockRect, screenshot: path.basename(file) });
      await key(cdp, 'Escape', 'Escape', 27);
      await sleep(160);
      await cdp.evaluate(`(() => {
        localStorage.setItem('thinkup_admin_toolbar_dock', 'right');
        localStorage.setItem('thinkup_admin_toolbar_offset', '16');
        return true;
      })()`);
      await navigate(cdp, `${BASE}/`);
      await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
    }
    await setViewport(cdp, 1920, 1080);
    await sleep(220);

    record('no-console-errors', consoleErrors.length === 0, consoleErrors.slice(0, 5));

    const report = {
      tool: 'verify-p1.mjs',
      startedAt: new Date().toISOString(),
      url: BASE,
      browser: launch.version,
      passed: results.every((item) => item.passed),
      results,
      consoleErrors,
      meRequests,
      logoutRequests,
      screenshots
    };
    fs.writeFileSync(path.join(outDir, 'p1-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p1-report.json')}`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    browserCdp.close();
    cdp.close();
    await stopBrowser(launch);
  }
}

run().catch((error) => {
  console.error('FATAL', error?.stack || error);
  process.exitCode = 2;
});
