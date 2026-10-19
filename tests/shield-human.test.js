const { test } = require('node:test');
const assert = require('node:assert/strict');
const ZG = require('./load-sim.js')();

test('盾兵 650 HP + 400 盾', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  assert.equal(h.maxHp, 650);
  assert.equal(h.maxShield, 400);
});

test('破盾后切换手枪并后撤', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const front = ZG.State.spawnHuman(s, 'shield', 600, 500);
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  ZG.Sim.startRound(s); s.spawner.batches = [];
  h.facing = Math.PI / 2;
  ZG.Combat.applyDamage(s, {
    target: h, amount: 1000, damageKind: 'ranged',
    fromX: 600, fromY: 700
  });
  assert.equal(h.shieldBroken, true);
  assert.equal(h.attack.kind, 'ranged');
  assert.equal(h.attack.damage, 12);
  assert.equal(h.attack.range, 200);
  ZG.Sim.tick(s, 60);
  assert.ok(h.y > front.y, '应退到前排盾兵身后，实际 ' + h.y + ' vs ' + front.y);
});

test('下一回合恢复盾与近战', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const h = ZG.State.spawnHuman(s, 'shield', 600, 600);
  h.shield = 0; h.shieldBroken = true;
  h.attack = { kind: 'ranged', damage: 12, interval: 0.5, range: 200 };
  ZG.Sim.startRound(s);
  assert.equal(h.shield, h.maxShield);
  assert.equal(h.shieldBroken, false);
  assert.equal(h.attack.kind, 'melee');
  assert.equal(h.role, 'tank');
});

test('爆尸爆炸时盾后队友只受 50%', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const shield = ZG.State.spawnHuman(s, 'shield', 540, 600);
  const ally = ZG.State.spawnHuman(s, 'pistol', 575, 600);
  shield.facing = Math.PI;
  const hp0 = ally.hp;
  ZG.Projectiles.explode(s, 500, 600, 80, 70, 'explosion', {
    hitsHumans: true, kind: 'boomer', infection: 0
  });
  assert.ok(Math.abs((hp0 - ally.hp) - 35) < 1e-6, '实际 ' + (hp0 - ally.hp));
});

test('盾后减伤不适用于背后/超距/破盾/非爆尸', () => {
  const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
  const shield = ZG.State.spawnHuman(s, 'shield', 540, 600);
  const ally = ZG.State.spawnHuman(s, 'pistol', 575, 600);
  shield.facing = 0;
  assert.equal(ZG.Combat.shieldGuardMul(s, ally, 500, 600), 1);
  shield.facing = Math.PI;
  shield.shield = 0;
  assert.equal(ZG.Combat.shieldGuardMul(s, ally, 500, 600), 1);
});
