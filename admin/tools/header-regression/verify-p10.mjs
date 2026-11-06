/**
 * P10 E2E: opt-in custom shortcuts for real shell actions.
 *
 * Covers: default off (no global dock shortcut), enable/disable, dock action
 * works globally only when enabled, input fields are ignored, reserved and
 * conflicting chords are rejected, reset restores defaults, Esc still closes
 * overlays, header unchanged.
 *
 * Usage: node verify-p10.mjs [--out=dir] [--port=9342]
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

const BASE = process.env.P10_BASE_DEV || process.env.P1_BASE_DEV || 'http://127.0.0.1:4211';
const ADMIN_ID = 'demo-admin@thinkup.edu.vn';
const SHORTCUT_KEY = 'thinkup_admin_shortcuts';
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
  const args = { out: tempDir('p10'), port: 9342 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
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

async function openSettings(cdp) {
  await cdp.evaluate(`document.querySelector('[aria-label="Cài đặt"]')?.click()`);
  await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(250);
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

const VK = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Escape: 27, Home: 36, End: 35 };

/** modifiers bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8 */
async function pressKey(cdp, key, code, modifiers = 0) {
  const vk = VK[key] ?? 0;
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers
  });
  await sleep(250);
}

const dockState = (cdp) => cdp.evaluate(`(() => {
  const tools = document.querySelector('.liquid-tools');
  const rect = tools?.getBoundingClientRect();
  const stored = localStorage.getItem('thinkup_admin_toolbar_dock');
  return {
    stored,
    rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    dialogOpen: !!document.querySelector('dialog[open]'),
    toolCount: tools ? tools.querySelectorAll(':scope > button, :scope > .top-popover-anchor > button').length : 0
  };
})()`);

async function toggleShortcuts(cdp) {
  await cdp.evaluate(`(() => {
    const section = document.querySelector('section[aria-labelledby="settings-shortcuts"]');
    const rows = Array.from(section.querySelectorAll('.switch-row'));
    rows[0].querySelector('input[role="switch"]').click();
    return true;
  })()`);
  await sleep(250);
}

const shortcutRowsState = (cdp) => cdp.evaluate(`(() => {
  const section = document.querySelector('section[aria-labelledby="settings-shortcuts"]');
  return Array.from(section.querySelectorAll('.shortcut-list--editable .shortcut-row')).map((row) => ({
    label: row.querySelector('strong')?.textContent.trim() ?? '',
    chord: row.querySelector('small')?.textContent.trim() ?? '',
    button: row.querySelector('button')?.textContent.trim() ?? ''
  }));
})()`);

async function captureChord(cdp, rowIndex, key, extra = {}) {
  await cdp.evaluate(`(() => {
    const rows = document.querySelectorAll('section[aria-labelledby="settings-shortcuts"] .shortcut-list--editable .shortcut-row');
    rows[${rowIndex}].querySelector('button').click();
    return true;
  })()`);
  await sleep(150);
  await cdp.evaluate(`(() => {
    const rows = document.querySelectorAll('section[aria-labelledby="settings-shortcuts"] .shortcut-list--editable .shortcut-row');
    const button = rows[${rowIndex}].querySelector('button');
    button.dispatchEvent(new KeyboardEvent('keydown', {
      key: ${JSON.stringify(key)},
      bubbles: true,
      cancelable: true,
      ctrlKey: ${extra.ctrl === true},
      altKey: ${extra.alt === true},
      shiftKey: ${extra.shift === true}
    }));
    return true;
  })()`);
  await sleep(250);
}

const shortcutErrorText = (cdp) => cdp.evaluate(
  `document.querySelector('section[aria-labelledby="settings-shortcuts"] [role="alert"]')?.textContent.trim() ?? null`
);

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p10-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 320)}` : ''}`);
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
    await sleep(500);

    // 1. Default off: no stored config, global Alt+Arrow does nothing.
    const defaults = await dockState(cdp);
    await pressKey(cdp, 'ArrowUp', 'ArrowUp', 1);
    const afterDefaultPress = await dockState(cdp);
    record('shortcuts-default-off',
      defaults.stored === 'right' && afterDefaultPress.stored === 'right'
      && JSON.stringify(afterDefaultPress.rect) === JSON.stringify(defaults.rect),
      { defaults, afterDefaultPress });

    // 2. Enabling renders four real, editable actions.
    await openSettings(cdp);
    await openTab(cdp, 'Phím tắt thao tác');
    await toggleShortcuts(cdp);
    const rows = await shortcutRowsState(cdp);
    record('enable-renders-real-actions',
      rows.length === 4
      && rows.every((row) => row.chord.startsWith('Alt+'))
      && rows.every((row) => row.button === 'Ghi lại'),
      rows);

    // 3. A global chord docks the toolbar only while enabled.
    await saveSettings(cdp);
    await pressKey(cdp, 'ArrowUp', 'ArrowUp', 1);
    const dockedTop = await dockState(cdp);
    record('enabled-global-shortcut-works',
      dockedTop.stored === 'top' && dockedTop.rect?.y === 16,
      dockedTop);

    // 4. Typing contexts ignore the shortcut.
    const guard = await cdp.evaluate(`(() => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
      const result = localStorage.getItem('thinkup_admin_toolbar_dock');
      input.remove();
      document.body.focus();
      return result;
    })()`);
    record('input-context-is-ignored', guard === 'top', { stored: guard });

    // 5. Reserved chord is rejected.
    await openSettings(cdp);
    await openTab(cdp, 'Phím tắt thao tác');
    await captureChord(cdp, 0, 'ArrowUp', { ctrl: true });
    const reservedError = await shortcutErrorText(cdp);
    const afterReserved = await shortcutRowsState(cdp);
    record('reserved-chord-rejected',
      typeof reservedError === 'string' && reservedError.includes('Ctrl')
      && afterReserved[0]?.chord === 'Alt+ArrowUp',
      { error: reservedError, rows: afterReserved });

    // 6. Duplicate chord is rejected.
    await captureChord(cdp, 0, 'ArrowRight', { alt: true });
    const conflictError = await shortcutErrorText(cdp);
    record('duplicate-chord-rejected',
      typeof conflictError === 'string' && conflictError.includes('đã dùng'),
      { error: conflictError });

    // 7. A valid new chord is accepted and persisted.
    await captureChord(cdp, 0, 'Home', { alt: true });
    const afterValid = await shortcutRowsState(cdp);
    const storedBindings = await cdp.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SHORTCUT_KEY)}) || 'null')`);
    record('valid-chord-accepted',
      afterValid[0]?.chord === 'Alt+Home' && storedBindings?.bindings?.['dock-top'] === 'Alt+Home',
      { rows: afterValid, stored: storedBindings });

    // 8. Reset restores defaults and turns customization off.
    await clickByText(cdp, 'button', 'Khôi phục phím tắt mặc định');
    const afterReset = await cdp.evaluate(`(() => {
      const stored = JSON.parse(localStorage.getItem(${JSON.stringify(SHORTCUT_KEY)}) || 'null');
      const section = document.querySelector('section[aria-labelledby="settings-shortcuts"]');
      return {
        stored,
        enabled: section.querySelector('.switch-row input[role="switch"]').checked,
        editableRows: section.querySelectorAll('.shortcut-list--editable .shortcut-row').length
      };
    })()`);
    record('reset-restores-defaults',
      afterReset.stored?.enabled === false
      && afterReset.stored?.bindings?.['dock-top'] === 'Alt+ArrowUp'
      && afterReset.enabled === false && afterReset.editableRows === 0,
      afterReset);

    // 9. Esc still closes overlays (dialog) regardless of shortcut config.
    await pressKey(cdp, 'Escape', 'Escape', 0);
    const afterEsc = await dockState(cdp);
    record('escape-closes-overlay', afterEsc.dialogOpen === false, afterEsc);

    // 10. Header untouched.
    const header = await dockState(cdp);
    record('header-unchanged', header.toolCount === 4 && header.rect !== null, header);
    await screenshot(cdp, { x: 0, y: 0, width: 1920, height: 1080 }, path.join(outDir, 'p10-final.png'));

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p10',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      consoleErrors
    };
    fs.writeFileSync(path.join(outDir, 'p10-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p10-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();
