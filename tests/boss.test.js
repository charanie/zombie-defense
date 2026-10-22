const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

/* ---------------- 数据层 ---------------- */

test('BOSS 池包含四只且都标记 isBoss', () => {
  assert.deepEqual(ZG.Data.bossOrder, ['boss', 'boss_ripper', 'boss_spitter', 'boss_brood']);
  for (const id of ZG.Data.bossOrder) {
    const d = ZG.Data.zombies[id];
    assert.equal(d.isBoss, true, id);
    assert.ok(d.boss && d.boss.kind, id);
  }
  assert.deepEqual(
    ZG.Data.bossOrder.map(id => ZG.Data.zombies[id].boss.hpMul),
    [1, 0.45, 0.36, 0.6]
  );
});

test('三只新 BOSS 不进入普通波次与普通僵尸列表', () => {
  for (const id of ['boss_ripper', 'boss_spitter', 'boss_brood']) {
    assert.ok(!ZG.Data.zombieOrder.includes(id), id);
    assert.ok(!(id in ZG.Waves.composition(30)), id);
  }
});

test('BOSS 血量公式支持 hpMul 且默认不变', () => {
  assert.equal(ZG.Balance.bossHp(7).toFixed(2), '2775.67');
  assert.equal(ZG.Balance.bossHp(7, 0.45).toFixed(2), (2775.67 * 0.45).toFixed(2));
  assert.equal(ZG.Balance.bossHp(7, 1), ZG.Balance.bossHp(7));
});

test('BOSS 技能伤害公式与主伤害', () => {
  assert.equal(ZG.Balance.bossSkillDamage(80, 6, 7), 122);
  assert.equal(ZG.Balance.bossSkillDamage(85, 7, 14), 183);
  assert.equal(ZG.Balance.bossRockDamage(7), 122);
  assert.equal(ZG.Balance.bossPrimaryDamage('boss', 7), 122);
  assert.equal(ZG.Balance.bossPrimaryDamage('boss_ripper', 7), 134);
  assert.equal(ZG.Balance.bossPrimaryDamage('boss_spitter', 7), 73);
  assert.equal(ZG.Balance.bossPrimaryDamage('boss_brood', 7), 0);
});

test('坦克投石参数迁移到数据层', () => {
  const b = ZG.Data.zombies.boss.boss;
  assert.equal(b.kind, 'tank');
  assert.equal(b.rock.interval, 7);
  assert.equal(b.rock.firstDelay, 2.5);
  assert.equal(b.rock.radius, 70);
  assert.equal(b.rock.warn, 2.0);
  assert.equal(b.stomp.radius, 60);
  assert.equal(b.stomp.damage, 80);
});

/* ---------------- 生成层 ---------------- */

test('BOSS 回合从池中选一只且批次恰好 1 只', () => {
  const rng = ZG.Rng.createStreams(9).spawn;
  const w = ZG.Waves.build(7, rng);
  assert.ok(ZG.Data.bossOrder.includes(w.bossType), String(w.bossType));
  const bosses = w.batches.flatMap(b => b.spawns).filter(s => ZG.Data.bossOrder.includes(s.type));
  assert.equal(bosses.length, 1);
  assert.equal(bosses[0].type, w.bossType);
});

test('BOSS 池不与上一只重复', () => {
  const rng = ZG.Rng.createStreams(3).spawn;
  assert.notEqual(ZG.Waves.pickBossType('boss', rng), 'boss');
  for (const last of ZG.Data.bossOrder) {
    for (let i = 0; i < 20; i++) {
      assert.notEqual(ZG.Waves.pickBossType(last, rng), last);
    }
  }
});

test('连续 20 个 BOSS 回合不连续重复且四只都出现', () => {
  const rng = ZG.Rng.createStreams(17).spawn;
  const seen = new Set();
  let last = null;
  for (let i = 0; i < 20; i++) {
    const t = ZG.Waves.pickBossType(last, rng);
    assert.ok(ZG.Data.bossOrder.includes(t));
    if (last !== null) assert.notEqual(t, last);
    seen.add(t);
    last = t;
  }
  assert.deepEqual([...seen].sort(), [...ZG.Data.bossOrder].sort());
});

test('preview 不预选 BOSS 种类也不消耗 RNG', () => {
  const rng = ZG.Rng.createStreams(5).spawn;
  const before = rng.next();
  const p = ZG.Waves.preview(7);
  assert.equal(p.boss, true);
  assert.equal(p.bossType, undefined);
  const rng2 = ZG.Rng.createStreams(5).spawn;
  assert.equal(rng2.next(), before);
});

test('spawner 使用独立 boss 流并记住 lastBossType', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  assert.equal(s.battle.lastBossType, null);
  assert.ok(s.rng.boss, '独立 boss 随机流');
  ZG.State.spawnHuman(s, 'shield', 640, 600);
  s.round = 7;
  ZG.Sim.startRound(s);
  assert.ok(ZG.Data.bossOrder.includes(s.spawner.bossType));
  assert.equal(s.battle.lastBossType, s.spawner.bossType);
});

test('四只 BOSS 的实例化血量与字段', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  s.round = 7;
  for (const id of ZG.Data.bossOrder) {
    const z = ZG.State.spawnZombie(s, id, 600, 300);
    const mul = ZG.Data.zombies[id].boss.hpMul;
    assert.equal(z.maxHp.toFixed(2), ZG.Balance.bossHp(7, mul).toFixed(2), id);
    assert.equal(z.isBoss, true, id);
  }
  const ripper = ZG.State.spawnZombie(s, 'boss_ripper', 600, 300);
  assert.equal(ripper.damage, ZG.Balance.bossSkillDamage(60, 6, 7));
  assert.equal(ripper.damageBase, ZG.Balance.bossSkillDamage(60, 6, 7));
  const spitter = ZG.State.spawnZombie(s, 'boss_spitter', 600, 300);
  assert.equal(spitter.damage, 0);
  assert.equal(spitter.spitCd, 1.0);
  const brood = ZG.State.spawnZombie(s, 'boss_brood', 600, 300);
  assert.equal(brood.summonCd, 2);
});

/* ---------------- 模拟层 ---------------- */

function setup(round) {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  if (round) s.round = round;
  return s;
}

function tickAI(s, n) {
  for (let i = 0; i < n; i++) ZG.AI.stepZombies(s);
}

function babies(s) {
  return s.zombies.filter(z => z.alive && z.typeId === 'baby').length;
}

test('坦克：首次 2.5 秒、之后每 7 秒投石', () => {
  const s = setup(7);
  ZG.State.spawnHuman(s, 'shield', 640, 600);
  const z = ZG.State.spawnZombie(s, 'boss', 600, 200);
  assert.equal(z.rockCd, 2.5);
  tickAI(s, 144);
  assert.equal(s.projectiles.filter(p => p.typeId === 'rock').length, 0, '2.4s 时不应投石');
  tickAI(s, 6);
  assert.equal(s.projectiles.filter(p => p.typeId === 'rock').length, 1, '2.5s 应投石');
  s.projectiles.length = 0;
  tickAI(s, 414);
  assert.equal(s.projectiles.filter(p => p.typeId === 'rock').length, 0, '6.9s 后不应投第二发');
  tickAI(s, 6);
  assert.equal(s.projectiles.filter(p => p.typeId === 'rock').length, 1, '7.0s 应投第二发');
});

test('裂爪：优先攻击 260 内最近非盾人类', () => {
  const s = setup(7);
  const shield = ZG.State.spawnHuman(s, 'shield', 620, 340);
  const pistol = ZG.State.spawnHuman(s, 'pistol', 650, 300);
  const z = ZG.State.spawnZombie(s, 'boss_ripper', 600, 300);
  const tgt = ZG.AI.pickZombieTarget(s, z);
  assert.equal(tgt.kind, 'human');
  assert.equal(tgt.target.id, pistol.id);
  assert.notEqual(tgt.target.id, shield.id);
});

test('裂爪：前摇不动 → 冲刺 → 硬直，路径目标只吃一次冲刺伤害', () => {
  const s = setup(7);
  const h = ZG.State.spawnHuman(s, 'shield', 700, 140);
  // 冷却期间裂爪会正常追击；避开 (420,300) 的汽车障碍，起点留够冲刺带距离
  const z = ZG.State.spawnZombie(s, 'boss_ripper', 390, 140);
  assert.equal(z.dashCd, 2);
  tickAI(s, 119);
  assert.equal(z.dashWindupT, 0);
  tickAI(s, 1);
  assert.ok(z.dashWindupT > 0, '冷却结束进入前摇');
  const x0 = z.x, y0 = z.y;
  tickAI(s, 10);
  assert.ok(z.dashWindupT > 0);
  assert.equal(z.x, x0);
  assert.equal(z.y, y0);
  tickAI(s, 20);
  assert.ok(z.dashT > 0 || z.staggerT > 0, '前摇结束进入冲刺');
  const dashDamage = ZG.Balance.bossSkillDamage(85, 7, 7);
  tickAI(s, 30);
  assert.ok(z.staggerT > 0, '冲刺结束应硬直');
  assert.equal(h.hp, h.maxHp - dashDamage, '路径目标只吃一次冲刺伤害');
  const sx = z.x;
  tickAI(s, 12);
  assert.equal(z.x, sx, '硬直期间不移动');
});

test('腐吐者：弹种按 50/35/15 累加抽取', () => {
  const kinds = ZG.Data.zombies.boss_spitter.boss.bullets;
  assert.equal(ZG.AI.pickSpitKind(kinds, 0).id, 'normal');
  assert.equal(ZG.AI.pickSpitKind(kinds, 0.49).id, 'normal');
  assert.equal(ZG.AI.pickSpitKind(kinds, 0.5).id, 'poison');
  assert.equal(ZG.AI.pickSpitKind(kinds, 0.84).id, 'poison');
  assert.equal(ZG.AI.pickSpitKind(kinds, 0.85).id, 'explosive');
  assert.equal(ZG.AI.pickSpitKind(kinds, 0.999).id, 'explosive');

  const rng = ZG.Rng.createStreams(99).jitter;
  const counts = { normal: 0, poison: 0, explosive: 0 };
  const n = 10000;
  for (let i = 0; i < n; i++) counts[ZG.AI.pickSpitKind(kinds, rng.next()).id]++;
  assert.ok(Math.abs(counts.normal / n - 0.50) < 0.015, String(counts.normal / n));
  assert.ok(Math.abs(counts.poison / n - 0.35) < 0.015, String(counts.poison / n));
  assert.ok(Math.abs(counts.explosive / n - 0.15) < 0.015, String(counts.explosive / n));
});

test('腐吐者：距离带意图', () => {
  const spit = ZG.Data.zombies.boss_spitter.boss;
  assert.equal(ZG.AI.spitterIntent(260, spit), 'approach');
  assert.equal(ZG.AI.spitterIntent(200, spit), 'hold');
  assert.equal(ZG.AI.spitterIntent(100, spit), 'retreat');
});

test('普通弹：只对目标结算低伤，不挂毒', () => {
  const s = setup(7);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Projectiles.spawn(s, {
    typeId: 'spit', spitKind: 'normal', x: h.x, y: h.y, tx: h.x, ty: h.y,
    targetId: h.id, speed: 420, radius: 5, splash: 16, damage: 28,
    damageKind: 'ranged', hitsHumans: true
  });
  ZG.Projectiles.step(s);
  assert.equal(h.hp, h.maxHp - 28);
  assert.equal(h.poisonT, 0);
});

test('爆炸弹：直击 73，半径内其他人 25% 溅射', () => {
  const s = setup(7);
  const h1 = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const h2 = ZG.State.spawnHuman(s, 'pistol', 620, 600);
  ZG.Projectiles.spawn(s, {
    typeId: 'spit', spitKind: 'explosive', x: h1.x, y: h1.y, tx: h1.x, ty: h1.y,
    targetId: h1.id, speed: 360, radius: 7, splash: 60, damage: 73,
    splashMul: 0.25, damageKind: 'explosion', hitsHumans: true
  });
  ZG.Projectiles.step(s);
  assert.equal(h1.hp, h1.maxHp - 73);
  assert.equal(h2.hp, h2.maxHp - 73 * 0.25);
});

test('毒液弹：毒云挂 DOT、不吃盾、不发爆炸事件', () => {
  const s = setup(7);
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  const shield0 = h.shield;
  let clouds = 0, booms = 0;
  s.bus.on('fx:poison', () => { clouds++; });
  s.bus.on('fx:explosion', () => { booms++; });
  ZG.Projectiles.spawn(s, {
    typeId: 'spit', spitKind: 'poison', x: h.x, y: h.y, tx: h.x, ty: h.y,
    targetId: h.id, speed: 380, radius: 6, splash: 65, damage: 13,
    damageKind: 'poison', hitsHumans: true,
    poison: { dps: 15.3, duration: 3.5 }
  });
  ZG.Projectiles.step(s);
  assert.equal(h.shield, shield0, '毒伤不被盾吸收');
  assert.equal(h.hp, h.maxHp - 13);
  assert.equal(h.poisonT, 3.5);
  assert.equal(h.poisonDps, 15.3);
  assert.equal(clouds, 1);
  assert.equal(booms, 0);
  for (let i = 0; i < 210; i++) ZG.Infection.tick(s);
  const expected = 13 + 15.3 * 3.5;
  assert.ok(Math.abs((h.maxHp - h.hp) - expected) < 0.6, String(h.maxHp - h.hp));
  assert.equal(h.poisonT, 0);
  assert.equal(h.poisonDps, 0);
});

test('毒 DOT 不叠层：刷新持续时间与较高 DPS', () => {
  const s = setup(7);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Infection.poison(s, h, 15, 3.5);
  ZG.Infection.poison(s, h, 10, 2);
  assert.equal(h.poisonDps, 15);
  assert.equal(h.poisonT, 3.5);
  ZG.Infection.poison(s, h, 20, 1);
  assert.equal(h.poisonDps, 20);
  assert.equal(h.poisonT, 3.5);
});

test('毒伤致死走 killHuman 并转化为丧尸', () => {
  const s = setup(7);
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600, { hp: 2 });
  h.poisonT = 1;
  h.poisonDps = 120;
  for (let i = 0; i < 3 && h.alive; i++) ZG.Infection.tick(s);
  assert.equal(h.alive, false);
  assert.equal(s.humans.length, 0);
  assert.equal(s.zombies.filter(z => z.turnedFromHuman).length, 1);
});

test('母巢：每 5 秒孵 2 只，自身上限 8 只', () => {
  const s = setup(7);
  ZG.State.spawnHuman(s, 'shield', 1100, 600);
  ZG.State.spawnZombie(s, 'boss_brood', 400, 300);
  tickAI(s, 180);
  assert.equal(babies(s), 2, '3 秒时已孵化 2 只');
  tickAI(s, 1800);
  assert.ok(babies(s) <= 8, '自身上限 8，实际 ' + babies(s));
  assert.ok(babies(s) >= 7, '持续孵化，实际 ' + babies(s));
});

test('母巢孵化不超过同屏僵尸上限', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1, quality: 'mobile' });
  ZG.State.spawnHuman(s, 'shield', 1200, 700);
  ZG.State.spawnZombie(s, 'boss_brood', 400, 300);
  while (s.zombies.length < ZG.Const.ZOMBIE_CAP_MOBILE) {
    ZG.State.spawnZombie(s, 'walker', 1000 + (s.zombies.length % 10), 100);
  }
  tickAI(s, 180);
  assert.ok(s.zombies.length <= ZG.Const.ZOMBIE_CAP_MOBILE,
    '实际 ' + s.zombies.length);
});

test('母巢光环：半径内 +15% 移速 / +20% 伤害，离开恢复', () => {
  const s = setup(7);
  ZG.State.spawnHuman(s, 'shield', 1100, 600);
  ZG.State.spawnZombie(s, 'boss_brood', 400, 300);
  const w = ZG.State.spawnZombie(s, 'walker', 450, 300);
  ZG.AI.stepZombies(s);
  assert.equal(w.buffSpeed, 1.15);
  assert.equal(w.buffDamage, 1.2);
  w.x = 800; w.y = 620;
  ZG.AI.stepZombies(s);
  assert.equal(w.buffSpeed, 1);
  assert.equal(w.buffDamage, 1);
});

test('母巢死亡：爆 3 只幼体 + 计数/英雄/赏金', () => {
  const s = setup(7);
  ZG.State.spawnHuman(s, 'pistol', 900, 600);
  const z = ZG.State.spawnZombie(s, 'boss_brood', 400, 300);
  const before = s.money;
  ZG.Combat.applyDamage(s, { target: z, amount: 999999, damageKind: 'ranged' });
  assert.equal(babies(s), 3);
  assert.equal(s.stats.bossKills, 1);
  assert.equal(s.battle.bossId, null);
  assert.equal(s.money - before, 750);
  assert.equal(s.stats.heroes, 1);
});

test('四只 BOSS 死亡都触发 bossKills / bossId 清空 / 赏金 / 英雄', () => {
  for (const id of ZG.Data.bossOrder) {
    const s = setup(7);
    ZG.State.spawnHuman(s, 'pistol', 900, 600);
    const z = ZG.State.spawnZombie(s, id, 400, 300);
    const before = s.money;
    ZG.Combat.applyDamage(s, { target: z, amount: 999999, damageKind: 'ranged' });
    assert.equal(s.stats.bossKills, 1, id);
    assert.equal(s.battle.bossId, null, id);
    assert.equal(s.money - before, 750, id);
    assert.equal(s.stats.heroes, 1, id);
  }
});
