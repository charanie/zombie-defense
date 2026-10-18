const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('创建游戏与开始回合', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 7 });
  assert.equal(s.status, 'prep');
  assert.equal(s.money, 400);
  assert.equal(s.battle.time, 0);
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  assert.equal(ZG.Sim.startRound(s).ok, true);
  assert.equal(s.status, 'battle');
  assert.ok(s.spawner.batches.length > 0);
});

test('没有人类不能开始回合', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  assert.deepEqual(ZG.Sim.startRound(s), { ok: false, reason: 'no-humans' });
});

test('清场后 3 秒结算并进入下一回合整备', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 7 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s);
  s.spawner.batches = []; s.spawner.batchIndex = 0; s.zombies.length = 0;
  ZG.Sim.tick(s, 60 * 4);
  assert.equal(s.status, 'prep');
  assert.equal(s.round, 2);
  assert.equal(s.money, 400 + 72);
});

test('同种子同操作哈希一致', () => {
  const run = () => {
    const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 99 });
    ZG.State.spawnHuman(s, 'pistol', 600, 600);
    ZG.State.spawnHuman(s, 'shield', 620, 560);
    ZG.Sim.startRound(s);
    ZG.Sim.tick(s, 120);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
});

test('结算回血 30%、感染压到 30、平民收入', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.hp = 100;
  const c = ZG.State.spawnHuman(s, 'civilian', 700, 600);
  h.infection = 80;
  const before = s.money;
  ZG.Sim.startRound(s); s.spawner.batches = []; s.zombies.length = 0;
  ZG.Sim.tick(s, 60 * 4);
  assert.ok(h.hp > 100, '存活人类应回血');
  assert.ok(Math.abs(h.hp - (100 + h.maxHp * 0.3)) < 10, '回血约 30%（扣感染持续伤害）');
  assert.equal(h.infection, 30);
  assert.equal(c.alive, true);
  assert.equal(s.money, before + 12 + 72);
});

test('有治疗兵时感染清零', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600); h.infection = 80;
  ZG.State.spawnHuman(s, 'medic', 650, 600);
  ZG.Sim.startRound(s); s.spawner.batches = []; s.zombies.length = 0;
  ZG.Sim.tick(s, 60 * 4);
  assert.equal(h.infection, 0);
});

test('人类全灭 1 秒后判负', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: h, amount: 9999, damageKind: 'melee' });
  s.zombies = s.zombies.filter(z => !z.turnedFromHuman);
  ZG.Sim.tick(s, 59);
  assert.equal(s.status, 'battle');
  ZG.Sim.tick(s, 2);
  assert.equal(s.status, 'over');
});

test('最后一名人类与最后一只僵尸同帧死亡判负', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: h, amount: 9999, damageKind: 'melee' });
  ZG.Combat.applyDamage(s, { target: z, amount: 9999, damageKind: 'ranged' });
  s.zombies = s.zombies.filter(z2 => !z2.turnedFromHuman);
  ZG.Sim.tick(s, 61);
  assert.equal(s.status, 'over');
});

test('180 秒后每 30 秒狂暴，240 秒强制结算', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  ZG.State.spawnZombie(s, 'giant', 300, 100);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  s.battle.time = 181;
  ZG.Sim.tick(s, 1);
  assert.equal(s.battle.berserkTier, 1);
  s.battle.time = 211;
  ZG.Sim.tick(s, 1);
  assert.equal(s.battle.berserkTier, 2);

  const s2 = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s2, 'shield', 600, 620);
  ZG.State.spawnZombie(s2, 'walker', 600, 300);
  ZG.Sim.startRound(s2); s2.spawner.batches = [];
  s2.battle.time = 240;
  ZG.Sim.tick(s2, 1);
  assert.ok(['settlement', 'prep'].includes(s2.status));
  assert.equal(s2.zombies.length, 0);
});

test('8 秒无进展传送', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  const z = ZG.State.spawnZombie(s, 'walker', 80, 80);
  z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, Math.round(60 * 8.5));
  assert.ok(z.x !== 80 || z.y !== 80);
});

test('暂停时不推进模拟', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s);
  s.ui.paused = true;
  const t = s.battle.time;
  ZG.Sim.tick(s, 60);
  assert.equal(s.battle.time, t);
});

test('回放：同种子 + 命令一致', () => {
  const cmds = [
    { op: 'recruit', classId: 'pistol', x: 600, y: 600 },
    { op: 'recruit', classId: 'shield', x: 620, y: 560 },
    { op: 'startRound' }
  ];
  const run = () => {
    const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
    for (const c of cmds) assert.equal(ZG.Sim.applyCommand(s, c).ok, true);
    ZG.Sim.tick(s, 600);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 5 });
  for (const c of cmds) ZG.Sim.applyCommand(s, c);
  assert.deepEqual(ZG.Sim.record(s), cmds);
});
