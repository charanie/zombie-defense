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
  function bossHp(R) {
    return 1200 * pow(1.14, R - 1);
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
    bossHp, bossRockDamage, bossReward, populationCap, techCost, techMul,
    econRewardMul, serumCount, zombieCount, mineDamage, slotSlowMax
  };
})();
