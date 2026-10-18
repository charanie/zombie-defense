/* 4 名随机英雄 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const C = ZG.Const.COLORS.human;

  const heroes = {
    officer: {
      id: 'officer', name: '长官', hp: 1200, pop: 0, radius: 10,
      color: C.officer, symbol: '令', blurb: '后排输出 + 每回合导弹支援',
      hero: true, moveSpeed: 62, vision: 380, huntRadius: 400,
      attack: {
        kind: 'ranged', damage: 18, interval: 0.35, range: 300,
        damageKind: 'ranged', projectile: 'bullet', pellets: 2, spread: 0.04
      },
      ability: { type: 'missiles', count: 3, damage: 400, radius: 140, interval: 0.4, cluster: 8 },
      counters: '密集群、BOSS、巨人/母体',
      weak: '狂尸/爆尸切后排、BOSS 石块'
    },
    samurai: {
      id: 'samurai', name: '武士', hp: 1100, pop: 0, radius: 11,
      color: C.samurai, symbol: '武', blurb: '近战爆发 + 剑气穿透',
      hero: true, moveSpeed: 70, vision: 300, huntRadius: 340,
      attack: {
        kind: 'melee', damage: 126, interval: 0.7, range: 45,
        damageKind: 'melee', rangeBonusRadius: true
      },
      ability: { type: 'slash', chance: 0.25, length: 320, width: 80, damage: 300 },
      counters: '盾尸、狂尸、母体、直线群',
      weak: '爆尸、巨人、远程 BOSS 石块'
    },
    gatling: {
      id: 'gatling', name: '加特林士兵', hp: 1600, pop: 0, radius: 14,
      color: C.gatling, symbol: '加', blurb: '高血量持续输出 + 攻速光环',
      hero: true, moveSpeed: 54, vision: 340, huntRadius: 360,
      attack: {
        kind: 'ranged', damage: 22, interval: 0.1, range: 260,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1, spread: 0.03, warmup: 1
      },
      ability: { type: 'inspire', interval: 45, radius: 200, duration: 8, attackSpeed: 1.3, minAllies: 3 },
      counters: '普通/狂尸/母体/巨人',
      weak: '爆尸近身、BOSS 石块'
    },
    plague: {
      id: 'plague', name: '疫医', hp: 800, pop: 0, radius: 8,
      color: C.plague, symbol: '疫', blurb: '治疗 + 感染控制 + 转化丧尸',
      hero: true, moveSpeed: 84, vision: 260, huntRadius: 300,
      attack: {
        kind: 'vial', damage: 29, interval: 1 / 1.2, range: 230,
        damageKind: 'explosion', projectile: 'vial', splash: 50, speed: 380
      },
      healRate: 35, healRange: 230, dispel: 80, dispelCd: 8,
      groupHeal: { interval: 12, radius: 180, amount: 70, dispel: 30, minInjured: 3 },
      convert: { chance: 0.15, perRound: 5 },
      counters: '感染、消耗战、母体、爆尸',
      weak: '高爆发单体、BOSS 石块、狂尸突脸'
    }
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.heroes = heroes;
  ZG.Data.heroOrder = ['officer', 'samurai', 'gatling', 'plague'];
})();
