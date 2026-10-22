/* 科技树：等级、前置、购买与效果聚合缓存（纯模拟） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function data() { return ZG.Data.tech; }

  function ranksOf(state) {
    return (state && state.tech && state.tech.ranks) || {};
  }

  function defaultMods() {
    const t = data();
    const heroes = ZG.Data.heroes;
    const officer = heroes.officer.ability;
    const samurai = heroes.samurai.ability;
    const gatling = heroes.gatling.ability;
    const plague = heroes.plague;
    const sup = t.support;
    return {
      dmgMul: 1, atkSpeedMul: 1, hpMul: 1, shieldMul: 1,
      regenPct: 0, reviveChance: 0, boomChance: 0, boomRadius: 0,
      infectResist: 0, dmgReduction: 0, skillCdMul: 1,
      buildHpMul: 1, buildCapBonus: 0,
      econKillMul: 1, econRewardMul: 1,
      bankActive: false, bankPer500: 0, bankCap: 0,
      lastStandUnlocked: false, lastStandActive: false, undying: false,
      classPassives: {
        pistol: null, shotgun: null, mg: null, flame: null,
        rocket: null, shield: null, medic: null, civilian: null
      },
      classActives: {
        pistol: null, shotgun: null, mg: null, flame: null,
        rocket: null, shield: null, medic: null, civilian: null
      },
      hero: {
        dmgMul: 1, hpMul: 1,
        officerRange: officer.radius, officerUses: officer.count,
        officerVolleyCd: t.heroDefaults.officerVolleyCd,
        samuraiChain: 0, samuraiPower: 0, samuraiWidth: samurai.width,
        gatlingHeal: 0, gatlingDispel: 0,
        gatlingDuration: gatling.duration, gatlingAttackSpeed: gatling.attackSpeed,
        gatlingInterval: gatling.interval, plagueInterval: plague.groupHeal.interval,
        plagueCap: plague.convert.perRound, plagueChance: plague.convert.chance,
        plagueRandom: false, medicalRank: 0
      },
      support: {
        healUnlocked: false, bombUnlocked: false,
        healCost: sup.areaHeal.baseCost, bombCost: sup.missileBombardment.baseCost,
        healUses: sup.areaHeal.baseUses, bombUses: sup.missileBombardment.baseUses,
        radiusMul: 1, powerMul: 1, costMul: 1
      }
    };
  }

  function applyEffect(mods, effect, rank) {
    switch (effect.type) {
      case 'scalar': {
        const v = effect.perRank !== undefined ? effect.perRank * rank : effect.value;
        mods[effect.key] = (mods[effect.key] || 0) + v;
        break;
      }
      case 'table':
        mods[effect.key] = effect.values[rank];
        break;
      case 'flag':
        mods[effect.key] = true;
        break;
      case 'econ':
        mods.econKillMul += (effect.killPerRank || 0) * rank;
        mods.econRewardMul += (effect.rewardPerRank || 0) * rank;
        break;
      case 'bank':
        mods.bankPer500 = effect.per500;
        mods.bankCap = effect.capByRank[rank - 1];
        mods.bankActive = true;
        break;
      case 'classPassive':
        mods.classPassives[effect.classId] = effect.params;
        break;
      case 'classActive':
        mods.classActives[effect.classId] = effect.params;
        break;
      case 'hero':
        if (effect.perRank !== undefined) mods.hero[effect.key] += effect.perRank * rank;
        else mods.hero[effect.key] = effect.value;
        break;
      case 'support':
        if (effect.skill) {
          if (effect.skill === 'areaHeal') mods.support.healUnlocked = true;
          else if (effect.skill === 'missileBombardment') mods.support.bombUnlocked = true;
        } else if (effect.key === 'usesBonus') {
          mods.support.healUses += effect.value;
          mods.support.bombUses += effect.value;
        } else if (effect.key !== undefined) {
          mods.support[effect.key] += effect.value;
        }
        break;
      default:
        break;
    }
  }

  function rebuild(state) {
    const t = data();
    const ranks = ranksOf(state);
    const mods = defaultMods();
    for (const id of t.nodeOrder) {
      const rank = ranks[id] || 0;
      if (rank <= 0) continue;
      const node = t.nodes[id];
      for (const effect of node.effects) applyEffect(mods, effect, rank);
    }
    if (mods.boomChance > 0) mods.boomRadius = 80;
    if (mods.undying) {
      mods.reviveChance += 0.15;
      if (mods.boomChance > 0) mods.boomRadius *= 1.5;
    }
    return mods;
  }

  function init(state) {
    if (!state.tech) state.tech = { ranks: {} };
    state.tech.ranks = state.tech.ranks || {};
    for (const id of data().nodeOrder) state.tech.ranks[id] = 0;
    state.techMods = rebuild(state);
    return state.tech;
  }

  function mods(state) {
    if (!state.techMods) state.techMods = rebuild(state);
    return state.techMods;
  }

  function rank(state, nodeId) {
    return ranksOf(state)[nodeId] || 0;
  }

  function has(state, nodeId) {
    return rank(state, nodeId) > 0;
  }

  function nextCost(state, nodeId) {
    const node = data().nodes[nodeId];
    if (!node) return null;
    const r = rank(state, nodeId);
    if (r >= node.maxRank) return null;
    return ZG.Balance.treeNodeCost(node.tier, r);
  }

  function prevTierOwned(state, node) {
    if (node.tier <= 1) return true;
    const t = data();
    for (const id of t.nodeOrder) {
      const n = t.nodes[id];
      if (n.branch === node.branch && n.tier === node.tier - 1 && rank(state, id) > 0) return true;
    }
    return false;
  }

  function canBuy(state, nodeId) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const node = data().nodes[nodeId];
    if (!node) return { ok: false, reason: 'unknown' };
    const r = rank(state, nodeId);
    if (r >= node.maxRank) return { ok: false, reason: 'maxed' };
    if (!prevTierOwned(state, node)) return { ok: false, reason: 'locked' };
    const cost = ZG.Balance.treeNodeCost(node.tier, r);
    if (state.money < cost) return { ok: false, reason: 'money' };
    return { ok: true };
  }

  function buy(state, nodeId) {
    const check = canBuy(state, nodeId);
    if (!check.ok) return check;
    const node = data().nodes[nodeId];
    const r = rank(state, nodeId);
    const cost = ZG.Balance.treeNodeCost(node.tier, r);
    const before = mods(state);
    ZG.Economy.spend(state, cost);
    state.tech.ranks[nodeId] = r + 1;
    const newRank = r + 1;
    const after = rebuild(state);
    state.techMods = after;

    // 购买生命/护盾/建筑生命后，按购买前后的倍率补足现有目标
    const hpRatio = after.hpMul / before.hpMul;
    const heroHpRatio = after.hero.hpMul / before.hero.hpMul;
    const shieldRatio = after.shieldMul / before.shieldMul;
    const buildRatio = after.buildHpMul / before.buildHpMul;
    if (hpRatio !== 1 || heroHpRatio !== 1 || shieldRatio !== 1) {
      for (const h of state.humans) {
        if (!h.alive) continue;
        const ratio = hpRatio * (h.hero ? heroHpRatio : 1);
        if (ratio !== 1) {
          h.maxHp *= ratio;
          h.hp *= ratio;
        }
        if (shieldRatio !== 1 && h.maxShield > 0) {
          h.maxShield *= shieldRatio;
          h.shield *= shieldRatio;
        }
      }
    }
    if (buildRatio !== 1) {
      for (const b of state.buildings) {
        if (!b.alive) continue;
        b.maxHp *= buildRatio;
        b.hp *= buildRatio;
      }
    }
    const medDelta = after.hero.medicalRank - before.hero.medicalRank;
    if (medDelta > 0) {
      for (const h of state.humans) {
        if (h.alive && h.classId === 'medic') h.serumLeft += medDelta;
      }
    }

    return {
      ok: true, nodeId, rank: newRank, cost,
      nextCost: newRank >= node.maxRank ? null : ZG.Balance.treeNodeCost(node.tier, newRank)
    };
  }

  function branchProgress(state, branchId) {
    const t = data();
    let owned = 0, total = 0;
    for (const id of t.nodeOrder) {
      const n = t.nodes[id];
      if (n.branch !== branchId) continue;
      total++;
      if (rank(state, id) > 0) owned++;
    }
    return { owned, total };
  }

  function nodeView(state, nodeId) {
    const t = data();
    const node = t.nodes[nodeId];
    if (!node) return null;
    const r = rank(state, nodeId);
    const maxed = r >= node.maxRank;
    const locked = !prevTierOwned(state, node);
    const cost = maxed ? null : ZG.Balance.treeNodeCost(node.tier, r);
    let canBuyNow = false;
    let reason = null;
    if (state.status !== 'prep') reason = 'not-prep';
    else if (maxed) reason = 'maxed';
    else if (locked) reason = 'locked';
    else if (state.money < cost) reason = 'money';
    else canBuyNow = true;
    return {
      id: nodeId, name: node.name, branch: node.branch, tier: node.tier,
      kind: node.kind, rank: r, maxRank: node.maxRank,
      owned: r > 0, maxed, locked, cost,
      canBuy: canBuyNow, reason,
      summary: node.summary, detail: node.detail,
      currentText: r ? node.summary + '（当前 ' + r + ' 级）' : '未购买',
      nextText: maxed ? '已满级' : node.summary + '（下一级 ' + (r + 1) + ' 级）'
    };
  }

  function buildingLimit(state, typeId) {
    const d = ZG.Data.buildings[typeId];
    if (!d || d.limit === undefined) return Infinity;
    return d.limit + (mods(state).buildCapBonus || 0);
  }

  function supportBase(skillId) {
    return data().support[skillId] || null;
  }

  function supportCost(state, skillId) {
    const base = supportBase(skillId);
    if (!base) return 0;
    return Math.floor(base.baseCost * mods(state).support.costMul);
  }

  function supportUsesMax(state, skillId) {
    const m = mods(state).support;
    return skillId === 'areaHeal' ? m.healUses : (skillId === 'missileBombardment' ? m.bombUses : 0);
  }

  function supportRadius(state, skillId) {
    const base = supportBase(skillId);
    if (!base) return 0;
    return base.radius * mods(state).support.radiusMul;
  }

  function updateDynamic(state) {
    const m = mods(state);
    if (!m.lastStandUnlocked) { m.lastStandActive = false; return; }
    let alive = 0;
    for (const h of state.humans) if (h.alive) alive++;
    m.lastStandActive = alive > 0 && alive <= 3;
  }

  ZG.Tech = {
    init, rebuild, mods, rank, has, nextCost, canBuy, buy,
    branchProgress, nodeView, buildingLimit,
    supportCost, supportUsesMax, supportRadius,
    updateDynamic, defaultMods
  };
})();
