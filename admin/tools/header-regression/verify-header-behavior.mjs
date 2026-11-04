/**
 * P0 functional regression for the existing header behavior.
 * Only current (baseline) behavior is asserted. P1 behavior is intentionally not required here.
 *
 * Usage: node verify-header-behavior.mjs [--out=dir]
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

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CONTRACT = JSON.parse(fs.readFileSync(path.join(HERE, 'header-contract.json'), 'utf8'));

function parseArgs(argv) {
  const args = { out: tempDir('behavior'), port: 9334 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function mouse(cdp, type, x, y, buttons) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseMoved' && buttons === 0 ? 'none' : 'left',
    buttons,
    clickCount: type === 'mouseMoved' ? 0 : 1
  });
}

async function handleCenter(cdp) {
  return cdp.evaluate(`(() => {
    const node = document.querySelector('.utility-drag-handle');
    const r = node.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
}

async function currentDock(cdp) {
  return cdp.evaluate(`({
    stored: localStorage.getItem('thinkup_admin_toolbar_dock'),
    className: document.querySelector('header.top-utility-bar')?.className || ''
  })`);
}

async function dragTo(cdp, targetX, targetY) {
  const start = await handleCenter(cdp);
  await mouse(cdp, 'mousePressed', start.x, start.y, 1);
  for (let step = 1; step <= 6; step += 1) {
    const x = start.x + ((targetX - start.x) * step) / 6;
    const y = start.y + ((targetY - start.y) * step) / 6;
    await mouse(cdp, 'mouseMoved', x, y, 1);
    await sleep(25);
  }
  await mouse(cdp, 'mouseReleased', targetX, targetY, 0);
  await sleep(300);
  return currentDock(cdp);
}

async function clickSelector(cdp, selector) {
  await cdp.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`);
  await sleep(150);
}

async function reloadAndWait(cdp, baseUrl) {
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitFor(cdp, 'document.readyState === "complete"', { timeoutMs: 30000 });
  await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
  await cdp.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
  await sleep(200);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`behavior-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];
  const apiRequests = [];
  const baseUrl = process.env.HEADER_BASE_URL || CONTRACT.app.baseUrl;

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  };

  const screenshots = [];
  const captureRealPage = async (name) => {
    const size = await cdp.evaluate('({ width: window.innerWidth, height: window.innerHeight })');
    const file = path.join(outDir, `real-${name}.png`);
    await screenshot(cdp, { x: 0, y: 0, width: size.width, height: size.height }, file);
    screenshots.push(file);
    return file;
  };

  try {
    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
      }
    });
    cdp.on('Runtime.exceptionThrown', (params) => {
      consoleErrors.push(params.exceptionDetails?.text || 'exception');
    });
    cdp.on('Network.requestWillBeSent', (params) => {
      if (String(params.request?.url || '').includes('/api/')) apiRequests.push(params.request.url);
    });

    await setViewport(cdp, 1920, 1080);
    await navigate(cdp, `${baseUrl}/login`);
    await cdp.evaluate(`(() => {
      localStorage.setItem('access_token', ${JSON.stringify(CONTRACT.app.session.token)});
      localStorage.setItem('thinkup_admin_user', ${JSON.stringify(JSON.stringify(CONTRACT.app.session.user))});
      localStorage.setItem('thinkup_admin_toolbar_dock', 'right');
      localStorage.setItem('thinkup_admin_toolbar_offset', '16');
      return true;
    })()`);
    await navigate(cdp, `${baseUrl}${CONTRACT.app.route}`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
    await cdp.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
    await sleep(250);
    await captureRealPage('start-right');

    // 1. Existing account popover toggles by click.
    await clickSelector(cdp, '.top-tool.account-tool');
    const accountOpen = await cdp.evaluate(`({
      expanded: document.querySelector('.top-tool.account-tool')?.getAttribute('aria-expanded'),
      popover: !!document.querySelector('.account-popover'),
      text: document.querySelector('.account-popover')?.innerText?.slice(0, 80) || ''
    })`);
    record('account-popover-opens', accountOpen.expanded === 'true' && accountOpen.popover, accountOpen);
    await clickSelector(cdp, '.top-tool.account-tool');
    const accountClosed = await cdp.evaluate(`({
      expanded: document.querySelector('.top-tool.account-tool')?.getAttribute('aria-expanded'),
      popover: !!document.querySelector('.account-popover')
    })`);
    record('account-popover-closes-by-click', accountClosed.expanded === 'false' && !accountClosed.popover, accountClosed);

    // 2. Existing bell popover toggles by click.
    await clickSelector(cdp, '.top-tool[aria-label="Thông báo"]');
    const bellOpen = await cdp.evaluate(`({
      expanded: document.querySelector('.top-tool[aria-label="Thông báo"]')?.getAttribute('aria-expanded'),
      popover: !!document.querySelector('.top-popover'),
      text: document.querySelector('.top-popover')?.innerText?.slice(0, 80) || ''
    })`);
    record('bell-popover-opens', bellOpen.expanded === 'true' && bellOpen.popover, bellOpen);
    await clickSelector(cdp, '.top-tool[aria-label="Thông báo"]');
    const bellClosed = await cdp.evaluate(`({
      expanded: document.querySelector('.top-tool[aria-label="Thông báo"]')?.getAttribute('aria-expanded'),
      popover: !!document.querySelector('.top-popover')
    })`);
    record('bell-popover-closes-by-click', bellClosed.expanded === 'false' && !bellClosed.popover, bellClosed);

    // 3. Drag to each edge (existing behavior).
    let dock = await dragTo(cdp, 960, 24);
    record('drag-to-top', dock.stored === 'top' && dock.className.includes('dock-top'), dock);
    await captureRealPage('dock-top');

    await reloadAndWait(cdp, baseUrl);
    const persistedTop = await currentDock(cdp);
    record('dock-persists-after-reload', persistedTop.stored === 'top' && persistedTop.className.includes('dock-top'), persistedTop);
    await captureRealPage('reload-top');

    dock = await dragTo(cdp, 960, 1056);
    record('drag-to-bottom', dock.stored === 'bottom' && dock.className.includes('dock-bottom'), dock);
    await captureRealPage('dock-bottom');

    dock = await dragTo(cdp, 24, 540);
    record('drag-to-left', dock.stored === 'left' && dock.className.includes('dock-left'), dock);
    await captureRealPage('dock-left');

    dock = await dragTo(cdp, 1896, 540);
    record('drag-to-right', dock.stored === 'right' && dock.className.includes('dock-right'), dock);
    await captureRealPage('dock-right');

    // 4. Keyboard dock (Alt + ArrowDown => bottom).
    await cdp.evaluate(`(() => { document.querySelector('.utility-drag-handle').focus(); return true; })()`);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers: 1,
      key: 'ArrowDown',
      code: 'ArrowDown',
      windowsVirtualKeyCode: 40,
      nativeVirtualKeyCode: 40
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: 1,
      key: 'ArrowDown',
      code: 'ArrowDown',
      windowsVirtualKeyCode: 40,
      nativeVirtualKeyCode: 40
    });
    await sleep(250);
    const keyboardDock = await currentDock(cdp);
    record('keyboard-alt-arrow-dock', keyboardDock.stored === 'bottom' && keyboardDock.className.includes('dock-bottom'), keyboardDock);
    await captureRealPage('keyboard-bottom');

    // 5. Resize clamp (existing behavior).
    await setViewport(cdp, 768, 700);
    await sleep(250);
    const clamp = await cdp.evaluate(`(() => {
      const node = document.querySelector('header.top-utility-bar');
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, innerWidth, innerHeight };
    })()`);
    const clampPass = clamp.x >= 0 && clamp.y >= 0 && clamp.right <= clamp.innerWidth + 0.5 && clamp.bottom <= clamp.innerHeight + 0.5;
    record('resize-clamp-in-viewport', clampPass, clamp);

    // 6. No uncaught console errors.
    record('no-console-errors', consoleErrors.length === 0, consoleErrors.slice(0, 5));

    const report = {
      tool: 'verify-header-behavior.mjs',
      startedAt: new Date().toISOString(),
      url: `${baseUrl}${CONTRACT.app.route}`,
      browser: launch.version,
      passed: results.every((item) => item.passed),
      results,
      screenshots,
      consoleErrors,
      apiRequests
    };
    fs.writeFileSync(path.join(outDir, 'behavior-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'behavior-report.json')}`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    cdp.close();
    await stopBrowser(launch);
  }
}

run().catch((error) => {
  console.error('FATAL', error?.stack || error);
  process.exitCode = 2;
});
