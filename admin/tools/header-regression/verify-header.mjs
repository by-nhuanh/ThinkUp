/**
 * P0 header regression capture.
 *
 * - Launches a local Edge/Chrome over CDP (no npm dependency).
 * - Seeds a demo admin session (the app is served from a prebuilt dev bundle).
 * - Isolates the page content with visibility:hidden so the pill's backdrop is
 *   deterministic without changing layout, dock position or the real backdrop-filter.
 * - Captures screenshots, computed styles, DOM structure and geometry.
 * - Compares with a baseline and (optionally) runs the Pillow pixel comparison.
 *
 * This is a verification tool only; it never imports or changes app code.
 *
 * Usage:
 *   node verify-header.mjs --update
 *   node verify-header.mjs --check
 *   node verify-header.mjs --check --mutate=radius
 *   node verify-header.mjs --check --only=1920x1080:right
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  applyIsolation,
  applyRealPageMode,
  captureState,
  connectPage,
  launchBrowser,
  navigate,
  readGitCommit,
  setViewport,
  sleep,
  stopBrowser,
  tempDir,
  waitFor
} from './lib.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CONTRACT_PATH = path.join(HERE, 'header-contract.json');
const CONTRACT = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const CONTRACT_HASH = crypto.createHash('sha256').update(JSON.stringify(CONTRACT)).digest('hex');

function parseArgs(argv) {
  const args = { mode: 'check', out: tempDir('artifacts'), only: '', mutate: '', render: 'isolated', skipCompare: false, port: 9333 };
  for (const raw of argv) {
    if (raw === '--update') args.mode = 'update';
    else if (raw === '--check') args.mode = 'check';
    else if (raw === '--skip-compare') args.skipCompare = true;
    else if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--only=')) args.only = raw.slice(7);
    else if (raw.startsWith('--mutate=')) args.mutate = raw.slice(9);
    else if (raw.startsWith('--render=')) args.render = raw.slice(9);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else if (raw === '--help') {
      console.log('Usage: node verify-header.mjs [--update|--check] [--out=dir] [--only=WxH:dock] [--render=isolated|real] [--mutate=radius|gap|badge|order]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${raw}`);
    }
  }
  if (!['isolated', 'real'].includes(args.render)) throw new Error(`Unknown render mode: ${args.render}`);
  return args;
}

function stateKey(dock, label) {
  return `${dock}-${label.replace(/[^a-zA-Z0-9@]+/g, '_')}`;
}

function matchesOnly(only, dock, label) {
  if (!only) return true;
  if (only.includes(':')) {
    const [viewport, requestedDock] = only.split(':');
    return viewport === label && requestedDock === dock;
  }
  return only === dock || only === label;
}

async function seedSession(cdp, baseUrl, session, dock) {
  await navigate(cdp, `${baseUrl}/login`);
  const payload = {
    token: session.token,
    user: session.user,
    dock,
    offset: '16'
  };
  await cdp.evaluate(`(() => {
    localStorage.setItem('access_token', ${JSON.stringify(payload.token)});
    localStorage.setItem('thinkup_admin_user', ${JSON.stringify(JSON.stringify(payload.user))});
    localStorage.setItem('thinkup_admin_toolbar_dock', ${JSON.stringify(payload.dock)});
    localStorage.setItem('thinkup_admin_toolbar_offset', ${JSON.stringify(payload.offset)});
    return true;
  })()`);
}

async function reloadWithDock(cdp, baseUrl, dock) {
  await cdp.evaluate(`(() => {
    localStorage.setItem('thinkup_admin_toolbar_dock', ${JSON.stringify(dock)});
    localStorage.setItem('thinkup_admin_toolbar_offset', '16');
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitFor(cdp, 'document.readyState === "complete"', { timeoutMs: 30000 });
  await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
  await cdp.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
  await sleep(200);
}

function applyMutation(cdp, mutation) {
  if (!mutation) return;
  if (mutation === 'radius') {
    return cdp.evaluate(`(() => {
      const style = document.createElement('style');
      style.textContent = '.liquid-tools { border-radius: 17px !important; }';
      document.head.appendChild(style);
      return true;
    })()`);
  }
  if (mutation === 'gap') {
    return cdp.evaluate(`(() => {
      const style = document.createElement('style');
      style.textContent = '.liquid-tools { gap: 3px !important; }';
      document.head.appendChild(style);
      return true;
    })()`);
  }
  if (mutation === 'badge') {
    return cdp.evaluate(`(() => {
      const badge = document.querySelector('.badge');
      if (!badge) return false;
      badge.textContent = '9';
      return true;
    })()`);
  }
  if (mutation === 'order') {
    return cdp.evaluate(`(() => {
      const tools = document.querySelector('.liquid-tools');
      if (!tools || tools.children.length < 2) return false;
      tools.insertBefore(tools.lastElementChild, tools.firstElementChild);
      return true;
    })()`);
  }
  throw new Error(`Unknown mutation: ${mutation}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compareComputedAndDom(baselineDir, currentDir, stateKeys) {
  const failures = [];
  for (const key of stateKeys) {
    const basePath = path.join(baselineDir, 'states', `${key}.json`);
    const currentPath = path.join(currentDir, 'states', `${key}.json`);
    if (!fs.existsSync(basePath)) {
      failures.push({ key, kind: 'missing-baseline', detail: basePath });
      continue;
    }
    if (!fs.existsSync(currentPath)) {
      failures.push({ key, kind: 'missing-current', detail: currentPath });
      continue;
    }
    const base = readJson(basePath);
    const current = readJson(currentPath);
    if (!deepEqual(base.styles, current.styles)) {
      failures.push({
        key,
        kind: 'computed-style',
        detail: diffObjects(base.styles, current.styles)
      });
    }
    if (!deepEqual(base.dom, current.dom)) {
      failures.push({ key, kind: 'dom-structure', detail: diffObjects(base.dom, current.dom) });
    }
    const baseAssertions = (base.assertions || []).map((item) => `${item.pass}`).join(',');
    const currentAssertions = (current.assertions || []).map((item) => `${item.pass}`).join(',');
    if (baseAssertions !== currentAssertions) {
      failures.push({ key, kind: 'assertions', detail: { baseline: base.assertions, current: current.assertions } });
    }
    const failedAssertions = (current.assertions || []).filter((item) => !item.pass);
    if (failedAssertions.length) {
      failures.push({ key, kind: 'assertion-failed', detail: failedAssertions });
    }
  }
  return failures;
}

function diffObjects(base, current, prefix = '') {
  const changes = [];
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(current || {})]);
  for (const key of keys) {
    const a = base?.[key];
    const b = current?.[key];
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      changes.push(...diffObjects(a, b, `${prefix}${key}.`));
    } else if (a !== b) {
      changes.push({ path: `${prefix}${key}`, baseline: a, current: b });
    }
  }
  return changes;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.HEADER_BASE_URL || CONTRACT.app.baseUrl;
  const outRoot = path.resolve(args.out);
  const baselineDir = path.join(outRoot, 'baseline');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const currentDir = path.join(outRoot, args.mutate ? `mutations/${args.mutate}-${runId}` : `runs/${runId}`);
  fs.mkdirSync(currentDir, { recursive: true });
  fs.mkdirSync(path.join(currentDir, 'states'), { recursive: true });
  fs.mkdirSync(path.join(currentDir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(currentDir, 'meta'), { recursive: true });

  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`profile-${runId}`) });
  const cdp = await connectPage(args.port);
  const startedAt = new Date().toISOString();
  const results = [];
  const failures = [];

  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await seedSession(cdp, baseUrl, CONTRACT.app.session, CONTRACT.docks[0]);
    await navigate(cdp, `${baseUrl}${CONTRACT.app.route}`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
    await cdp.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');

    for (const dock of CONTRACT.docks) {
      await reloadWithDock(cdp, baseUrl, dock);
      if (args.render === 'real') await applyRealPageMode(cdp);
      else await applyIsolation(cdp, CONTRACT.isolation);
      for (const viewport of [...CONTRACT.viewports, ...CONTRACT.zoomViewports]) {
        if (!matchesOnly(args.only, dock, viewport.label)) continue;
        await setViewport(cdp, viewport.width, viewport.height);
        await sleep(150);
        if (args.render === 'real') await applyRealPageMode(cdp);
        else await applyIsolation(cdp, CONTRACT.isolation);
        await cdp.evaluate('window.scrollTo(0, 0); document.activeElement && document.activeElement.blur(); true');
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: 1,
          y: 1,
          button: 'none',
          buttons: 0
        }).catch(() => {});
        if (args.mutate) await applyMutation(cdp, args.mutate);
        const key = stateKey(dock, viewport.label);
        const captured = await captureState(cdp, CONTRACT, {
          key,
          dock,
          viewport,
          render: args.render,
          imagePath: path.join(currentDir, 'images', `${key}.png`)
        });
        fs.writeFileSync(path.join(currentDir, 'states', `${key}.json`), JSON.stringify(captured.state, null, 2));
        fs.writeFileSync(path.join(currentDir, 'meta', `${key}.json`), JSON.stringify(captured.meta, null, 2));
        results.push({
          key,
          dock,
          viewport: viewport.label,
          width: viewport.width,
          height: viewport.height,
          image: captured.imagePath,
          headerRect: captured.meta.headerRect,
          badgeRect: captured.meta.badgeRect
        });
        if (captured.state.assertions.some((item) => !item.pass)) {
          failures.push({ key, kind: 'assertion-failed', detail: captured.state.assertions.filter((item) => !item.pass) });
        }
      }
    }

    const manifest = {
      tool: 'verify-header.mjs',
      version: 1,
      mode: args.mode,
      render: args.render,
      mutation: args.mutate || null,
      startedAt,
      finishedAt: new Date().toISOString(),
      appUrl: baseUrl,
      route: CONTRACT.app.route,
      baselineCommit: CONTRACT.baselineCommit,
      gitCommit: readGitCommit(path.resolve(HERE, '../../../')),
      contractHash: CONTRACT_HASH,
      browser: launch.version,
      browserPath: launch.browserPath,
      node: process.version,
      os: { platform: os.platform(), release: os.release(), arch: os.arch() },
      dpi: 1,
      isolation: CONTRACT.isolation,
      tolerance: CONTRACT.tolerance,
      viewports: CONTRACT.viewports.map((item) => item.label),
      zoomViewports: CONTRACT.zoomViewports.map((item) => item.label),
      docks: CONTRACT.docks,
      states: results.length,
      flags: { only: args.only || null }
    };
    fs.writeFileSync(path.join(currentDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    if (args.mode === 'update') {
      fs.rmSync(baselineDir, { recursive: true, force: true });
      fs.cpSync(currentDir, baselineDir, { recursive: true });
      console.log(`BASELINE_UPDATED ${baselineDir}`);
      console.log(`MANIFEST ${path.join(baselineDir, 'manifest.json')}`);
    } else {
      if (!fs.existsSync(baselineDir)) {
        throw new Error(`Baseline not found at ${baselineDir}. Run with --update first.`);
      }
      const baselineManifest = readJson(path.join(baselineDir, 'manifest.json'));
      if (baselineManifest.baselineCommit !== manifest.baselineCommit) {
        failures.push({
          key: 'manifest',
          kind: 'baseline-commit',
          detail: { baseline: baselineManifest.baselineCommit, current: manifest.baselineCommit }
        });
      }
      if (baselineManifest.contractHash !== manifest.contractHash) {
        failures.push({
          key: 'manifest',
          kind: 'contract-changed',
          detail: { baseline: baselineManifest.contractHash, current: manifest.contractHash }
        });
      }
      if (baselineManifest.render !== manifest.render) {
        failures.push({
          key: 'manifest',
          kind: 'render-mode',
          detail: { baseline: baselineManifest.render, current: manifest.render }
        });
      }
      const baselineStates = fs.existsSync(path.join(baselineDir, 'states'))
        ? fs.readdirSync(path.join(baselineDir, 'states')).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, ''))
        : [];
      const currentStates = fs.readdirSync(path.join(currentDir, 'states')).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, ''));
      const missing = baselineStates.filter((key) => !currentStates.includes(key));
      const extra = currentStates.filter((key) => !baselineStates.includes(key));
      if (missing.length) failures.push({ key: 'states', kind: 'missing-current', detail: missing });
      if (extra.length) failures.push({ key: 'states', kind: 'extra-current', detail: extra });
      failures.push(...compareComputedAndDom(baselineDir, currentDir, currentStates.filter((key) => baselineStates.includes(key))));

      if (!args.skipCompare) {
        const compareScript = path.join(HERE, 'compare-screenshots.py');
        const compareJson = path.join(currentDir, 'compare.json');
        const python = process.env.P0_PYTHON || 'python';
        const result = spawnSync(python, [
          compareScript,
          '--baseline', path.join(baselineDir, 'images'),
          '--current', path.join(currentDir, 'images'),
          '--meta', path.join(currentDir, 'meta'),
          '--out', path.join(currentDir, 'diff'),
          '--tolerance', String(CONTRACT.tolerance.channel),
          '--max-ratio', String(CONTRACT.tolerance.maxDiffRatio),
          '--floor', String(CONTRACT.tolerance.maxDiffPixelsFloor),
          '--json', compareJson
        ], { stdio: 'inherit' });
        if (result.error) {
          failures.push({ key: 'images', kind: 'compare-error', detail: String(result.error.message || result.error) });
        } else if (result.status !== 0) {
          const summary = fs.existsSync(compareJson) ? readJson(compareJson) : null;
          failures.push({ key: 'images', kind: 'pixel-diff', detail: summary });
        }
      }
    }

    const report = {
      mode: args.mode,
      mutation: args.mutate || null,
      passed: failures.length === 0,
      stateCount: results.length,
      failures,
      manifest,
      artifacts: {
        current: currentDir,
        baseline: baselineDir
      }
    };
    fs.writeFileSync(path.join(currentDir, 'report.json'), JSON.stringify(report, null, 2));
    if (args.mode === 'check') {
      fs.writeFileSync(path.join(outRoot, 'last-report.json'), JSON.stringify(report, null, 2));
    }
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} states=${results.length} failures=${failures.length}`);
    console.log(`REPORT ${path.join(currentDir, 'report.json')}`);
    if (failures.length) {
      for (const failure of failures.slice(0, 10)) {
        console.log(`FAIL ${failure.kind} ${failure.key} ${JSON.stringify(failure.detail).slice(0, 600)}`);
      }
      process.exitCode = 1;
    }
  } finally {
    cdp.close();
    await stopBrowser(launch);
  }
}

run().catch((error) => {
  console.error('FATAL', error?.stack || error);
  process.exitCode = 2;
});
