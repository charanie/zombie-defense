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

// 有自定义出生口的地图（地铁）把盾兵前压点放到两条通道中段，交替使用
const SUBWAY_FRONT = [
  { x: 300, y: 230 },
  { x: 300, y: 490 }
];

function frontTarget(state) {
  const spots = (state.map && Array.isArray(state.map.spawns) && state.map.spawns.length)
    ? SUBWAY_FRONT : FRONT_RING;
  return spots[counts(state).shield % spots.length];
}

function roleScore(state, p, role) {
  // 僵尸四面来袭：盾兵分散成多个小队，远程/治疗居中
  if (role === 'front') {
    const t = frontTarget(state);
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

// 地铁图只有两条窄通道：建筑优先放在末端大厅，避免把唯一的入口堵死
function buildCandidates(state) {
  const pts = candidates(state);
  if (state.map && Array.isArray(state.map.spawns) && state.map.spawns.length) {
    pts.sort((a, b) => (b.x - a.x) || (a.y - b.y));
  }
  return pts;
}

function tryBuild(state, typeId, x, y, opts, reserve) {
  const data = ZG.Data.buildings[typeId];
  if (state.money < data.cost + (reserve || 120)) return false;
  let r = ZG.Economy.build(state, typeId, x, y, opts);
  if (r.ok) return true;
  if (r.reason === 'limit' || r.reason === 'money' || r.reason === 'unknown') return false;
  for (const p of buildCandidates(state)) {
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

  // 建筑顺序（围墙只用于郊区/医院：地铁窄通道里自建横墙会把入口堵死）
  if (!hasBuilding(state, 'barricade') &&
      (state.mapId === 'suburban' || (state.mapId === 'hospital' && R >= 4))) {
    tryBuild(state, 'barricade', 640, 430, { vertical: false }, 260);
  }
  if (R >= 2 && !hasBuilding(state, 'hospital')) tryBuild(state, 'hospital', 760, 560, null, 160);
  if (R >= 2 && !hasBuilding(state, 'turret')) tryBuild(state, 'turret', 520, 560, null, 160);
  if (R >= 4 && !hasBuilding(state, 'ammo')) tryBuild(state, 'ammo', 640, 600, null, 160);
  if (R >= 3 && !hasBuilding(state, 'tarpit')) tryBuild(state, 'tarpit', 640, 420, null, 100);
  if (!hasBuilding(state, 'barricade') && state.mapId !== 'subway') {
    tryBuild(state, 'barricade', 580, 430, { vertical: false }, 140);
  }
  if (R >= 6 && !hasBuilding(state, 'mine')) {
    tryBuild(state, 'mine', 700, 420, null, 120);
  }

  // 科技（平衡用策略，不是玩家最优解）
  const TECH_QUEUE = [
    'econ_gold', 'fire_dmg', 'hp_all', 'econ_gold', 'fire_rate', 'build_hp',
    'bank_power', 'fire_dmg', 'hp_all', 'pistol_passive', 'regen', 'revive',
    'mg_passive', 'dmg_res', 'support_heal', 'rocket_passive', 'last_stand',
    'support_bomb', 'cap_dmg', 'cap_speed'
  ];
  for (let buy = 0; R >= 4 && buy < 2; buy++) {
    let bought = false;
    for (const id of TECH_QUEUE) {
      const v = ZG.Tech.nodeView(state, id);
      if (v.locked || v.maxed) continue;
      if (state.money >= v.cost + 420) {
        if (ZG.Tech.buy(state, id).ok) bought = true;
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
  const wantFlame = R >= 4 ? Math.min(8, 1 + Math.floor((R - 4) / 2)) : 0;
  const wantMg = Math.min(30, R <= 2 ? 0 : 4 + R);

  // 兵力升级：后期用战斗单位替换手枪兵/平民（人口已满、钱多时）
  if (!o.rocketOnly && R >= 8 && state.money > 600) {
    let upgrades = Math.min(6, Math.floor((state.money - 600) / 220));
    for (const u of state.humans.slice()) {
      if (upgrades <= 0) break;
      if (!u.alive || u.hero || u.classId !== 'pistol') continue;
      if (state.humans.filter(v => v.alive).length <= 1) break;
      if (ZG.Economy.sell(state, u.id).ok) upgrades--;
    }
  }
  if (!o.rocketOnly && R >= 12 && state.money > 800) {
    let civUp = 4;
    for (const u of state.humans.slice()) {
      if (civUp <= 0) break;
      if (!u.alive || u.classId !== 'civilian') continue;
      if (state.humans.filter(v => v.alive).length <= 1) break;
      if (ZG.Economy.sell(state, u.id).ok) civUp--;
    }
  }

  let guard = 0;
  while (guard++ < 60) {
    const cc = counts(state);
    const combat = cc.shield + cc.medic + cc.mg + cc.rocket + cc.flame + cc.pistol + cc.shotgun;
    let next = null, role = 'back';
    if (o.rocketOnly) {
      next = 'rocket'; role = 'back';
    } else if (cc.shield < wantShield) { next = 'shield'; role = 'front'; }
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
    else if (cc.pistol < (R <= 5 ? 8 : 4)) { next = 'pistol'; role = 'mid'; }
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
