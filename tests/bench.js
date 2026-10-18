/* 性能基准：300 僵尸 + 99 人类 + 100 投射物 */
'use strict';
const ZG = require('./load-sim.js')();

const s = ZG.Sim.createGame({ mapId: 'suburban', seed: 1 });
s.money = 999999;

// 人类：99 名，直接生成（压测不受人口上限限制）
let placed = 0;
const types = ['pistol', 'mg', 'shotgun', 'flame', 'rocket', 'medic'];
for (let row = 0; row < 7 && placed < 99; row++) {
  for (let col = 0; col < 16 && placed < 99; col++) {
    const x = 180 + col * 58 + (row % 2) * 20;
    const y = 540 + (row % 4) * 34;
    const t = types[placed % types.length];
    const h = ZG.State.spawnHuman(s, t, x, y);
    h.hp = h.maxHp = 1e9;
    placed++;
  }
}

ZG.Sim.startRound(s);
s.spawner.batches = [];
s.spawner.batchIndex = 0;

for (let i = 0; i < 300; i++) {
  const x = 40 + (i % 30) * 40;
  const y = 60 + Math.floor(i / 30) * 34;
  const z = ZG.State.spawnZombie(s, i % 10 === 0 ? 'runner' : 'walker', x, y);
  z.hp = z.maxHp = 1e9;
  z.speed = 0;
}
// 高血量、零速度的投射物保持在场
for (let i = 0; i < 100; i++) {
  const p = ZG.Projectiles.spawn(s, {
    typeId: 'rocket', x: 400, y: 600, tx: 4000, ty: 600,
    speed: 1, damage: 10, splash: 20
  });
  p.speed = 0;
  p.life = 1e9;
}

const N = 600;
const times = [];
let maxMs = 0;
for (let i = 0; i < N; i++) {
  const t0 = process.hrtime.bigint();
  ZG.Sim.step(s);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  times.push(ms);
  if (ms > maxMs) maxMs = ms;
}
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`entities: ${s.zombies.length} zombies, ${s.humans.length} humans, ${s.projectiles.length} projectiles`);
console.log(`steps=${N}`);
console.log(`avgStepMs=${avg.toFixed(3)} maxStepMs=${maxMs.toFixed(3)}`);
