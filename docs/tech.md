# 技术栈与工程约束

> 与 ADR-0001 一致。最后更新：2026-10-18。

## 运行时

| 项 | 选择 | 说明 |
|---|---|---|
| 语言 | 原生 JavaScript（ES2017） | 无 TypeScript、无打包器 |
| 模块 | 经典 `<script>` + `window.ZG` | `file://` 双击可玩 |
| 渲染 | Canvas 2D 双层 + DOM/CSS HUD | 静态背景层 / 动态战场层 |
| 模拟 | 固定步长 1/60s 累加器 | 每帧最多追 5 步 |
| 随机 | mulberry32 命名流（spawn/promote/hero/jitter/fx） | 同种子可复现 |
| 寻路 | 32px 网格 + 多源 BFS 流场 | 建造/摧毁时重算 |
| 空间查询 | 64px 空间哈希 | 索敌、AOE、分离 |
| 存档 | `localStorage`（try/catch），`Platform` 抽象 | 预留 Electron/Tauri/Steam |
| 音频 | Web Audio 程序生成 | 无音频文件；首次手势初始化 |
| PWA | manifest + Service Worker（Cache First） | 仅 HTTPS/localhost 注册 |
| 测试 | `node:test` + `tests/load-sim.js` | 不进入运行时 |

## 分层

```
core/   常量、随机、事件、几何、状态、平台        ← 无依赖
data/   人类、僵尸、英雄、建筑、地图、波次、公式  ← 只依赖 core
sim/    空间哈希、属性、寻路、感染、战斗、
        投射物、经济、出生、AI、队长、英雄、模拟  ← 依赖 core + data，禁止 DOM
view/   视图模型、Canvas 渲染、粒子、音效、HUD、输入
main.js 组装、主循环、输入回调、PWA
```

## 加载顺序

`index.html` 中的 `<script src>` 顺序是唯一真相；`tests/load-sim.js` 解析它并在 Node 中用 `vm.runInThisContext` 加载（跳过 `main.js` 与 `test-hooks.js`）。新增文件必须同时加入 `index.html` 与 `sw.js` 的预缓存列表。

## 性能预算

- 300 僵尸 + 99 人类 + 100 投射物：模拟 ≤4ms/步，渲染 ≤6ms/帧。
- 当前实测：Node `avgStepMs ≈0.9`；浏览器模拟 ≈1.7ms、渲染+HUD ≈4.65ms。
- 粒子上限 250（移动 120），伤害数字上限 50，同屏僵尸上限 300（移动 200）。

## 浏览器目标

- Chrome / Edge 最新版；桌面 1280×720 逻辑分辨率。
- 手机横屏；`pointer` 事件统一鼠标/触控；竖屏显示提示。
- 不支持 IE；Safari 仅保证较新版本。

## 构建与发布

无构建。发布即上传静态文件：

```
index.html styles.css manifest.webmanifest sw.js icons/ src/
```

Service Worker 版本号在 `sw.js` 的 `CACHE` 常量；发版时递增并清理旧缓存。部署使用 SSH 推送到 GitHub Pages（本机 `github.com:443` 被阻断）。
