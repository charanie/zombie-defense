const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function game(seed) {
  return ZG.Sim.createGame({ mapId: 'suburban', seed: seed || 1 });
}

function start(s) {
  ZG.Sim.startRound(s);
  s.spawner.batches = [];
  return s;
}

test('人类离开初始位置并向目标推进', () => {
  const s = game(1);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 525);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 300);
  z.speed = 0;
  z.hp = z.maxHp = 99999;
  start(s);
  ZG.Sim.tick(s, 60);

  assert.ok(h.y < 519, '应向目标推进，实际 y=' + h.y.toFixed(1));
  assert.equal(h.aiState, 'engage');
});

test('受伤单位前往治疗兵，治疗兵主动迎向伤员', () => {
  const s = game(2);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 620);
  const m = ZG.State.spawnHuman(s, 'medic', 400, 620);
  h.hp = 50;
  start(s);
  ZG.Sim.tick(s, 60);

  const d = ZG.Geom.dist(h.x, h.y, m.x, m.y);
  assert.ok(d < 150, '双方应接近，实际 ' + d.toFixed(1));
  assert.equal(h.careKind, 'medic');
  assert.ok(m.x > 405, '治疗兵应主动靠近伤员，实际 x=' + m.x.toFixed(1));
  assert.ok(h.hp > 50, '进入治疗范围后应回血');
});

test('受伤单位前往医疗站', () => {
  const s = game(3);
  s.money = 9999;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 620);
  h.hp = 50;
  const b = ZG.Economy.build(s, 'hospital', 600, 420).building;
  start(s);
  ZG.Sim.tick(s, 120);

  const d = ZG.Geom.dist(h.x, h.y, b.x, b.y);
  const stop = ZG.Data.buildings.hospital.heal.radius *
    ZG.Data.humanAi.hospitalStopRatio;
  assert.equal(h.careKind, 'hospital');
  assert.ok(d <= stop + 1, '应走到医疗站治疗范围，实际 ' + d.toFixed(1));
  assert.ok(h.hp > 50, '应被医疗站治疗');
});

test('狂尸冲刺时非盾单位侧移闪避', () => {
  const s = game(4);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'runner', 600, 500);
  z.sprinting = true;
  z.sprintT = 1;
  z.facing = Math.PI / 2;
  start(s);
  ZG.Sim.tick(s, 3);

  assert.ok(Math.abs(h.x - 600) > 2, '应侧移，实际 x=' + h.x.toFixed(2));
  assert.equal(h.aiState, 'dodge');
});

test('盾兵不闪避，据守硬吃', () => {
  const s = game(5);
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  const z = ZG.State.spawnZombie(s, 'runner', 600, 500);
  z.sprinting = true;
  z.sprintT = 1;
  z.facing = Math.PI / 2;
  start(s);
  ZG.Sim.tick(s, 3);

  assert.equal(h.dodgeT, 0);
  assert.equal(h.dodgeEnabled, false);
});

test('平民遇袭时撤离', () => {
  const s = game(6);
  const c = ZG.State.spawnHuman(s, 'civilian', 700, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 750, 600);
  z.speed = 0;
  start(s);
  ZG.Sim.tick(s, 30);

  assert.ok(c.x < 690, '应向远离僵尸的方向撤离，实际 x=' + c.x.toFixed(1));
  assert.equal(c.aiState, 'flee');
});

test('开战时回到玩家布置的站位', () => {
  const s = game(7);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  h.x = 100; h.y = 100;
  start(s);
  assert.equal(h.x, 600);
  assert.equal(h.y, 600);
  assert.equal(h.aiState, 'guard');
});

test('自主移动保持确定性', () => {
  const run = () => {
    const s = game(11);
    ZG.State.spawnHuman(s, 'pistol', 600, 600);
    ZG.State.spawnHuman(s, 'medic', 620, 600);
    ZG.State.spawnHuman(s, 'shield', 700, 600);
    const z = ZG.State.spawnZombie(s, 'runner', 600, 300);
    z.sprinting = true; z.sprintT = 1;
    start(s);
    ZG.Sim.tick(s, 300);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
});

test('每个战斗职业都有移动参数', () => {
  for (const id of ZG.Data.humanOrder) {
    const d = ZG.Data.humans[id];
    assert.ok(d.moveSpeed > 0, id + ' moveSpeed');
    assert.ok(typeof d.vision === 'number', id + ' vision');
    assert.ok(typeof d.huntRadius === 'number', id + ' huntRadius');
  }
  assert.ok(ZG.Data.humanAi.careHpRatio > 0);
  assert.ok(ZG.Data.humanAi.dodgeRadius > 0);
});
