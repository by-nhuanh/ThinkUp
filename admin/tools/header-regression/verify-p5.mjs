/**
 * P5 E2E: admin status bar driven by preferences.
 *
 * Runs against the development build (demo preference storage, no backend needed).
 * Covers default OFF, live preview, persisted ON, timezone clock, online/offline,
 * no live region, no overlap with content or the docked toolbar, responsive layout
 * and returning to the original layout when turned OFF.
 *
 * Usage: node verify-p5.mjs [--out=dir] [--port=9339]
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

const BASE = process.env.P5_BASE_DEV || process.env.P1_BASE_DEV || 'http://127.0.0.1:4311';
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
  const args = { out: tempDir('p5-e2e'), port: 9339 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function click(cdp, selector, index = 0) {
  const ok = await cdp.evaluate(`(() => {
    const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Click target not found: ${selector}[${index}]`);
  await sleep(200);
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
  await sleep(220);
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
  await sleep(200);
}

async function saveSettings(cdp) {
  await clickByText(cdp, 'button', 'Lưu cấu hình');
  await waitFor(cdp, '!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(220);
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
  await sleep(150);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p5-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];
  const screenshots = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 320)}` : ''}`);
  };
  const capture = async (name) => {
    const viewport = await cdp.evaluate('({ width: innerWidth, height: innerHeight })');
    const file = path.join(outDir, `${name}.png`);
    await screenshot(cdp, { x: 0, y: 0, width: viewport.width, height: viewport.height }, file);
    screenshots.push(file);
  };
  const openDialog = async () => {
    await click(cdp, '[aria-label="Cài đặt"]');
    await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  };
  const reload = async () => {
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 20000 });
    await sleep(450);
  };
  const barState = () => cdp.evaluate(`(() => {
    const bar = document.querySelector('.status-bar');
    if (!bar) return { present: false };
    const rect = bar.getBoundingClientRect();
    const toolbar = document.querySelector('header.top-utility-bar')?.getBoundingClientRect();
    const dashboard = document.querySelector('.dashboard')?.getBoundingClientRect();
    const overlaps = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const itemTexts = Array.from(bar.querySelectorAll('.status-item')).map((node) => node.textContent.replace(/\\s+/g, ' ').trim());
    return {
      present: true,
      role: bar.getAttribute('role') || '',
      label: bar.getAttribute('aria-label') || '',
      live: !!bar.querySelector('[aria-live]') || bar.hasAttribute('aria-live'),
      itemTexts,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      overlapsToolbar: overlaps(rect, toolbar),
      overlapsDashboard: overlaps(rect, dashboard),
      overflowX: document.documentElement.scrollWidth <= innerWidth + 0.5,
      reserved: bar.classList.contains('status-bar--reserve-dock')
    };
  })()`);

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.text || 'exception');
  });

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
    await reload();

    // 1. Default OFF keeps the previous layout untouched.
    const off = await barState();
    record('default-off', off.present === false, off);

    // 2. Opening settings and toggling status bar previews it immediately.
    await openDialog();
    await click(cdp, '.switch', 1);
    const preview = await barState();
    const dialogPreview = await cdp.evaluate(`({
      saveDisabled: document.querySelector('button[form="admin-settings-form"]')?.disabled ?? null
    })`);
    record('preview-consumer',
      preview.present === true && preview.overlapsToolbar === false && preview.overlapsDashboard === false
      && dialogPreview.saveDisabled === false,
      { preview, dialogPreview });
    await capture('status-bar-preview');
    await saveSettings(cdp);

    // 3. Content is real and accessible without a live region.
    const on = await barState();
    record('content-real-and-quiet',
      on.present === true && on.role === 'note' && on.label === 'Thanh trạng thái quản trị'
      && on.live === false
      && on.itemTexts[0] === 'Trực tuyến'
      && /^Môi trường: (Development|Production)$/.test(on.itemTexts[1] || '')
      && /^Asia\/Ho_Chi_Minh · \d{2}:\d{2}$/.test(on.itemTexts[2] || ''),
      on);
    record('no-overlap-with-content-or-dock',
      on.overlapsToolbar === false && on.overlapsDashboard === false && on.reserved === true, on);

    const clockCheck = await cdp.evaluate(`(() => {
      const bar = document.querySelector('.status-bar');
      const shown = bar?.querySelector('.status-item:last-child')?.textContent.split('·').pop().trim() || '';
      const format = (date) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
      const allowed = [format(new Date()), format(new Date(Date.now() + 60_000))];
      return { shown, allowed };
    })()`);
    record('clock-matches-timezone', clockCheck.allowed.includes(clockCheck.shown), clockCheck);

    // 4. Saved preference survives reload.
    await reload();
    const persisted = await barState();
    record('persists-after-reload', persisted.present === true, persisted);
    const stored = await cdp.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || 'null')`);
    record('stored-revision-and-flag',
      stored?.preferences?.statusBarEnabled === true && stored?.revision >= 1,
      { revision: stored?.revision, statusBarEnabled: stored?.preferences?.statusBarEnabled });

    // 5. Clock follows the selected timezone after saving.
    await openDialog();
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    await selectValue(cdp, '.field-select', 'America/New_York');
    await saveSettings(cdp);
    const nyState = await barState();
    const nyClock = await cdp.evaluate(`(() => {
      const bar = document.querySelector('.status-bar');
      const text = bar?.querySelector('.status-item:last-child')?.textContent.replace(/\\s+/g, ' ').trim() || '';
      const shown = text.split('·').pop().trim();
      const format = (date) => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }).format(date);
      return { text, shown, allowed: [format(new Date()), format(new Date(Date.now() + 60_000))] };
    })()`);
    record('timezone-change-updates-clock',
      /^America\/New_York · \d{2}:\d{2}$/.test(nyState.itemTexts[2] || '') && nyClock.allowed.includes(nyClock.shown),
      nyClock);

    // 6. Online/offline switches the indicator without a live region.
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
    });
    await sleep(500);
    const offline = await barState();
    record('offline-indicator', offline.itemTexts[0] === 'Ngoại tuyến' && offline.live === false, offline.itemTexts);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
    });
    await sleep(500);
    const onlineAgain = await barState();
    record('online-indicator', onlineAgain.itemTexts[0] === 'Trực tuyến', onlineAgain.itemTexts);

    // 7. Bottom dock still never overlaps the bar.
    await cdp.evaluate(`localStorage.setItem('thinkup_admin_toolbar_dock', 'bottom'); true`);
    await reload();
    const bottomDock = await barState();
    record('no-overlap-bottom-dock',
      bottomDock.present === true && bottomDock.overlapsToolbar === false && bottomDock.reserved === true, bottomDock);
    await capture('status-bar-bottom-dock');

    // 8. Responsive: wraps inside the viewport without horizontal scroll.
    await setViewport(cdp, 768, 700);
    await sleep(300);
    const responsive = await barState();
    const barFit = await cdp.evaluate(`(() => {
      const bar = document.querySelector('.status-bar');
      if (!bar) return null;
      return { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth };
    })()`);
    record('responsive-768',
      responsive.present === true
      && responsive.rect.left >= 0 && responsive.rect.right <= 768.5
      && !!barFit && barFit.scrollWidth <= barFit.clientWidth + 1,
      { ...responsive, barFit });
    await capture('status-bar-768');
    await setViewport(cdp, 1920, 1080);
    await sleep(200);

    // 9. Turning it OFF restores the exact previous layout (no bar, no reserved gutter).
    await cdp.evaluate(`localStorage.setItem('thinkup_admin_toolbar_dock', 'right'); true`);
    await reload();
    await openDialog();
    await click(cdp, '.switch', 1);
    const previewOff = await barState();
    record('preview-off', previewOff.present === false, previewOff);
    await saveSettings(cdp);
    await reload();
    const finalOff = await barState();
    const finalStored = await cdp.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || 'null')`);
    record('off-restores-layout',
      finalOff.present === false && finalStored?.preferences?.statusBarEnabled === false, finalOff);

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p5',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      consoleErrors,
      screenshots
    };
    fs.writeFileSync(path.join(outDir, 'p5-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p5-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();
