/**
 * P2 E2E: admin preferences + settings modal.
 *
 * Runs against the development build (demo storage adapter, no backend needed).
 * Covers defaults, preview/save/cancel, reset confirmation, conflict UI,
 * timezone/DST, breadcrumb consumer, focus trap, Escape focus return and
 * responsive layout.
 *
 * Usage: node verify-p2.mjs [--out=dir] [--port=9337]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
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

const BASE = process.env.P1_BASE_DEV || 'http://127.0.0.1:4211';
const ADMIN_ID = 'demo-admin@thinkup.edu.vn';
const STORAGE_KEY = `thinkup_admin_preferences_demo:${ADMIN_ID}`;
const SESSION = {
  token: 'demo-local-access-token',
  user: {
    id: ADMIN_ID,
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
  const args = { out: tempDir('p2'), port: 9337 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function click(cdp, selector, index = 0) {
  const ok = await cdp.evaluate(`(() => {
    const nodes = document.querySelectorAll(${JSON.stringify(selector)});
    const node = nodes[${index}];
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Click target not found: ${selector}[${index}]`);
  await sleep(180);
}

async function clickByText(cdp, selector, text) {
  const ok = await cdp.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find((item) => item.textContent.trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Click target not found by text: ${selector} "${text}"`);
  await sleep(180);
}

async function selectValue(cdp, selector, value) {
  const ok = await cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Select not found: ${selector}`);
  await sleep(120);
}

async function openTab(cdp, label) {
  const ok = await cdp.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('.settings-tab'))
      .find((item) => item.textContent.includes(${JSON.stringify(label)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Settings tab not found: ${label}`);
  await sleep(180);
}

async function key(cdp, keyName, code, vk) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
  });
  await sleep(120);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p2-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];
  const screenshots = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  };
  const capture = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    const viewport = await cdp.evaluate('({ width: innerWidth, height: innerHeight })');
    await screenshot(cdp, { x: 0, y: 0, width: viewport.width, height: viewport.height }, file);
    screenshots.push(file);
  };

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.text || 'exception');
  });

  const openDialog = async () => {
    await click(cdp, '[aria-label="Cài đặt"]');
    await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  };
  const dialogState = () => cdp.evaluate(`(() => {
    const dialog = document.querySelector('dialog[open]');
    return {
      open: !!dialog,
      title: dialog?.querySelector('h2')?.textContent.trim() || '',
      sections: Array.from(dialog?.querySelectorAll('.settings-section h3') || []).map((node) => node.textContent.trim()),
      tabs: Array.from(dialog?.querySelectorAll('.settings-tab') || []).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      saveDisabled: dialog?.querySelector('button[form="admin-settings-form"]')?.disabled ?? null,
      dirty: dialog ? dialog.querySelector('button[form="admin-settings-form"]')?.disabled === false : null,
      timezone: dialog?.querySelector('.field-select')?.value || '',
      offset: dialog?.querySelector('.field-offset')?.textContent.trim() || '',
      preview: dialog?.querySelector('.field-preview')?.textContent.trim() || '',
      switches: Array.from(dialog?.querySelectorAll('.switch') || []).map((node) => node.checked),
      breadcrumb: !!document.querySelector('.admin-breadcrumb'),
      activeInDialog: !!dialog && dialog.contains(document.activeElement),
      activeTag: document.activeElement?.tagName || ''
    };
  })()`);

  try {
    await setViewport(cdp, 1920, 1080);
    await navigate(cdp, `${BASE}/login`);
    await cdp.evaluate(`(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('access_token', ${JSON.stringify(SESSION.token)});
      localStorage.setItem('thinkup_admin_user', ${JSON.stringify(JSON.stringify(SESSION.user))});
      localStorage.setItem('thinkup_admin_toolbar_dock', 'right');
      localStorage.setItem('thinkup_admin_toolbar_offset', '16');
      return true;
    })()`);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 20000 });
    await sleep(400);

    // 1. Defaults preserve the pre-P2 layout.
    const defaults = await cdp.evaluate(`({
      breadcrumb: !!document.querySelector('.admin-breadcrumb'),
      statusBar: !!document.querySelector('.admin-status-bar'),
      themeDark: document.querySelector('.admin-shell')?.classList.contains('theme-dark') ?? null,
      density: document.querySelector('.admin-shell')?.dataset?.density ?? ''
    })`);
    record('defaults-preserve-layout',
      defaults.breadcrumb === false && defaults.statusBar === false
      && defaults.themeDark === false && defaults.density === 'standard', defaults);

    // 2. Gear opens a responsive settings dialog with real sections only.
    await openDialog();
    const opened = await dialogState();
    record('dialog-opens-from-gear',
      opened.open && opened.title === 'Cấu hình không gian làm việc'
      && opened.tabs.length === 5
      && opened.tabs.some((label) => label.includes('Giao diện chung'))
      && opened.tabs.some((label) => label.includes('Định dạng dữ liệu'))
      && opened.tabs.some((label) => label.includes('Tuỳ chọn hệ thống'))
      && opened.tabs.some((label) => label.includes('Thông báo & Âm thanh'))
      && opened.tabs.some((label) => label.includes('Phím tắt thao tác')),
      { title: opened.title, tabs: opened.tabs });
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    const openedSystem = await dialogState();
    record('dialog-initial-state', openedSystem.saveDisabled === true && openedSystem.dirty === false
      && openedSystem.timezone === 'Asia/Ho_Chi_Minh' && openedSystem.breadcrumb === false, openedSystem);
    const optionCount = await cdp.evaluate('document.querySelectorAll(".field-select option").length');
    record('timezone-iana-options', optionCount > 300, { optionCount });
    await openTab(cdp, 'Giao diện chung');
    await capture('settings-default');

    // 3. Preview applies immediately and marks the draft dirty.
    await click(cdp, '.switch', 0);
    const previewBreadcrumb = await dialogState();
    record('preview-breadcrumb-consumer',
      previewBreadcrumb.breadcrumb === true && previewBreadcrumb.dirty === true
      && previewBreadcrumb.saveDisabled === false, previewBreadcrumb);
    await capture('settings-preview-breadcrumb');

    // 4. IANA timezone + DST offset preview.
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    await selectValue(cdp, '.field-select', 'America/New_York');
    const timezoneState = await dialogState();
    const expectedOffset = await cdp.evaluate(`(() => {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
      const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      const minutes = Math.round((asUtc - date.getTime()) / 60000);
      const sign = minutes < 0 ? '-' : '+';
      const abs = Math.abs(minutes);
      return 'GMT' + sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
    })()`);
    record('timezone-preview-offset',
      timezoneState.timezone === 'America/New_York'
      && timezoneState.offset === expectedOffset
      && /GMT|UTC/.test(timezoneState.preview)
      && timezoneState.dirty === true,
      { timezone: timezoneState.timezone, offset: timezoneState.offset, expectedOffset, preview: timezoneState.preview });
    const dst = await cdp.evaluate(`(() => {
      const winter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
        .format(new Date('2026-01-15T12:00:00Z'));
      const summer = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
        .format(new Date('2026-07-15T12:00:00Z'));
      return { winter, summer, different: winter !== summer };
    })()`);
    record('timezone-dst-rules', dst.different, dst);

    // 5. Cancel rolls back the preview and returns focus to the gear.
    await clickByText(cdp, 'button', 'Hủy bỏ');
    const afterCancel = await cdp.evaluate(`({
      dialog: !!document.querySelector('dialog[open]'),
      breadcrumb: !!document.querySelector('.admin-breadcrumb'),
      focusGear: document.activeElement?.getAttribute('aria-label') === 'Cài đặt'
    })`);
    record('cancel-rolls-back-preview',
      afterCancel.dialog === false && afterCancel.breadcrumb === false && afterCancel.focusGear === true,
      afterCancel);

    // 6. Save persists to the demo adapter and survives reload.
    await openDialog();
    await click(cdp, '.switch', 0);
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    await selectValue(cdp, '.field-select', 'America/New_York');
    await clickByText(cdp, 'button', 'Lưu cấu hình');
    const saved = await cdp.evaluate(`(() => {
      const raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        dialog: !!document.querySelector('dialog[open]'),
        breadcrumb: !!document.querySelector('.admin-breadcrumb'),
        stored: parsed && { revision: parsed.revision, breadcrumbsVisible: parsed.preferences?.breadcrumbsVisible, timezone: parsed.preferences?.timezone }
      };
    })()`);
    record('save-persists',
      saved.dialog === false && saved.breadcrumb === true
      && saved.stored?.revision === 1
      && saved.stored?.breadcrumbsVisible === true
      && saved.stored?.timezone === 'America/New_York', saved);

    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 20000 });
    await sleep(400);
    const afterReload = await cdp.evaluate(`({
      breadcrumb: !!document.querySelector('.admin-breadcrumb'),
      crumbText: document.querySelector('.admin-breadcrumb')?.innerText?.replace(/\\s+/g, ' ').trim() || ''
    })`);
    record('preferences-reload',
      afterReload.breadcrumb === true && /Dashboard/.test(afterReload.crumbText), afterReload);
    await capture('breadcrumb-enabled');

    // 7. Reset asks for confirmation, then persists defaults after Save.
    await openDialog();
    await clickByText(cdp, 'button', 'Khôi phục mặc định');
    const resetState = await cdp.evaluate(`({
      confirm: !!document.querySelector('.reset-confirm'),
      focusConfirm: document.activeElement?.textContent?.trim() === 'Khôi phục'
    })`);
    record('reset-confirmation-focus', resetState.confirm === true && resetState.focusConfirm === true, resetState);
    await clickByText(cdp, '.reset-actions button', 'Khôi phục');
    await openTab(cdp, 'Giao diện chung');
    const resetGeneral = await dialogState();
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    const resetSystem = await dialogState();
    record('reset-restores-draft-defaults',
      resetGeneral.dirty === true && resetGeneral.breadcrumb === false
      && resetSystem.timezone === 'Asia/Ho_Chi_Minh',
      { resetGeneral, resetSystem });
    await clickByText(cdp, 'button', 'Lưu cấu hình');
    const afterResetSave = await cdp.evaluate(`({
      breadcrumb: !!document.querySelector('.admin-breadcrumb'),
      stored: JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || 'null')
    })`);
    record('reset-persists-defaults',
      afterResetSave.breadcrumb === false && afterResetSave.stored?.preferences?.breadcrumbsVisible === false,
      { breadcrumb: afterResetSave.breadcrumb, revision: afterResetSave.stored?.revision });

    // 8. Concurrent tab writes surface a conflict with a reload action.
    await openDialog();
    await click(cdp, '.switch', 0);
    await cdp.evaluate(`(() => {
      const raw = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}));
      raw.revision = 99;
      localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, JSON.stringify(raw));
      return true;
    })()`);
    await clickByText(cdp, 'button', 'Lưu cấu hình');
    const conflict = await cdp.evaluate(`({
      dialog: !!document.querySelector('dialog[open]'),
      alert: document.querySelector('.settings-error')?.innerText || '',
      reload: !!Array.from(document.querySelectorAll('.settings-error button'))
        .find((node) => node.textContent.includes('Tải bản mới nhất'))
    })`);
    record('conflict-banner-and-retry',
      conflict.dialog === true && /phiên khác/.test(conflict.alert) && conflict.reload === true,
      conflict);
    await capture('settings-conflict');
    await clickByText(cdp, '.settings-error button', 'Tải bản mới nhất');
    const afterReloadLatest = await dialogState();
    record('conflict-reload-latest',
      afterReloadLatest.dirty === false && afterReloadLatest.breadcrumb === false,
      afterReloadLatest);
    await clickByText(cdp, 'button', 'Hủy bỏ');

    // 9. Focus trap + Escape returns focus to the gear.
    await openDialog();
    const trap = [];
    for (let index = 0; index < 8; index += 1) {
      await key(cdp, 'Tab', 'Tab', 9);
      // Focus có thể chuyển sang chrome của trình duyệt (document.body) ở cuối vòng,
      // nhưng không được rơi vào phần tử phía sau modal.
      trap.push(await cdp.evaluate(`(() => {
        const dialog = document.querySelector('dialog[open]');
        return !!dialog && (dialog.contains(document.activeElement) || document.activeElement === document.body);
      })()`));
    }
    record('dialog-focus-trap', trap.every(Boolean), trap);
    await key(cdp, 'Escape', 'Escape', 27);
    const escapeState = await cdp.evaluate(`({
      dialog: !!document.querySelector('dialog[open]'),
      focusGear: document.activeElement?.getAttribute('aria-label') === 'Cài đặt'
    })`);
    record('escape-close-returns-focus',
      escapeState.dialog === false && escapeState.focusGear === true, escapeState);

    // 10. Responsive dialog stays inside the viewport at every reviewed size.
    for (const [width, height] of [[1024, 768], [768, 700], [683, 384]]) {
      await setViewport(cdp, width, height);
      await sleep(250);
      await openDialog();
      const layout = await cdp.evaluate(`(() => {
        const dialog = document.querySelector('dialog[open]');
        const surface = dialog?.querySelector('.admin-dialog__surface');
        const footer = dialog?.querySelector('.admin-dialog__footer');
        const body = dialog?.querySelector('.admin-dialog__body');
        const rect = surface?.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
          innerWidth, innerHeight,
          rect: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          footerVisible: !!footerRect && footerRect.bottom <= innerHeight + 0.5 && footerRect.height > 0,
          surfaceFits: !!surface && surface.scrollWidth <= surface.clientWidth + 1,
          bodyScrolls: !!body && body.scrollHeight >= body.clientHeight
        };
      })()`);
      record(`responsive-${width}x${height}`,
        layout.rect.left >= 0 && layout.rect.top >= 0
        && layout.rect.right <= layout.innerWidth + 0.5
        && layout.rect.bottom <= layout.innerHeight + 0.5
        && layout.footerVisible === true && layout.surfaceFits === true,
        layout);
      await capture(`settings-${width}x${height}`);
      await key(cdp, 'Escape', 'Escape', 27);
    }
    await setViewport(cdp, 1920, 1080);

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p2',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      consoleErrors,
      screenshots
    };
    fs.writeFileSync(path.join(outDir, 'p2-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p2-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();
