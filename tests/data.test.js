const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('难度公式与计划书一致', () => {
  assert.equal(ZG.Balance.zombieHp(90, 1), 90);
  assert.equal(ZG.Balance.zombieHp(90, 7).toFixed(2), '127.67');
  assert.equal(ZG.Balance.zombieDamage(8, 51), 12);
  assert.equal(ZG.Balance.zombieSpeed(38, 60), 47.5);
  assert.equal(ZG.Balance.bounty(6, 7), 7);
  assert.equal(ZG.Balance.populationCap(1), 10);
  assert.equal(ZG.Balance.populationCap(7), 22);
  assert.equal(ZG.Balance.populationCap(40), 80);
  assert.equal(ZG.Balance.roundReward(1), 72);
  assert.equal(ZG.Balance.bossHp(7).toFixed(2), '2633.97');
  assert.equal(ZG.Balance.bossRockDamage(7), 122);
  assert.equal(ZG.Balance.bossReward(7), 750);
  assert.equal(ZG.Balance.mineDamage(7).toFixed(2), (120 * Math.pow(1.06, 6)).toFixed(2));
});

test('科技费用与倍率', () => {
  assert.equal(ZG.Balance.techCost('fire', 0), 120);
  assert.equal(ZG.Balance.techCost('fire', 1), 174);
  assert.equal(ZG.Balance.techCost('econ', 0), 100);
  assert.equal(ZG.Balance.techCost('econ', 1), 140);
  assert.equal(ZG.Balance.techMul('fire', 10), 1.5);
  assert.equal(ZG.Balance.techMul('armor', 10).toFixed(2), '1.60');
  assert.equal(ZG.Balance.techMul('econ', 10).toFixed(2), '1.40');
  assert.equal(ZG.Balance.econRewardMul(1).toFixed(2), '1.08');
  assert.equal(ZG.Balance.serumCount(3), 6);
});

test('人类数据表精确', () => {
  const h = ZG.Data.humans;
  assert.deepEqual([h.pistol.cost, h.pistol.hp, h.pistol.attack.damage, h.pistol.attack.interval], [60, 140, 12, 0.5]);
  assert.equal(h.shotgun.attack.pellets * h.shotgun.attack.damage / h.shotgun.attack.interval, 50);
  assert.equal((45 * 9 / (45 / 9 + 2)).toFixed(1), '57.9');
  assert.deepEqual([h.flame.attack.damage, h.flame.attack.interval, h.flame.attack.coneDeg], [5, 0.125, 50]);
  assert.deepEqual([h.rocket.attack.damage, h.rocket.attack.interval, h.rocket.attack.siegeBonus], [130, 2, 1.25]);
  assert.deepEqual([h.shield.hp, h.shield.shieldHp, h.shield.attack.range], [650, 400, 50]);
  assert.deepEqual([h.medic.healRate, h.medic.serumLeft, h.medic.serumAmount], [20, 3, 50]);
  assert.deepEqual([h.civilian.cost, h.civilian.income], [40, 12]);
  assert.equal(ZG.Data.humanOrder.length, 8);
});

test('僵尸数据表精确', () => {
  const z = ZG.Data.zombies;
  assert.deepEqual([z.walker.hp, z.walker.speed, z.walker.damage, z.walker.bounty], [90, 38, 8, 6]);
  assert.deepEqual([z.runner.hp, z.runner.speed, z.runner.bounty], [60, 75, 9]);
  assert.deepEqual([z.shield.hp, z.shield.shield, z.shield.shieldDamageMul], [200, 200, 0.5]);
  assert.deepEqual([z.shield.fireShieldMul, z.shield.fireBodyMul], [2, 1]);
  assert.deepEqual([z.boomer.fuse, z.boomer.explosion.radius, z.boomer.explosion.infection], [0.8, 80, 100]);
  assert.deepEqual([z.mother.hp, z.mother.deathExplosion.human, z.mother.deathExplosion.building], [360, 80, 200]);
  assert.deepEqual([z.giant.hp, z.giant.buildingMultiplier, z.giant.radius], [1100, 3, 22]);
  assert.deepEqual([z.baby.hp, z.baby.speed, z.baby.bounty], [40, 55, 2]);
});

test('英雄与建筑数据齐全', () => {
  for (const id of ZG.Data.heroOrder) {
    const h = ZG.Data.heroes[id];
    assert.ok(h.hp > 0 && h.attack.range > 0);
  }
  assert.equal(ZG.Data.heroes.plague.hp, 800);
  assert.equal(ZG.Data.heroes.gatling.hp, 1600);
  for (const id of ZG.Data.buildingOrder) {
    const b = ZG.Data.buildings[id];
    assert.ok(b.cost > 0 && b.hp > 0);
  }
});

test('波次数量与构成', () => {
  assert.deepEqual(ZG.Waves.composition(1), { walker: 11, runner: 0, shield: 0, boomer: 0, mother: 0, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(3), { walker: 18, runner: 3, shield: 0, boomer: 0, mother: 0, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(4), { walker: 18, runner: 4, shield: 2, boomer: 2, mother: 0, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(5), { walker: 17, runner: 5, shield: 3, boomer: 3, mother: 3, giant: 0 });
  assert.deepEqual(ZG.Waves.composition(6), { walker: 16, runner: 6, shield: 5, boomer: 4, mother: 3, giant: 2 });
  assert.deepEqual(ZG.Waves.composition(7), { walker: 19, runner: 7, shield: 5, boomer: 5, mother: 3, giant: 2 });
  assert.equal(ZG.Waves.total(7), 41);
});

test('BOSS 回合与护卫', () => {
  assert.equal(ZG.Waves.isBossRound(7), true);
  assert.equal(ZG.Waves.isBossRound(8), false);
  assert.equal(ZG.Waves.preview(7).escort, 8);
  assert.equal(ZG.Waves.preview(7).boss, true);
  assert.equal(ZG.Waves.preview(1).total, 11);
});

test('批次总量、时长与 BOSS 位置', () => {
  const rng = ZG.Rng.createStreams(9).spawn;
  const w = ZG.Waves.build(7, rng);
  const n = w.batches.reduce((s, b) => s + b.spawns.length, 0);
  assert.equal(n, 49);
  for (const b of w.batches) assert.ok(b.spawns.length >= 6 && b.spawns.length <= 12);
  assert.equal(w.batches[0].at, 5);
  assert.ok(w.batches.every((b, i) => i === 0 || b.at - w.batches[i - 1].at >= 5));
  assert.ok(ZG.Data.bossOrder.includes(w.bossType));
  const bosses = w.batches.flatMap(b => b.spawns).filter(s => ZG.Data.bossOrder.includes(s.type));
  assert.equal(bosses.length, 1);
  assert.equal(bosses[0].type, w.bossType);
});
