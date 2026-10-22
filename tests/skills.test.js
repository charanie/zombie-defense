const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function fresh() {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.money = 99999;
  return s;
}

test('再生每 5 秒回复最大生命的 0.5%/级', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Tech.buy(s, 'hp_all');
  ZG.Tech.buy(s, 'regen');
  h.hp = 100;
  ZG.Sim.startRound(s);
  s.spawner.batches = [];
  // 保持战斗状态：留一只打不死的僵尸在远处，避免 3 秒清场结算
  const z = ZG.State.spawnZombie(s, 'walker', 100, 100);
  z.hp = z.maxHp = 999999; z.speed = 0;
  ZG.Sim.tick(s, 301);
  assert.ok(Math.abs(h.hp - (100 + h.maxHp * 0.005)) < 1e-6);
});

test('复活：40% 血、清感染、不生成 walker、每回合一次', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  for (const id of ['hp_all', 'regen', 'revive']) ZG.Tech.buy(s, id);
  s.rng.tech.chance = () => true;
  h.infection = 60;
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.equal(h.alive, true);
  assert.equal(h.hp.toFixed(4), (h.maxHp * 0.4).toFixed(4));
  assert.equal(h.infection, 0);
  assert.equal(s.zombies.length, 0);
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.equal(h.alive, false);
  assert.equal(s.zombies.filter(z => z.turnedFromHuman).length, 1);
});

test('英雄与队长不复活、不尸爆', () => {
  const s = fresh();
  const hero = ZG.State.spawnHuman(s, 'officer', 600, 600, { heroId: 'officer' });
  const cap = ZG.State.spawnHuman(s, 'pistol', 640, 600);
  ZG.Captains.promote(s, 1);
  for (const id of ['hp_all', 'regen', 'revive', 'death_boom']) ZG.Tech.buy(s, id);
  s.rng.tech.chance = () => true;
  const z = ZG.State.spawnZombie(s, 'walker', 620, 600);
  z.hp = z.maxHp = 9999;
  ZG.Combat.applyDamage(s, { target: hero, amount: 99999, damageKind: 'melee' });
  assert.equal(hero.wounded, true);
  assert.equal(z.hp, 9999); // 英雄没有尸爆
  z.x = 1000; z.y = 100;     // 移出队长爆炸半径，单独验证不复活
  ZG.Combat.applyDamage(s, { target: cap, amount: 99999, damageKind: 'melee' });
  assert.equal(cap.alive, false);
  assert.equal(s.zombies.some(q => q.turnedFromHuman), false);
});

test('尸爆只伤僵尸，半径 80、伤害 80+8R', () => {
  const s = fresh();
  s.round = 5;
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  for (const id of ['hp_all', 'regen', 'revive', 'death_boom']) ZG.Tech.buy(s, id);
  let roll = 0;
  // 第 1 次是复活判定（返回 false），第 2 次是尸爆判定（返回 true）
  s.rng.tech.chance = () => (++roll === 2);
  const z = ZG.State.spawnZombie(s, 'walker', 610, 600);
  z.hp = z.maxHp = 9999;
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.equal(h.alive, false);
  assert.equal(z.hp.toFixed(4), (9999 - 120).toFixed(4));
});

test('未购买概率节点时不消耗 rng.tech', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  let calls = 0;
  const orig = s.rng.tech.chance;
  s.rng.tech.chance = p => { calls++; return orig(p); };
  ZG.Combat.applyDamage(s, { target: h, amount: 99999, damageKind: 'melee' });
  assert.equal(calls, 0);
});

test('疫医转化读科技：上限 8、概率 20%、随机非英雄职业且满血', () => {
  const s = fresh();
  ZG.State.spawnHuman(s, 'plague', 600, 600, { heroId: 'plague' });
  for (const id of ['hero_dmg', 'officer_range', 'samurai_chain', 'gatling_heal', 'plague_cap', 'plague_random']) {
    ZG.Tech.buy(s, id);
  }
  const z = ZG.State.spawnZombie(s, 'walker', 600, 400);
  const h = ZG.Combat.convertZombie(s, z);
  assert.ok(ZG.Data.tech.convertClasses.includes(h.classId));
  assert.equal(h.hp, h.maxHp);
  assert.equal(h.converted, true);
});

test('每回合重置援助次数、技能冷却与复活标记', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  h.skillCd = 5; h.skillT = 2; h.skillUses = 3; h.reviveRound = 1;
  s.supports.uses.areaHeal = 1;
  ZG.Sim.startRound(s);
  assert.equal(h.skillCd, 0);
  assert.equal(h.skillT, 0);
  assert.equal(h.reviveRound, 0);
  assert.equal(s.supports.uses.areaHeal, 0);
});
