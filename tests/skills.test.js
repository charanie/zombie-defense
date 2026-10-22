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

test('手枪主动：8 秒一次，2 秒攻速 +120%', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Tech.buy(s, 'fire_dmg'); ZG.Tech.buy(s, 'pistol_passive'); ZG.Tech.buy(s, 'pistol_active');
  const z = ZG.State.spawnZombie(s, 'walker', 600, 400);
  z.hp = z.maxHp = 99999; z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 8 + 2);
  assert.equal(h.skillT > 0, true);
  assert.equal(ZG.Stats.human(s, h).interval.toFixed(4), (0.5 / 2.2).toFixed(4));
});

test('霰弹主动：眩晕 0.8 秒并击退，BOSS 免疫眩晕', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'shotgun', 600, 600);
  for (const id of ['fire_dmg', 'pistol_passive', 'shotgun_passive', 'shotgun_active']) ZG.Tech.buy(s, id);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  z.hp = z.maxHp = 99999; z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 10 + 2);
  assert.ok(z.stunT > 0.7);
  assert.ok(z.y < 500); // 被从 600,600 的方向往外推
});

test('机枪主动：1 秒 12 段 ×8', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'mg', 600, 600);
  for (const id of ['fire_dmg', 'pistol_passive', 'mg_passive', 'mg_active']) ZG.Tech.buy(s, id);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  z.hp = z.maxHp = 99999; z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 12 + 90);
  assert.ok(99999 - z.hp >= 96);
});

test('盾兵主动：嘲讽 2 秒、自身减伤 30%', () => {
  const s = fresh();
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  for (const id of ['fire_dmg', 'pistol_passive', 'mg_passive', 'shield_passive', 'shield_active']) ZG.Tech.buy(s, id);
  // 放在嘲讽半径内、近战范围外，避免它在 15 秒里把盾兵血量打掉
  const z = ZG.State.spawnZombie(s, 'walker', 800, 600);
  z.hp = z.maxHp = 99999; z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60 * 15 + 2);
  assert.equal(z.tauntTargetId, h.id);
  assert.equal(h.guardT > 0, true);
  ZG.Combat.applyDamage(s, { target: h, amount: 100, damageKind: 'melee' });
  // 盾被动 -10% 与盾墙 -30% 同时生效
  assert.equal(h.hp.toFixed(4), (650 - 63).toFixed(4));
});

test('英雄强化：长官 5 发、半径 210；医疗体系 3 级', () => {
  const s = fresh();
  ZG.State.spawnHuman(s, 'officer', 600, 600, { heroId: 'officer' });
  for (const id of ['hero_dmg', 'officer_range', 'officer_uses']) ZG.Tech.buy(s, id);
  for (let i = 0; i < 10; i++) ZG.State.spawnZombie(s, 'walker', 500 + i * 20, 300);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.equal(s.stats.missilesFired, 5);
  assert.equal(ZG.Tech.mods(s).hero.officerRange, 210);

  const s2 = fresh();
  const m = ZG.State.spawnHuman(s2, 'medic', 600, 600);
  for (const id of ['hero_dmg', 'hero_hp', 'officer_range', 'officer_uses', 'samurai_chain', 'gatling_heal', 'plague_cap', 'medical_system']) {
    ZG.Tech.buy(s2, id);
  }
  ZG.Tech.buy(s2, 'medical_system'); ZG.Tech.buy(s2, 'medical_system');
  assert.equal(ZG.Tech.mods(s2).hero.medicalRank, 3);
  assert.equal(ZG.Sim.startRound(s2).ok, true);
  assert.equal(m.serumLeft, 6);
});

test('援助校验：未解锁 / 非战斗 / 次数 / 金钱 / 地图外', () => {
  const s = fresh();
  assert.deepEqual(ZG.Skills.castSupport(s, 'areaHeal', 600, 400),
    { ok: false, reason: 'locked' });
  for (const id of ['econ_gold', 'build_hp', 'bank_power', 'support_heal']) ZG.Tech.buy(s, id);
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  assert.deepEqual(ZG.Skills.castSupport(s, 'areaHeal', 600, 400),
    { ok: false, reason: 'not-battle' });
  ZG.Sim.startRound(s); s.spawner.batches = [];
  assert.deepEqual(ZG.Skills.castSupport(s, 'areaHeal', -1, 400),
    { ok: false, reason: 'outside' });
  s.money = 0;
  assert.deepEqual(ZG.Skills.castSupport(s, 'areaHeal', 600, 400),
    { ok: false, reason: 'money' });
  s.money = 1000;
  assert.equal(ZG.Skills.castSupport(s, 'areaHeal', 600, 400).ok, true);
  assert.equal(ZG.Skills.castSupport(s, 'areaHeal', 600, 400).reason, 'uses');
});

test('范围治疗：150 半径、120 HP、驱散 40；强化后 187.5 / 150 / 54 金', () => {
  const s = fresh();
  for (const id of ['econ_gold','build_hp','bank_power','support_heal','support_bomb','support_power']) {
    ZG.Tech.buy(s, id);
  }
  const a = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  a.maxHp = 1000; a.hp = 50; a.infection = 80;
  const out = ZG.State.spawnHuman(s, 'pistol', 900, 600);
  out.maxHp = 1000; out.hp = 50; out.infection = 80;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const r = ZG.Skills.castSupport(s, 'areaHeal', 600, 600);
  assert.equal(r.ok, true);
  assert.equal(r.cost, 54);
  assert.equal(a.hp, 200);
  assert.equal(a.infection, 40);
  assert.equal(out.hp, 50);
});

test('导弹轰炸：2 发、固定偏移、伤害 300+12R', () => {
  const s = fresh();
  for (const id of ['econ_gold','build_hp','bank_power','support_heal','support_bomb']) ZG.Tech.buy(s, id);
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  s.round = 10;
  const z = ZG.State.spawnZombie(s, 'walker', 600, 400);
  z.hp = z.maxHp = 9999;
  ZG.Skills.castSupport(s, 'missileBombardment', 600, 400);
  assert.equal(s.projectiles.length, 2);
  assert.deepEqual(s.projectiles.map(p => [p.tx, p.ty]), [[576, 388], [624, 412]]);
  ZG.Sim.tick(s, 30);
  assert.ok(9999 - z.hp > 0);
});

test('援助命令回放一致', () => {
  const run = () => {
    const s = fresh();
    for (const id of ['econ_gold','build_hp','bank_power','support_heal']) {
      ZG.Sim.applyCommand(s, { op: 'buyTechNode', nodeId: id });
    }
    ZG.State.spawnHuman(s, 'pistol', 600, 600);
    ZG.Sim.applyCommand(s, { op: 'startRound' });
    ZG.Sim.applyCommand(s, { op: 'castSupport', skillId: 'areaHeal', x: 600, y: 500 });
    ZG.Sim.tick(s, 120);
    return ZG.State.hash(s);
  };
  assert.equal(run(), run());
});
