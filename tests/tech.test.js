const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function fresh(money) {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  if (money !== undefined) s.money = money;
  return s;
}

test('初始化 47 个 rank=0，T1 无前置', () => {
  const s = fresh(1000);
  assert.equal(Object.keys(s.tech.ranks).length, 47);
  assert.deepEqual(ZG.Tech.canBuy(s, 'fire_dmg'), { ok: true });
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').ok, true);
  assert.equal(s.tech.ranks.fire_dmg, 1);
  assert.equal(s.money, 880);
});

test('前置：同分支上一层任一点解锁下一层，不跨分支', () => {
  const s = fresh(99999);
  assert.deepEqual(ZG.Tech.canBuy(s, 'pistol_passive'), { ok: false, reason: 'locked' });
  ZG.Tech.buy(s, 'fire_rate');
  assert.deepEqual(ZG.Tech.canBuy(s, 'pistol_passive'), { ok: true });
  assert.deepEqual(ZG.Tech.canBuy(s, 'bank_power'), { ok: false, reason: 'locked' });
  ZG.Tech.buy(s, 'econ_gold');
  assert.deepEqual(ZG.Tech.canBuy(s, 'bank_power'), { ok: true });
});

test('同层可全部购买；多级节点逐级涨价并封顶', () => {
  const s = fresh(99999);
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').cost, 120);
  assert.equal(ZG.Tech.buy(s, 'fire_rate').cost, 120);
  assert.equal(ZG.Tech.nextCost(s, 'fire_dmg'), 162);
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').cost, 162);
  for (let i = 0; i < 3; i++) ZG.Tech.buy(s, 'fire_dmg');
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').ok, false);
  assert.equal(ZG.Tech.buy(s, 'fire_dmg').reason, 'maxed');
});

test('拒绝原因：not-prep / money / unknown', () => {
  const s = fresh(1000);
  s.status = 'battle';
  assert.deepEqual(ZG.Tech.buy(s, 'fire_dmg'), { ok: false, reason: 'not-prep' });
  s.status = 'prep'; s.money = 10;
  assert.deepEqual(ZG.Tech.buy(s, 'fire_dmg'), { ok: false, reason: 'money' });
  assert.deepEqual(ZG.Tech.buy(s, 'nope'), { ok: false, reason: 'unknown' });
});

test('效果缓存：fire_dmg 2 级 → dmgMul 1.08', () => {
  const s = fresh(99999);
  ZG.Tech.buy(s, 'fire_dmg');
  ZG.Tech.buy(s, 'fire_dmg');
  assert.equal(ZG.Tech.mods(s).dmgMul.toFixed(4), '1.0800');
  assert.equal(ZG.Tech.has(s, 'cap_dmg'), false);
});

test('快照只含非零节点并按 id 排序，购买命令可回放', () => {
  const run = () => {
    const s = fresh(5000);
    ZG.Sim.applyCommand(s, { op: 'buyTechNode', nodeId: 'fire_rate' });
    ZG.Sim.applyCommand(s, { op: 'buyTechNode', nodeId: 'fire_dmg' });
    ZG.State.spawnHuman(s, 'pistol', 600, 600);
    ZG.Sim.applyCommand(s, { op: 'startRound' });
    ZG.Sim.tick(s, 120);
    return ZG.State.hash(s);
  };
  const a = run(), b = run();
  assert.equal(a, b);
  const s = fresh(5000);
  ZG.Tech.buy(s, 'fire_rate');
  assert.deepEqual(ZG.State.snapshot(s).tech, [['fire_rate', 1]]);
});

test('科技购买失败不写命令', () => {
  const s = fresh(10);
  ZG.Sim.applyCommand(s, { op: 'buyTechNode', nodeId: 'fire_dmg' });
  assert.equal(s.commands.length, 0);
});

test('火力和攻速立即生效', () => {
  const s = fresh(99999);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Tech.buy(s, 'fire_dmg');
  assert.equal(ZG.Stats.human(s, h).damage.toFixed(4), (12 * 1.04).toFixed(4));
  ZG.Tech.buy(s, 'fire_rate');
  assert.equal(ZG.Stats.human(s, h).interval.toFixed(4), (0.5 / 1.04).toFixed(4));
});

test('生命节点按比值补足现有单位，死亡单位不动', () => {
  const s = fresh(99999);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const dead = ZG.State.spawnHuman(s, 'pistol', 640, 600);
  dead.alive = false; dead.hp = 0; dead.maxHp = 140;
  h.hp = 70;
  ZG.Tech.buy(s, 'hp_all');
  assert.equal(h.maxHp.toFixed(4), (140 * 1.06).toFixed(4));
  assert.equal(h.hp.toFixed(4), (70 * 1.06).toFixed(4));
  assert.equal(dead.maxHp, 140);
});

test('英雄生命节点只作用于英雄，护盾节点按比值补盾', () => {
  const s = fresh(99999);
  const hero = ZG.State.spawnHuman(s, 'officer', 600, 600, { heroId: 'officer' });
  const pistol = ZG.State.spawnHuman(s, 'pistol', 640, 600);
  ZG.Tech.buy(s, 'hero_hp');
  assert.equal(hero.maxHp.toFixed(4), (1200 * 1.06).toFixed(4));
  assert.equal(pistol.maxHp, 140);
  const sh = ZG.State.spawnHuman(s, 'shield', 680, 600);
  for (const id of ['fire_dmg', 'pistol_passive', 'mg_passive', 'shield_passive']) {
    ZG.Tech.buy(s, id);
  }
  assert.equal(sh.maxShield.toFixed(4), (400 * 1.4).toFixed(4));
});

test('建筑生命/数量节点即时生效', () => {
  const s = fresh(99999);
  const b = ZG.State.spawnBuilding(s, 'barricade', 600, 400);
  ZG.Tech.buy(s, 'build_hp');
  assert.equal(b.maxHp.toFixed(4), (800 * 1.25).toFixed(4));
  ZG.Tech.buy(s, 'build_cap');
  assert.equal(ZG.Tech.buildingLimit(s, 'barricade'), 11);
});

test('存款加伤按当前金钱现算，只作用于人类', () => {
  const s = fresh(99999);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Tech.buy(s, 'econ_gold');
  ZG.Tech.buy(s, 'bank_power');
  s.money = 2500;
  assert.equal(ZG.Stats.human(s, h).damage.toFixed(4), (12 * 1.1).toFixed(4));
  s.money = 0;
  assert.equal(ZG.Stats.human(s, h).damage.toFixed(4), '12.0000');
});

test('减伤与抗感染', () => {
  const s = fresh(99999);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  for (const id of ['hp_all', 'regen', 'revive', 'death_boom', 'dmg_res']) {
    ZG.Tech.buy(s, id);
  }
  ZG.Combat.applyDamage(s, { target: h, amount: 100, damageKind: 'melee' });
  assert.equal(h.hp.toFixed(4), (140 * 1.06 - 97).toFixed(4));
  ZG.Tech.buy(s, 'infect_res');
  ZG.Infection.add(s, h, 100);
  assert.equal(h.infection.toFixed(4), '80.0000');
});

test('绝境在存活 ≤3 时生效，每 15 步更新', () => {
  const s = fresh(99999);
  const a = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.State.spawnHuman(s, 'pistol', 620, 600);
  ZG.State.spawnHuman(s, 'pistol', 640, 600);
  for (const id of ['hp_all', 'regen', 'revive', 'death_boom', 'dmg_res', 'last_stand']) {
    ZG.Tech.buy(s, id);
  }
  ZG.Tech.updateDynamic(s);
  assert.equal(ZG.Tech.mods(s).lastStandActive, true);
  assert.equal(ZG.Stats.human(s, a).damage.toFixed(4), (12 * 1.25).toFixed(4));
});
