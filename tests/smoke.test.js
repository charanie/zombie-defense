const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('模块加载完整', () => {
  for (const name of ['Const', 'Rng', 'EventBus', 'Geom', 'State', 'Balance', 'Waves',
    'Spatial', 'Pathing', 'Squads', 'Combat', 'Projectiles', 'Economy', 'Spawner', 'AI',
    'Captains', 'Heroes', 'Sim', 'Platform', 'Model', 'Particles', 'Audio', 'Renderer', 'HUD', 'Input',
    'Tech', 'Skills', 'TechLayout', 'TechPanel', 'MenuScene', 'Menu', 'Intro']) {
    assert.ok(ZG[name], 'missing ZG.' + name);
  }
  assert.equal(ZG.Const.W, 1280);
  assert.equal(ZG.Const.H, 720);
});

test('创建游戏与单位', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 42 });
  assert.equal(s.status, 'prep');
  assert.equal(s.money, 400);
  assert.equal(s.humans.length, 0);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  assert.equal(h.id, 1);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 100);
  assert.equal(z.id, 2);
  assert.ok(ZG.Pathing.validate(ZG.Data.maps.suburban));
});
