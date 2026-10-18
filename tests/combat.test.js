const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

function setup(mapId) {
  const s = ZG.Sim.createGame({ mapId: mapId || 'suburban', seed: 3 });
  return s;
}

test('普通丧尸沿流场接近并攻击人类', () => {
  const s = setup();
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 100);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 900);
  assert.ok(!z.alive || z.y > 400, '应接近部署区');
  assert.ok(h.hp < h.maxHp || h.shield < h.maxShield);
});

test('击杀僵尸给赏金并移除', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  const before = s.money;
  const r = ZG.Combat.applyDamage(s, { target: z, amount: 999, damageKind: 'ranged' });
  assert.equal(r.killed, true);
  assert.equal(z.alive, false);
  assert.equal(s.money, before + 6);
});

test('人类死亡变成 50% HP 的转化丧尸，赏金 0', () => {
  const s = setup();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.Combat.applyDamage(s, { target: h, amount: 999, damageKind: 'melee' });
  const turned = s.zombies.find(z => z.typeId === 'walker' && z.turnedFromHuman);
  assert.ok(turned);
  assert.equal(turned.bountyBase, 0);
  assert.equal(turned.maxHp.toFixed(1), (90 * 0.5).toFixed(1));
  assert.equal(h.alive, false);
});

test('没有友伤', () => {
  const s = setup();
  const a = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const b = ZG.State.spawnHuman(s, 'pistol', 620, 600);
  ZG.Combat.applyDamage(s, { target: b, amount: 999, damageKind: 'ranged', friendly: true });
  assert.equal(b.alive, true);
  assert.equal(a.alive, true);
});

test('手枪兵每秒造成 24 伤害', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 500);
  z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp;
  ZG.Sim.tick(s, 60);
  assert.ok(Math.abs((before - z.hp) - 24) < 1e-6, '实际 ' + (before - z.hp));
});

test('霰弹兵单目标 5 弹丸全中，120 外衰减一半', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'shotgun', 600, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 520);
  z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp;
  ZG.Sim.tick(s, 60);
  assert.ok(Math.abs((before - z.hp) - 50) < 1e-6, '实际 ' + (before - z.hp));

  const s2 = setup();
  ZG.State.spawnHuman(s2, 'shotgun', 600, 600);
  const z2 = ZG.State.spawnZombie(s2, 'walker', 600, 450);
  z2.speed = 0;
  ZG.Sim.startRound(s2); s2.spawner.batches = [];
  const b2 = z2.hp;
  ZG.Sim.tick(s2, 60);
  assert.ok(Math.abs((b2 - z2.hp) - 25) < 1e-6, '实际 ' + (b2 - z2.hp));
});

test('靶子超出射程不受伤', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'pistol', 600, 680);
  const z = ZG.State.spawnZombie(s, 'walker', 600, 100);
  z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp;
  ZG.Sim.tick(s, 60);
  assert.equal(z.hp, before);
});

test('盾尸：正面远程减伤 70%，近战绕过，火焰只吃一半减伤', () => {
  const s = setup();
  const z = ZG.State.spawnZombie(s, 'shield', 600, 500);
  z.facing = Math.PI / 2;
  const r = ZG.Combat.applyDamage(s, { target: z, amount: 100, damageKind: 'ranged', fromX: 600, fromY: 700 });
  assert.ok(Math.abs(r.shieldDamage - 30) < 1e-9);
  assert.equal(z.shield, 170);
  assert.equal(z.hp, z.maxHp);

  const z2 = ZG.State.spawnZombie(s, 'shield', 700, 500);
  z2.facing = Math.PI / 2;
  ZG.Combat.applyDamage(s, { target: z2, amount: 100, damageKind: 'melee', fromX: 700, fromY: 700 });
  assert.equal(z2.hp, z2.maxHp - 100);

  const z3 = ZG.State.spawnZombie(s, 'shield', 800, 500);
  z3.facing = Math.PI / 2;
  const r3 = ZG.Combat.applyDamage(s, { target: z3, amount: 100, damageKind: 'fire', fromX: 800, fromY: 700 });
  assert.equal(r3.shieldDamage, 65);
});

test('盾兵 90 内嘲讽优先', () => {
  const s = setup();
  const tank = ZG.State.spawnHuman(s, 'shield', 600, 600);
  ZG.State.spawnHuman(s, 'pistol', 660, 600);
  const z = ZG.State.spawnZombie(s, 'walker', 640, 560);
  const t = ZG.AI.pickZombieTarget(s, z);
  assert.equal(t.target.id, tank.id);
});

test('治疗兵每秒 +20 HP，感染 ≥50 优先用血清', () => {
  const s = setup();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  ZG.State.spawnHuman(s, 'medic', 620, 600);
  h.hp = 100; h.infection = 60;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.equal(h.infection, 10);
  assert.ok(h.hp > 100);
});

test('100 感染每秒掉 2% 最大生命', () => {
  const s = setup();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  h.infection = 100;
  const before = h.hp;
  ZG.Infection.tick(s);
  assert.ok(Math.abs((before - h.hp) - (h.maxHp * 0.0002 * 100 / 60)) < 1e-9);
});

test('感染死亡同样变丧尸', () => {
  const s = setup();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  h.hp = 0.01; h.infection = 100;
  ZG.Infection.tick(s);
  assert.equal(h.alive, false);
  assert.ok(s.zombies.some(z => z.turnedFromHuman));
});

test('机枪 45 发后换弹 2 秒', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'mg', 600, 600);
  const z = ZG.State.spawnZombie(s, 'giant', 600, 380);
  z.speed = 0; z.hp = z.maxHp = 99999;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 300);
  assert.equal(s.humans[0].ammo, 0);
  const before = z.hp;
  ZG.Sim.tick(s, 90);
  assert.equal(z.hp, before);
  ZG.Sim.tick(s, 40);
  assert.ok(z.hp < before);
});

test('喷火穿透并施加 3 秒灼烧', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'flame', 600, 600);
  const a = ZG.State.spawnZombie(s, 'walker', 600, 550);
  const b = ZG.State.spawnZombie(s, 'walker', 600, 520);
  a.speed = b.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp);
  const mid = a.hp;
  ZG.Sim.tick(s, 192);
  assert.ok(!a.alive || a.hp < mid);
});

test('导弹对攻城单位 +25%', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'rocket', 600, 600);
  const z = ZG.State.spawnZombie(s, 'giant', 600, 400);
  z.speed = 0; z.hp = z.maxHp = 99999;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  const before = z.hp;
  ZG.Sim.tick(s, 126);
  assert.ok(Math.abs((before - z.hp) - 162.5) < 1e-6, '实际 ' + (before - z.hp));
});

test('平民不攻击，结算 +12', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'civilian', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = []; s.zombies.length = 0;
  const before = s.money;
  ZG.Sim.tick(s, 240);
  assert.equal(s.money, before + 12 + 72);
});

test('狂尸每 4 秒冲刺 0.8 秒', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  const z = ZG.State.spawnZombie(s, 'runner', 600, 80);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, Math.round(60 * 4.1));
  assert.equal(z.sprinting, true);
  ZG.Sim.tick(s, 54);
  assert.equal(z.sprinting, false);
});

test('爆尸引信 0.8 秒，期间击杀取消爆炸', () => {
  const s = setup();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'boomer', 600, 640);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 1);
  assert.ok(z.fuseT > 0);
  ZG.Combat.applyDamage(s, { target: z, amount: 9999, damageKind: 'ranged' });
  ZG.Sim.tick(s, 60);
  assert.equal(h.hp, h.maxHp);
});

test('爆尸爆炸 +100 感染且不伤建筑', () => {
  const s = setup();
  const h = ZG.State.spawnHuman(s, 'pistol', 600, 600);
  const z = ZG.State.spawnZombie(s, 'boomer', 600, 630);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 60);
  assert.equal(h.infection, 100);
  assert.ok(h.hp < h.maxHp);
});

test('母体死亡爆 3–5 幼体', () => {
  const s = setup();
  ZG.State.spawnHuman(s, 'shield', 600, 620);
  const m = ZG.State.spawnZombie(s, 'mother', 600, 400);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Combat.applyDamage(s, { target: m, amount: 99999, damageKind: 'explosion' });
  const babies = s.zombies.filter(z => z.typeId === 'baby');
  assert.ok(babies.length >= 3 && babies.length <= 5);
});

test('巨人拆建筑伤害 ×3（数据与行为）', () => {
  assert.equal(ZG.Data.zombies.giant.buildingMultiplier, 3);
  const s = setup();
  s.money = 9999;
  ZG.State.spawnHuman(s, 'shield', 700, 600);
  const b = ZG.Economy.build(s, 'barricade', 's1').building;
  const z = ZG.State.spawnZombie(s, 'giant', b.x, b.y + 40);
  z.speed = 0;
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 130);
  assert.ok(b.hp < b.maxHp);
});

test('BOSS：石块预警、击杀奖励 400+50R', () => {
  const s = setup(); s.round = 7;
  const b = ZG.State.spawnZombie(s, 'boss', 600, 200);
  b.isBoss = true;
  assert.equal(b.maxHp.toFixed(2), ZG.Balance.bossHp(7).toFixed(2));
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  ZG.Sim.tick(s, 1);
  const rock = s.projectiles.find(p => p.typeId === 'rock');
  assert.ok(rock && rock.warnT > 0);

  const s2 = setup(); s2.round = 7;
  const b2 = ZG.State.spawnZombie(s2, 'boss', 600, 500); b2.isBoss = true;
  const before = s2.money;
  ZG.Combat.applyDamage(s2, { target: b2, amount: 999999, damageKind: 'ranged' });
  assert.equal(s2.money - before, 750);
  assert.equal(s2.stats.heroes, 1);
});
