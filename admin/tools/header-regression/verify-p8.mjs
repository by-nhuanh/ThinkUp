/**
 * P8 E2E: notification sound (frontend-only part of P8).
 *
 * Email report and SLA settings are backend-dependent (scheduler, real support
 * and course data) and are deliberately NOT rendered as controls — this script
 * asserts that no fake toggle exists and that the explanatory note is present.
 *
 * Usage: node verify-p8.mjs [--out=dir] [--port=9340]
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

const BASE = process.env.P8_BASE_DEV || process.env.P1_BASE_DEV || 'http://127.0.0.1:4211';
const ADMIN_ID = 'demo-admin@thinkup.edu.vn';
const SOUND_KEY = 'thinkup_admin_notification_sound';
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
  const args = { out: tempDir('p8'), port: 9340 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function click(cdp, selector) {
  const ok = await cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Click target not found: ${selector}`);
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
  await sleep(200);
}

/** Real input event so the page gets user activation (Web Audio autoplay policy). */
async function trustedClick(cdp, selector) {
  const point = await cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Trusted click target not found: ${selector}`);
  await sleep(120);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleep(220);
}

async function openSettings(cdp) {
  await click(cdp, '[aria-label="Cài đặt"]');
  await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(200);
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
  await sleep(220);
}

async function saveSettings(cdp) {
  await clickByText(cdp, 'button', 'Lưu cấu hình');
  await waitFor(cdp, '!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(220);
}

const soundState = (cdp) => cdp.evaluate(`(() => {
  const toggle = document.querySelector('input[name="admin-notification-sound"]')
    || document.querySelector('section[aria-labelledby="settings-notifications"] input[role="switch"]');
  const test = Array.from(document.querySelectorAll('section[aria-labelledby="settings-notifications"] button'))
    .find((node) => node.textContent.trim() === 'Nghe thử');
  return {
    checked: toggle ? toggle.checked : null,
    testDisabled: test ? test.disabled : null,
    stored: localStorage.getItem(${JSON.stringify(SOUND_KEY)}),
    audioContexts: Array.isArray(window.__p8Audio) ? window.__p8Audio.length : null,
    audioState: Array.isArray(window.__p8Audio) && window.__p8Audio.length
      ? window.__p8Audio[window.__p8Audio.length - 1].state
      : null
  };
})()`);

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p8-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  };

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
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 20000 });
    await sleep(400);
    // Instrument the Web Audio constructor after the app loads (navigation resets window).
    await cdp.evaluate(`(() => {
      window.__p8Audio = [];
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        constructor(...params) {
          super(...params);
          window.__p8Audio.push(this);
        }
      };
      return true;
    })()`);

    // 1. Default off and test button disabled.
    await openSettings(cdp);
    await openTab(cdp, 'Thông báo & Âm thanh');
    const initial = await soundState(cdp);
    record('sound-default-off', initial.checked === false && initial.testDisabled === true, initial);

    // 2. BA controls exist, each with an honest backend-blocked note (B-21 / B-22).
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    const report = await cdp.evaluate(`(() => {
      const section = document.querySelector('section[aria-labelledby="settings-system-report"]');
      if (!section) return { exists: false };
      const text = section.textContent.replace(/\\s+/g, ' ').trim();
      return {
        exists: true,
        autoReport: !!section.querySelector('input[name="admin-email-report"]'),
        frequency: section.querySelectorAll('select').length,
        formats: section.querySelectorAll('input[name="admin-report-format"]').length,
        note: section.querySelector('.info-note')?.textContent.includes('B-21') ?? false,
        text
      };
    })()`);
    record('email-report-controls-with-backend-note',
      report.exists === true && report.autoReport === true && report.frequency >= 1
      && report.formats === 2 && report.note === true,
      report);

    await openTab(cdp, 'Thông báo & Âm thanh');
    const sla = await cdp.evaluate(`(() => {
      const section = document.querySelector('section[aria-labelledby="settings-sla"]');
      if (!section) return { exists: false };
      return {
        exists: true,
        course: !!section.querySelector('input[name="admin-sla-course"]'),
        ticket: !!section.querySelector('input[name="admin-sla-ticket"]'),
        note: section.querySelector('.info-note')?.textContent.includes('B-22') ?? false
      };
    })()`);
    record('sla-controls-with-backend-note',
      sla.exists === true && sla.course === true && sla.ticket === true && sla.note === true,
      sla);

    // 3. Enabling persists the flag and unlocks Web Audio.
    await trustedClick(cdp, 'section[aria-labelledby="settings-notifications"] input[role="switch"]');
    const enabled = await soundState(cdp);
    record('sound-toggle-persists',
      enabled.checked === true && enabled.stored === 'on' && enabled.testDisabled === false,
      enabled);
    record('sound-builds-audio-context', (enabled.audioContexts ?? 0) >= 1, enabled);

    // 4. Playing the test chime does not throw and keeps the context running.
    await trustedClick(cdp, 'section[aria-labelledby="settings-notifications"] button');
    await sleep(350);
    const afterPlay = await soundState(cdp);
    record('sound-test-plays',
      (afterPlay.audioContexts ?? 0) >= 1 && afterPlay.audioState === 'running',
      afterPlay);

    // 5. Header is untouched by the new settings section.
    const header = await cdp.evaluate(`(() => {
      const tools = document.querySelector('.liquid-tools');
      const rect = tools?.getBoundingClientRect();
      return {
        count: tools ? tools.querySelectorAll(':scope > button, :scope > .top-popover-anchor > button').length : 0,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
      };
    })()`);
    record('header-unchanged', header.count === 4 && header.rect !== null, header);
    await screenshot(cdp, { x: 0, y: 0, width: 1920, height: 1080 }, path.join(outDir, 'p8-settings-sound.png'));

    // 6. Sound preference survives Save and a reload.
    await saveSettings(cdp);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 20000 });
    await sleep(400);
    await openSettings(cdp);
    await openTab(cdp, 'Thông báo & Âm thanh');
    const reloaded = await soundState(cdp);
    record('sound-survives-reload', reloaded.checked === true && reloaded.stored === 'on', reloaded);

    // 7. Reset to defaults turns the sound off and Save commits it.
    await clickByText(cdp, 'button', 'Khôi phục mặc định');
    await clickByText(cdp, '.reset-actions button', 'Khôi phục');
    const reset = await soundState(cdp);
    record('reset-turns-sound-off', reset.checked === false && reset.stored === 'off', reset);
    await saveSettings(cdp);

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p8',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      consoleErrors
    };
    fs.writeFileSync(path.join(outDir, 'p8-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p8-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();
