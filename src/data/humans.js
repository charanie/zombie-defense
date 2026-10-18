/* 8 种人类职业 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const C = ZG.Const.COLORS.human;

  const humans = {
    pistol: {
      id: 'pistol', name: '手枪兵', cost: 60, hp: 140, pop: 1, radius: 8,
      color: C.pistol, symbol: '手', blurb: '均衡基础兵',
      attack: {
        kind: 'ranged', damage: 12, interval: 0.5, range: 200,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1, spread: 0
      },
      counters: '普通丧尸、狂尸',
      weak: '盾尸正面、巨人、爆尸近身'
    },
    shotgun: {
      id: 'shotgun', name: '霰弹兵', cost: 90, hp: 180, pop: 1, radius: 9,
      color: C.shotgun, symbol: '霰', blurb: '近身清群',
      attack: {
        kind: 'shotgun', damage: 10, interval: 1, range: 180,
        damageKind: 'ranged', projectile: 'pellet', pellets: 5, coneDeg: 42,
        falloffStart: 120, falloffMul: 0.5
      },
      counters: '普通群、狂尸、近距离爆尸',
      weak: '巨人、母体、远程 BOSS'
    },
    mg: {
      id: 'mg', name: '机枪兵', cost: 140, hp: 220, pop: 1, radius: 9,
      color: C.mg, symbol: '机', blurb: '持续单体输出',
      attack: {
        kind: 'ranged', damage: 9, interval: 1 / 9, range: 240,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1, spread: 0.02,
        ammo: 45, reload: 2
      },
      counters: '普通、狂尸、母体',
      weak: '巨人、爆尸近身、BOSS 石块'
    },
    flame: {
      id: 'flame', name: '喷火兵', cost: 130, hp: 200, pop: 1, radius: 9,
      color: C.flame, symbol: '火', blurb: '范围清群 / 穿透',
      attack: {
        kind: 'flame', damage: 5, interval: 0.125, range: 100,
        damageKind: 'fire', coneDeg: 50, burnDps: 5, burnTime: 3
      },
      counters: '普通群、狂尸群、幼体、盾尸（穿盾）',
      weak: '巨人、远程 BOSS、爆尸'
    },
    rocket: {
      id: 'rocket', name: '导弹兵', cost: 180, hp: 160, pop: 1, radius: 9,
      color: C.rocket, symbol: '导', blurb: '反大型 / 反集群',
      attack: {
        kind: 'rocket', damage: 130, interval: 2, range: 330,
        damageKind: 'explosion', projectile: 'rocket', splash: 60,
        siegeBonus: 1.25, speed: 420
      },
      counters: '巨人、母体、盾尸、BOSS、密集群',
      weak: '狂尸快速接近、爆尸近身'
    },
    shield: {
      id: 'shield', name: '盾兵', cost: 100, hp: 500, pop: 1, radius: 11,
      color: C.shield, symbol: '盾', blurb: '前排坦克 / 嘲讽',
      shieldHp: 250, shieldReduction: 0.4, tauntRadius: 90,
      attack: {
        kind: 'melee', damage: 12, interval: 1, range: 50,
        damageKind: 'melee', rangeBonusRadius: true
      },
      counters: '普通/狂尸（挡路吸怪）',
      weak: '巨人、爆尸、母体'
    },
    medic: {
      id: 'medic', name: '治疗兵', cost: 120, hp: 150, pop: 1, radius: 8,
      color: C.medic, symbol: '疗', blurb: '治疗 / 驱散感染',
      healRate: 20, healRange: 160, serumLeft: 3, serumAmount: 50, serumCd: 8,
      attack: {
        kind: 'ranged', damage: 8, interval: 1, range: 160,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1
      },
      counters: '感染、持续伤害、消耗战',
      weak: '狂尸/爆尸切后排、BOSS 石块'
    },
    civilian: {
      id: 'civilian', name: '平民', cost: 40, hp: 80, pop: 1, radius: 7,
      color: C.civilian, symbol: '民', blurb: '每回合 +12 金',
      income: 12, attack: null,
      counters: '经济投资（约 3.3 回合回本）',
      weak: '所有僵尸，尤其狂尸/爆尸'
    }
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.humans = humans;
  ZG.Data.humanOrder = ['pistol', 'shotgun', 'mg', 'flame', 'rocket', 'shield', 'medic', 'civilian'];
})();
