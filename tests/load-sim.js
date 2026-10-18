/* 解析 index.html 的 script 顺序，在 Node 中加载模拟层与纯视图模型 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

module.exports = function loadSim() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const skip = s => s === 'src/main.js' || s === 'src/test-hooks.js';
  delete globalThis.ZG;
  for (const f of srcs) {
    if (skip(f)) continue;
    const full = path.join(root, f);
    if (!fs.existsSync(full)) throw new Error('missing script: ' + f);
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: f });
  }
  return globalThis.ZG;
};
