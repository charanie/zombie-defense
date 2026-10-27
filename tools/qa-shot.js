/* 浏览器 QA 截图：Edge headless + DevTools 协议，零 npm 依赖
 *
 * 用法：
 *   node tools/qa-shot.js <url> <out.png> [--w 1440] [--h 900] [--eval "<js>"] [--wait 1200]
 *
 * 例：
 *   node tools/qa-shot.js "file:///F:/ds%20harness/games/zombie-defense/index.html" shots/menu-main.png ^
 *     --eval "ZG.Menu.show('main')"
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

function edgePath() {
  for (const p of EDGE_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Edge/Chrome');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitTarget(port, needle, timeoutMs) {
  const end = Date.now() + (timeoutMs || 20000);
  while (Date.now() < end) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && (!needle || t.url.indexOf(needle) >= 0));
      if (page && page.webSocketDebuggerUrl) return page;
      if (page) {
        // 还没有导航到目标 URL，也先用这个 page target
        return page;
      }
    } catch (e) { /* 还没起来 */ }
    await sleep(120);
  }
  throw new Error('DevTools 目标未就绪');
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  return function send(method, params) {
    const mid = ++id;
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  };
}

async function run(opts) {
  const port = opts.port || (9300 + Math.floor(Math.random() * 400));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zd-qa-'));
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + dir,
    '--window-size=' + opts.width + ',' + opts.height,
    '--force-device-scale-factor=1',
    'about:blank'
  ];
  const proc = spawn(edgePath(), args, { stdio: 'ignore' });
  try {
    const target = await waitTarget(port, null);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const send = cdp(ws);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: opts.width, height: opts.height, deviceScaleFactor: 1, mobile: !!opts.mobile
    });
    if (opts.coarse) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });
    }
    if (opts.reduced) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    }
    if (opts.preloadFile) {
      const source = fs.readFileSync(opts.preloadFile, 'utf8');
      await send('Page.addScriptToEvaluateOnNewDocument', { source });
    }
    await send('Page.navigate', { url: opts.url });
    await sleep(opts.wait || 1200);
    if (opts.eval || opts.evalFile) {
      const expression = opts.evalFile
        ? fs.readFileSync(opts.evalFile, 'utf8')
        : opts.eval;
      const r = await send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, userGesture: true
      });
      if (r.exceptionDetails) {
        const ex = r.exceptionDetails.exception || r.exceptionDetails;
        throw new Error('eval 失败: ' + (ex.description || ex.text || JSON.stringify(ex)));
      }
      if (r.result && r.result.value !== undefined && typeof r.result.value !== 'object') {
        console.log('eval ->', r.result.value);
      }
      await sleep(opts.after || 220);
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(opts.out, Buffer.from(shot.data, 'base64'));
    console.log('shot:', opts.out);
    ws.close();
  } finally {
    try { proc.kill(); } catch (e) { /* 忽略 */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }
}

function parseArgs(argv) {
  const out = { width: 1440, height: 900, wait: 1200 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--w') out.width = parseInt(argv[++i], 10);
    else if (a === '--h') out.height = parseInt(argv[++i], 10);
    else if (a === '--eval') out.eval = argv[++i];
    else if (a === '--eval-file') out.evalFile = argv[++i];
    else if (a === '--preload-file') out.preloadFile = argv[++i];
    else if (a === '--wait') out.wait = parseInt(argv[++i], 10);
    else if (a === '--after') out.after = parseInt(argv[++i], 10);
    else if (a === '--mobile') out.mobile = true;
    else if (a === '--coarse') out.coarse = true;
    else if (a === '--reduced') out.reduced = true;
    else rest.push(a);
  }
  out.url = rest[0];
  out.out = rest[1];
  return out;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url || !opts.out) {
    console.error('用法: node tools/qa-shot.js <url> <out.png> [--w N] [--h N] [--eval js] [--wait ms]');
    process.exit(2);
  }
  run(opts).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { run };
