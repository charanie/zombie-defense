/* 全部数值公式（与计划书附录 B 一致） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const TECH_MAX = 10;

  function pow(base, n) { return Math.pow(base, n); }

  function zombieHp(base, R) {
    return base * pow(1.06, R - 1);
  }
  function zombieDamage(base, R) {
    return base * Math.min(1.5, pow(1.01, R - 1));
  }
  function zombieSpeed(base, R) {
    return base * Math.min(1.25, 1 + 0.005 * (R - 1));
  }
  function bounty(base, R, econLevel) {
    const lvl = econLevel || 0;
    return Math.floor(base * (1 + 0.03 * (R - 1)) * (1 + 0.04 * lvl));
  }
  function roundReward(R, econLevel) {
    const lvl = econLevel || 0;
    return Math.floor((60 + 12 * R) * (1 + 0.08 * lvl));
  }
  function bossHp(R, hpMul) {
    return 1200 * pow(1.14, R - 1) * (hpMul === undefined ? 1 : hpMul);
  }
  function bossSkillDamage(base, growth, R) {
    return base + growth * R;
  }
  function bossRockDamage(R) {
    return bossSkillDamage(80, 6, R);
  }
  // 图鉴/悬浮提示用：该 BOSS 当回合最具威胁的单次伤害
  function bossPrimaryDamage(typeId, R) {
    const data = ZG.Data.zombies[typeId];
    const bd = data && data.boss;
    if (!bd) return 0;
    if (bd.kind === 'tank' && bd.rock) {
      return bossSkillDamage(bd.rock.damageBase, bd.rock.damageGrowth, R);
    }
    if (bd.kind === 'ripper') {
      const melee = bd.melee
        ? bossSkillDamage(bd.melee.damageBase, bd.melee.damageGrowth, R) : 0;
      const dash = bd.dash
        ? bossSkillDamage(bd.dash.damageBase, bd.dash.damageGrowth, R) : 0;
      return Math.max(melee, dash);
    }
    if (bd.kind === 'spitter') {
      const boom = (bd.bullets || []).find(k => k.id === 'explosive');
      return boom ? bossSkillDamage(boom.damageBase, boom.damageGrowth, R) : 0;
    }
    return 0;
  }
  function bossReward(R) {
    return 400 + 50 * R;
  }
  function populationCap(R) {
    return Math.min(80, 8 + 2 * R);
  }
  function techCost(line, level) {
    if (line === 'fire' || line === 'armor') return Math.floor(120 * pow(1.45, level));
    return Math.floor(100 * pow(1.40, level));
  }
  function techMul(line, level) {
    const lvl = Math.max(0, Math.min(TECH_MAX, level || 0));
    if (line === 'fire') return 1 + 0.05 * lvl;
    if (line === 'armor') return 1 + 0.06 * lvl;
    if (line === 'econ') return 1 + 0.04 * lvl;
    if (line === 'serum') return 1 + 0.05 * lvl;
    return 1;
  }
  function econRewardMul(level) {
    return 1 + 0.08 * Math.max(0, Math.min(TECH_MAX, level || 0));
  }
  function serumCount(level) {
    return 3 + Math.max(0, Math.min(TECH_MAX, level || 0));
  }
  function zombieCount(R) {
    return 6 + 5 * R;
  }
  function mineDamage(R) {
    return 120 * pow(1.06, R - 1);
  }
  function slotSlowMax(list) {
    let m = 0;
    for (let i = 0; i < list.length; i++) if (list[i] > m) m = list[i];
    return m;
  }

  ZG.Balance = {
    TECH_MAX, zombieHp, zombieDamage, zombieSpeed, bounty, roundReward,
    bossHp, bossRockDamage, bossSkillDamage, bossPrimaryDamage, bossReward,
    populationCap, techCost, techMul,
    econRewardMul, serumCount, zombieCount, mineDamage, slotSlowMax
  };
})();
