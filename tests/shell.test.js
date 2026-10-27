const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('版本号三处一致', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.equal(pkg.version, '1.5.0');
  assert.ok(sw.includes("'zd-v1.5.0'"));
  const ZG = require('./load-sim.js')();
  assert.equal(ZG.Const.VERSION, 'v1.5.0');
});

test('index.html 的脚本全部进入 sw.js SHELL', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => './' + m[1]);
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const s of srcs) assert.ok(sw.includes("'" + s + "'"), s);
});
