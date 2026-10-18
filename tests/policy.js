/* 无头 bot 的固定策略：布阵、招募、建造、科技 */
'use strict';

function candidates(state) {
  const d = state.map.deploy;
  const pts = [];
  if (d.kind === 'rect') {
    for (let y = d.y + 22; y <= d.y + d.h - 22; y += 34) {
      for (let x = d.x + 22; x <= d.x + d.w - 22; x += 34) pts.push({ x, y });
    }
  } else {
    for (let r = 40; r <= d.r - 16; r += 34) {
      const n = Math.max(6, Math.round((Math.PI * 2 * r) / 34));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push({ x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r });
      }
    }
  }
  return pts;
}

function roleScore(state, p, role) {
  const d = state.map.deploy;
  if (role === 'front') {
    if (state.mapId === 'subway') return p.x;
    if (state.mapId === 'hospital') return p.y;
    return p.y;
  }
  if (role === 'back') {
    if (state.mapId === 'subway') return -p.x;
    if (state.mapId === 'hospital') return Math.hypot(p.x - 640, p.y - 300);
    return -p.y;
  }
  if (state.mapId === 'hospital') return Math.hypot(p.x - 640, p.y - 310);
  return 0;
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

function tryBuild(state, typeId, slotId, reserve) {
  const data = ZG.Data.buildings[typeId];
  if (state.money < data.cost + (reserve || 120)) return false;
  const r = ZG.Economy.build(state, typeId, slotId);
  return r.ok;
}

function prep(state, opts) {
  const o = opts || {};
  const R = state.round;
  const c = counts(state);

  // 建筑顺序
  if (!hasBuilding(state, 'barricade') && (state.mapId === 'suburban' || R >= 4)) tryBuild(state, 'barricade', 's1', 260);
  if (R >= 2 && !hasBuilding(state, 'hospital')) tryBuild(state, 'hospital', 's3', 160);
  if (R >= 2 && !hasBuilding(state, 'turret')) tryBuild(state, 'turret', 's5', 160);
  if (R >= 4 && !hasBuilding(state, 'ammo')) tryBuild(state, 'ammo', 's4', 160);
  if (R >= 3 && !hasBuilding(state, 'tarpit')) tryBuild(state, 'tarpit', 's6', 100);
  if (!hasBuilding(state, 'barricade') && state.map.slots.length > 1) {
    tryBuild(state, 'barricade', 's2', 140);
  }
  if (R >= 6 && !hasBuilding(state, 'mine') && state.map.slots.length >= 6) {
    tryBuild(state, 'mine', 's2', 120);
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
  const wantRocket = Math.min(6, Math.floor(R / 3));
  const wantFlame = Math.min(4, Math.floor(R / 5));
  const wantMg = Math.min(18, R <= 2 ? 0 : 2 + Math.floor(R / 2));

  let guard = 0;
  while (guard++ < 60) {
    const cc = counts(state);
    const combat = cc.shield + cc.medic + cc.mg + cc.rocket + cc.flame + cc.pistol + cc.shotgun;
    let next = null, role = 'back';
    if (cc.shield < wantShield) { next = 'shield'; role = 'front'; }
    else if (cc.medic < wantMedic) { next = 'medic'; role = 'back'; }
    else if (cc.pistol < (R <= 3 ? 5 : 2)) { next = 'pistol'; role = 'mid'; }
    else if (cc.mg < wantMg && state.money >= 140) { next = 'mg'; role = 'mid'; }
    else if (cc.rocket < wantRocket && state.money >= 180) { next = 'rocket'; role = 'back'; }
    else if (cc.flame < wantFlame && state.money >= 130) { next = 'flame'; role = 'front'; }
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
