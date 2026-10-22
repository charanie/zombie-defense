const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('每 3 回合晋升最多 3 名，尽量不同职业', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  for (let i = 0; i < 3; i++) {
    ZG.State.spawnHuman(s, ['pistol', 'shotgun', 'shield'][i], 500 + i * 80, 600);
  }
  const got = ZG.Captains.promote(s);
  assert.equal(got.length, 3);
  assert.equal(new Set(got.map(h => h.classId)).size, 3);
});

test('队长晋升属性与感染免疫', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  h.infection = 40;
  ZG.Captains.promote(s, 1);
  assert.equal(h.captain, true);
  assert.equal(h.maxHp, 140 * 2.5);
  assert.equal(h.infection, 0);
  ZG.Infection.add(s, h, 50);
  assert.equal(h.infection, 0);
});

test('队长上限 8 名，溢出 +10% 全体队长伤害（最多 +50%）', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  for (let i = 0; i < 12; i++) ZG.State.spawnHuman(s, 'pistol', 200 + i * 60, 600);
  for (let k = 0; k < 6; k++) ZG.Captains.promote(s, 3);
  assert.equal(s.humans.filter(h => h.captain).length, 8);
  assert.equal(s.stats.captainOverflow, 5);
});

test('队长死亡爆炸，对 BOSS 百分比伤害有上限', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Captains.promote(s, 1);
  const z = ZG.State.spawnZombie(s, 'giant', 620, 600);
  z.hp = z.maxHp = 9999;
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.ok(z.hp < 9999);
  assert.equal(s.zombies.some(x => x.turnedFromHuman), false);
});

test('优先随机未拥有英雄，集齐后重复强化', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  const a = ZG.Heroes.grant(s);
  const b = ZG.Heroes.grant(s);
  assert.notEqual(a.heroId, b.heroId);
  ZG.Heroes.grant(s);
  ZG.Heroes.grant(s);
  assert.equal(s.humans.filter(h => h.hero).length, 4);
  const dup = ZG.Heroes.grant(s);
  const h = s.humans.find(x => x.heroId === dup.heroId);
  assert.equal(h.heroHpStacks, 1);
  assert.ok(Math.abs(h.dmgMul - 1.15) < 1e-9);
});

test('英雄阵亡休整 1 回合，50% HP 回归', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  const h = ZG.Heroes.grant(s);
  s.round = 7;
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.equal(h.wounded, true);
  assert.equal(h.alive, false);
  s.round = 8; s.status = 'settlement';
  ZG.Sim.settleRound(s);
  assert.equal(h.alive, false);
  s.round = 9; s.status = 'prep';
  ZG.Heroes.returnWounded(s);
  assert.equal(h.alive, true);
  assert.equal(h.hp, h.maxHp * 0.5);
});

test('BOSS 死亡立即触发英雄奖励', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  s.round = 7;
  const b = ZG.State.spawnZombie(s, 'boss', 600, 500); b.isBoss = true;
  ZG.Combat.applyDamage(s, { target: b, amount: 999999, damageKind: 'ranged' });
  assert.equal(s.stats.heroes, 1);
});

test('英雄是最后一名人类时阵亡立即判负', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 61 });
  const h = ZG.Heroes.grant(s);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  s.zombies.length = 0;
  ZG.Sim.tick(s, 61);
  assert.equal(s.status, 'over');
});

test('疫医转化：每回合最多 5、不占人口、阻止爆仔', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 51 });
  ZG.State.spawnHuman(s, 'plague', 600, 600, { heroId: 'plague' });
  const zs = [];
  for (let i = 0; i < 20; i++) zs.push(ZG.State.spawnZombie(s, 'walker', 600, 400 + i));
  ZG.Sim.startRound(s); s.spawner.batches = [];
  let converted = 0;
  for (const z of zs) {
    assert.equal(ZG.Combat.tryConvert(s, z, 0.10), true);
    if (z.alive === false) converted++;
    if (converted === 5) break;
  }
  assert.equal(converted, 5);
  assert.equal(s.humans.filter(h => h.converted).length, 5);
  assert.equal(ZG.Economy.populationUsed(s), 0);

  const s2 = ZG.Sim.createGame({ mapId: 'suburban', seed: 52 });
  const z2 = ZG.State.spawnZombie(s2, 'walker', 600, 400);
  assert.equal(ZG.Combat.tryConvert(s2, z2, 0.20), false);

  const s3 = ZG.Sim.createGame({ mapId: 'suburban', seed: 53 });
  const m = ZG.State.spawnZombie(s3, 'mother', 600, 400);
  ZG.Combat.convertZombie(s3, m);
  assert.equal(s3.zombies.includes(m), false);
  assert.equal(s3.zombies.filter(z => z.typeId === 'baby').length, 0);
});

test('转化兵 3 个完整回合后结算消失，不转化', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 51 });
  s.round = 5;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600, { converted: true, expireRound: 7 });
  s.status = 'settlement';
  ZG.Sim.settleRound(s);
  assert.equal(h.alive, true);
  s.round = 7; s.status = 'settlement'; ZG.Sim.settleRound(s);
  assert.equal(s.humans.includes(h), false);
  assert.equal(s.zombies.some(z => z.turnedFromHuman), false);
});

test('长官导弹、武士剑气、加特林鼓舞', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 41 });
  const o = ZG.State.spawnHuman(s, 'officer', 600, 600, { heroId: 'officer' });
  for (let i = 0; i < 10; i++) ZG.State.spawnZombie(s, 'walker', 500 + i * 20, 300);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.ok(o.skillUses < 3);
  assert.equal(s.stats.missilesFired, 3);

  const s2 = ZG.Sim.createGame({ mapId: 'suburban', seed: 41 });
  ZG.State.spawnHuman(s2, 'samurai', 600, 600, { heroId: 'samurai' });
  const z = ZG.State.spawnZombie(s2, 'walker', 600, 570);
  z.speed = 0; z.hp = z.maxHp = 99999;
  ZG.Sim.startRound(s2); s2.spawner.batches = [];
  let slashes = 0;
  for (let i = 0; i < 20; i++) {
    const before = z.hp;
    ZG.Sim.tick(s2, 60);
    if (z.hp < before - 126) slashes++;
  }
  assert.ok(slashes > 0);

  const s3 = ZG.Sim.createGame({ mapId: 'suburban', seed: 51 });
  ZG.State.spawnHuman(s3, 'gatling', 600, 600, { heroId: 'gatling' });
  for (let i = 0; i < 3; i++) ZG.State.spawnHuman(s3, 'pistol', 620 + i * 25, 600);
  ZG.Sim.startRound(s3); s3.spawner.batches = [];
  s3.humans[0].skillCd = 0;
  ZG.Sim.tick(s3, 1);
  assert.equal(s3.humans[1].inspireT > 0, true);
});
