/* 全部数值公式（与计划书附录 B 一致） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function pow(base, n) { return Math.pow(base, n); }

  function zombieHp(base, R) {
    return base * pow(1.062, R - 1);
  }
  function zombieDamage(base, R) {
    return base * Math.min(1.5, pow(1.01, R - 1));
  }
  function zombieSpeed(base, R) {
    return base * Math.min(1.25, 1 + 0.005 * (R - 1));
  }
  function bounty(base, R, econMul) {
    const mul = econMul === undefined ? 1 : econMul;
    return Math.floor(base * (1 + 0.03 * (R - 1)) * mul);
  }
  function roundReward(R, econMul) {
    const mul = econMul === undefined ? 1 : econMul;
    return Math.floor((60 + 12 * R) * mul);
  }
  function bossHp(R) {
    return 1200 * pow(1.143, R - 1);
  }
  function bossRockDamage(R) {
    return 80 + 6 * R;
  }
  function bossReward(R) {
    return 400 + 50 * R;
  }
  function populationCap(R) {
    return Math.min(80, 8 + 2 * R);
  }
  function zombieCount(R) {
    return 6 + 5 * R;
  }
  function mineDamage(R) {
    return 120 * pow(1.06, R - 1);
  }
  function treeNodeCost(tier, rank) {
    const base = ZG.Data.tech.tierCost[tier - 1];
    return Math.round(base * pow(ZG.Data.tech.costGrowth, rank));
  }
  function bankDamageMul(money, cap, per500) {
    if (!cap) return 0;
    return Math.min(cap, Math.floor(money / 500) * per500);
  }
  function supportDamage(R) { return 300 + 12 * R; }
  function deathBoomDamage(R) { return 80 + 8 * R; }
  function slotSlowMax(list) {
    let m = 0;
    for (let i = 0; i < list.length; i++) if (list[i] > m) m = list[i];
    return m;
  }

  ZG.Balance = {
    zombieHp, zombieDamage, zombieSpeed, bounty, roundReward,
    bossHp, bossRockDamage, bossReward, populationCap,
    zombieCount, mineDamage, slotSlowMax,
    treeNodeCost, bankDamageMul, supportDamage, deathBoomDamage
  };
})();
