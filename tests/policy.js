/* 无头 bot 的固定策略：布阵、招募、建造、科技 */
'use strict';

function candidates(state) {
  const pts = [];
  for (let y = 60; y <= ZG.Const.H - 60; y += 40) {
    for (let x = 60; x <= ZG.Const.W - 60; x += 40) {
      const r = ZG.Economy.canPlace(state, x, y, 10);
      if (r.ok) pts.push({ x, y });
    }
  }
  return pts;
}

const FRONT_RING = [
  { x: 640, y: 430 },
  { x: 640, y: 600 },
  { x: 480, y: 500 },
  { x: 800, y: 500 },
  { x: 560, y: 430 },
  { x: 720, y: 600 }
];

function roleScore(state, p, role) {
  // 僵尸四面来袭：盾兵分散成多个小队，远程/治疗居中
  if (role === 'front') {
    const n = counts(state).shield;
    const t = FRONT_RING[n % FRONT_RING.length];
    return Math.hypot(p.x - t.x, p.y - t.y);
  }
  const target = { x: 640, y: 500 };
  return Math.hypot(p.x - target.x, p.y - target.y);
}

function place(state, classId, role) {
  const pts = candidates(state);
  pts.sort((a, b) => roleScore(state, a, role) - roleScore(state, b, role));
  for (const p of pts) {
    const r = ZG.Economy.recruit(state, classId, p.x, p.y);
    if (r.ok) return r.human;
  }
  return null;
}

function counts(state) {
  const c = { shield: 0, medic: 0, civilian: 0, mg: 0, rocket: 0, flame: 0, pistol: 0, shotgun: 0 };
  for (const h of state.humans) {
    if (!h.alive || h.hero) continue;
    if (c[h.classId] !== undefined) c[h.classId]++;
  }
  return c;
}

function hasBuilding(state, typeId) {
  return state.buildings.some(b => b.alive && b.typeId === typeId);
}

function tryBuild(state, typeId, x, y, opts, reserve) {
  const data = ZG.Data.buildings[typeId];
  if (state.money < data.cost + (reserve || 120)) return false;
  let r = ZG.Economy.build(state, typeId, x, y, opts);
  if (r.ok) return true;
  if (r.reason === 'limit' || r.reason === 'money' || r.reason === 'unknown') return false;
  for (const p of candidates(state)) {
    r = ZG.Economy.build(state, typeId, p.x, p.y, opts);
    if (r.ok) return true;
    if (r.reason === 'limit' || r.reason === 'money') return false;
  }
  return false;
}

function prep(state, opts) {
  const o = opts || {};
  const R = state.round;
  const c = counts(state);

  // 建筑顺序
  if (!hasBuilding(state, 'barricade') && (state.mapId === 'suburban' || R >= 4)) {
    tryBuild(state, 'barricade', 640, 430, { vertical: false }, 260);
  }
  if (R >= 2 && !hasBuilding(state, 'hospital')) tryBuild(state, 'hospital', 760, 560, null, 160);
  if (R >= 2 && !hasBuilding(state, 'turret')) tryBuild(state, 'turret', 520, 560, null, 160);
  if (R >= 4 && !hasBuilding(state, 'ammo')) tryBuild(state, 'ammo', 640, 600, null, 160);
  if (R >= 3 && !hasBuilding(state, 'tarpit')) tryBuild(state, 'tarpit', 640, 420, null, 100);
  if (!hasBuilding(state, 'barricade')) {
    tryBuild(state, 'barricade', 580, 430, { vertical: false }, 140);
  }
  if (R >= 6 && !hasBuilding(state, 'mine')) {
    tryBuild(state, 'mine', 700, 420, null, 120);
  }

  // 科技
  const techPlan = ['econ', 'fire', 'econ', 'armor', 'fire', 'armor', 'econ', 'fire', 'serum', 'armor'];
  for (let buy = 0; R >= 4 && buy < 2; buy++) {
    let bought = false;
    for (const line of techPlan) {
      const lvl = state.tech[line];
      if (lvl >= 10) continue;
      const cost = ZG.Balance.techCost(line, lvl);
      if (state.money >= cost + 420) {
        ZG.Economy.buyTech(state, line);
        bought = true;
        break;
      }
    }
    if (!bought) break;
  }

  // 兵种目标（尽量吃满人口上限）
  const shieldBase = R <= 2 ? 1 : (state.mapId === 'hospital' ? 3 : (state.mapId === 'subway' ? 2 : 1));
  const wantShield = Math.min(6, shieldBase + Math.floor(R / 4));
  const wantMedic = R <= 2 ? 1 : Math.min(4, (state.mapId === 'hospital' ? 2 : 1) + Math.floor(R / 8));
  const wantCiv = Math.min(8, R <= 3 ? 2 : (R <= 6 ? 5 : 8));
  const wantRocket = Math.min(4, Math.floor(R / 4));
  const wantFlame = R >= 4 ? Math.min(4, 1 + Math.floor((R - 4) / 3)) : 0;
  const wantMg = Math.min(18, R <= 2 ? 0 : 2 + Math.floor(R / 2));

  let guard = 0;
  while (guard++ < 60) {
    const cc = counts(state);
    const combat = cc.shield + cc.medic + cc.mg + cc.rocket + cc.flame + cc.pistol + cc.shotgun;
    let next = null, role = 'back';
    if (cc.shield < wantShield) { next = 'shield'; role = 'front'; }
    else if (cc.medic < wantMedic) { next = 'medic'; role = 'back'; }
    else if (cc.flame < wantFlame && state.money >= ZG.Data.humans.flame.cost) {
      next = 'flame'; role = 'front';
    }
    else if (cc.pistol < (R <= 3 ? 5 : 2)) { next = 'pistol'; role = 'mid'; }
    else if (cc.mg < wantMg && state.money >= ZG.Data.humans.mg.cost) { next = 'mg'; role = 'mid'; }
    else if (cc.rocket < wantRocket && state.money >= ZG.Data.humans.rocket.cost) {
      next = 'rocket'; role = 'back';
    }
    else if (cc.civilian < wantCiv && combat >= 6 && R >= 3) { next = 'civilian'; role = 'back'; }
    else if (cc.pistol < 8) { next = 'pistol'; role = 'mid'; }
    else if (combat + cc.civilian < ZG.Balance.populationCap(R) - 2) {
      next = cc.mg <= cc.rocket * 2 ? 'mg' : 'rocket';
      role = next === 'rocket' ? 'back' : 'mid';
    }
    else break;

    const cost = ZG.Data.humans[next].cost;
    if (state.money < cost) break;
    const h = place(state, next, role);
    if (!h) {
      // 放不下就换一个便宜兵种
      if (next !== 'pistol' && state.money >= 60) {
        if (!place(state, 'pistol', 'mid')) break;
      } else break;
    }
  }
}

module.exports = { prep, counts, candidates, place };
