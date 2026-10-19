/* 6 种普通僵尸 + 幼体 + BOSS */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const C = ZG.Const.COLORS.zombie;

  const zombies = {
    walker: {
      id: 'walker', name: '普通丧尸', hp: 90, speed: 38, damage: 8, bounty: 6,
      radius: 9, unlock: 1, color: C.walker, symbol: '·', attackInterval: 1,
      infection: { chance: 0.30, amount: 20 },
      special: '近战；30% 概率感染'
    },
    runner: {
      id: 'runner', name: '狂尸', hp: 60, speed: 75, damage: 6, bounty: 9,
      radius: 8, unlock: 3, color: C.runner, symbol: '»', attackInterval: 0.8,
      infection: { chance: 0.25, amount: 18 },
      sprint: { every: 4, duration: 0.8, speed: 150 },
      special: '每 4 秒冲刺 0.8 秒'
    },
    shield: {
      id: 'shield', name: '盾尸', hp: 200, shield: 200, speed: 30, damage: 10, bounty: 18,
      radius: 10, unlock: 4, color: C.shield, symbol: '◗', attackInterval: 1.2,
      shieldReduction: 0.7, shieldAngle: 120, breakSlow: 0.2,
      vanguard: true, vanguardSpeedMul: 1.15, vanguardLeadGap: 50,
      intercept: true, interceptFacingHalfAngle: 60,
      infection: { chance: 0.35, amount: 25 },
      special: '正面 120° 护盾；破盾减速 20%'
    },
    boomer: {
      id: 'boomer', name: '爆尸', hp: 80, speed: 65, damage: 70, bounty: 12,
      radius: 9, unlock: 4, color: C.boomer, symbol: '✸', attackInterval: 999,
      infection: { chance: 0, amount: 0 },
      fuse: 0.8,
      explosion: { radius: 80, damage: 70, infection: 100 },
      special: '贴近或残血后 0.8 秒引信；击杀可取消'
    },
    mother: {
      id: 'mother', name: '母体', hp: 360, speed: 26, damage: 18, bounty: 35,
      radius: 16, unlock: 5, color: C.mother, symbol: '✚', attackInterval: 1.5,
      infection: { chance: 0.40, amount: 30 }, isSiege: true,
      deathExplosion: { radius: 120, human: 80, building: 200 },
      babies: { min: 3, max: 5, waveCap: 30 },
      special: '死亡爆 3–5 幼体；可拆建筑'
    },
    giant: {
      id: 'giant', name: '巨人', hp: 1100, speed: 16, damage: 45, bounty: 60,
      radius: 22, unlock: 6, color: C.giant, symbol: '●', attackInterval: 2,
      infection: { chance: 0.50, amount: 40 }, isSiege: true,
      buildingMultiplier: 3, knockbackImmune: true,
      special: '对建筑伤害 ×3；击退免疫'
    },
    baby: {
      id: 'baby', name: '幼体', hp: 40, speed: 55, damage: 4, bounty: 2,
      radius: 7, unlock: 0, color: C.baby, symbol: '¨', attackInterval: 0.8,
      infection: { chance: 0.25, amount: 15 },
      special: '母体死亡后出现；不再爆仔'
    },
    boss: {
      id: 'boss', name: 'BOSS 坦克', hp: 1200, speed: 14, damage: 80, bounty: 400,
      radius: 30, unlock: 7, color: C.boss, symbol: '▲', attackInterval: 1.5,
      infection: { chance: 0, amount: 0 }, isBoss: true, isSiege: false,
      rock: { interval: 4, radius: 70, warn: 2.0, infection: 30, sidestep: 60 },
      stomp: { radius: 60, damage: 80, interval: 1.5 },
      special: '远程抛石 + 近身践踏；血量与奖励随回合成长'
    }
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.zombies = zombies;
  ZG.Data.zombieOrder = ['walker', 'runner', 'shield', 'boomer', 'mother', 'giant'];
})();
