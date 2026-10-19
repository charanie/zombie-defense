/* 8 种人类职业 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const C = ZG.Const.COLORS.human;

  const humans = {
    pistol: {
      id: 'pistol', name: '手枪兵', role: 'rifle', cost: 60, hp: 140, pop: 1, radius: 8,
      color: C.pistol, symbol: '手', blurb: '均衡基础兵 · 自主走位',
      moveSpeed: 68, vision: 340, huntRadius: 420,
      attack: {
        kind: 'ranged', damage: 12, interval: 0.5, range: 200,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1, spread: 0
      },
      counters: '普通丧尸、狂尸',
      weak: '盾尸正面、巨人、爆尸近身'
    },
    shotgun: {
      id: 'shotgun', name: '霰弹兵', role: 'shotgun', cost: 90, hp: 180, pop: 1, radius: 9,
      color: C.shotgun, symbol: '霰', blurb: '近身清群 · 前压',
      moveSpeed: 80, vision: 280, huntRadius: 340,
      attack: {
        kind: 'shotgun', damage: 10, interval: 1, range: 180,
        damageKind: 'ranged', projectile: 'pellet', pellets: 5, coneDeg: 42,
        falloffStart: 120, falloffMul: 0.5
      },
      counters: '普通群、狂尸、近距离爆尸',
      weak: '巨人、母体、远程 BOSS'
    },
    mg: {
      id: 'mg', name: '机枪兵', role: 'rifle', cost: 140, hp: 220, pop: 1, radius: 9,
      color: C.mg, symbol: '机', blurb: '持续单体输出 · 中排推进',
      moveSpeed: 56, vision: 360, huntRadius: 400,
      attack: {
        kind: 'ranged', damage: 9, interval: 1 / 9, range: 240,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1, spread: 0.02,
        ammo: 45, reload: 2
      },
      counters: '普通、狂尸、母体',
      weak: '巨人、爆尸近身、BOSS 石块'
    },
    flame: {
      id: 'flame', name: '喷火兵', role: 'flame', cost: 130, hp: 200, pop: 1, radius: 9,
      color: C.flame, symbol: '火', blurb: '范围清群 / 穿透 · 贴脸推进',
      moveSpeed: 78, vision: 250, huntRadius: 320,
      attack: {
        kind: 'flame', damage: 5, interval: 0.125, range: 140,
        damageKind: 'fire', coneDeg: 50, burnDps: 5, burnTime: 3
      },
      counters: '普通群、狂尸群、幼体、盾尸（穿盾）',
      weak: '巨人、远程 BOSS、爆尸'
    },
    rocket: {
      id: 'rocket', name: '导弹兵', role: 'rocket', cost: 320, hp: 160, pop: 1, radius: 9,
      color: C.rocket, symbol: '导', blurb: '反大型 / 反集群 · 远程游走',
      moveSpeed: 50, vision: 480, huntRadius: 460,
      attack: {
        kind: 'rocket', damage: 130, interval: 2, range: 330,
        damageKind: 'explosion', projectile: 'rocket', splash: 60,
        siegeBonus: 1.25, speed: 420
      },
      counters: '巨人、母体、盾尸、BOSS、密集群',
      weak: '狂尸快速接近、爆尸近身'
    },
    shield: {
      id: 'shield', name: '盾兵', role: 'tank', cost: 100, hp: 650, pop: 1, radius: 11,
      color: C.shield, symbol: '盾', blurb: '前排坦克 / 嘲讽 · 破盾后换手枪',
      moveSpeed: 64, vision: 220, huntRadius: 220, dodge: false,
      shieldHp: 400, shieldReduction: 0.4, tauntRadius: 90,
      attack: {
        kind: 'melee', damage: 12, interval: 1, range: 50,
        damageKind: 'melee', rangeBonusRadius: true
      },
      fallbackAttack: {
        kind: 'ranged', damage: 12, interval: 0.5, range: 200,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1, spread: 0
      },
      guard: { maxDist: 220, facingHalfAngle: 75, allyRadius: 180, allyHalfAngle: 60, mul: 0.5 },
      counters: '普通/狂尸（挡路吸怪）',
      weak: '巨人、爆尸、母体'
    },
    medic: {
      id: 'medic', name: '治疗兵', role: 'medic', cost: 120, hp: 150, pop: 1, radius: 8,
      color: C.medic, symbol: '疗', blurb: '治疗 / 驱散感染 · 主动迎向伤员',
      moveSpeed: 90, vision: 200, huntRadius: 240,
      healRate: 20, healRange: 160, serumLeft: 3, serumAmount: 50, serumCd: 8,
      attack: {
        kind: 'ranged', damage: 8, interval: 1, range: 160,
        damageKind: 'ranged', projectile: 'bullet', pellets: 1
      },
      counters: '感染、持续伤害、消耗战',
      weak: '狂尸/爆尸切后排、BOSS 石块'
    },
    civilian: {
      id: 'civilian', name: '平民', role: 'civilian', cost: 40, hp: 80, pop: 1, radius: 7,
      color: C.civilian, symbol: '民', blurb: '每回合 +12 金 · 遇袭撤离',
      moveSpeed: 96, vision: 0, huntRadius: 0,
      income: 12, attack: null,
      counters: '经济投资（约 3.3 回合回本）',
      weak: '所有僵尸，尤其狂尸/爆尸'
    }
  };

  /* 人类自主 AI 的全局参数（不在 sim 里写魔法数字） */
  const humanAi = {
    careHpRatio: 0.60,        // HP 低于该比例 → 寻找医疗
    careInfection: 30,        // 感染达到该值 → 寻找医疗
    recoveredHpRatio: 0.88,   // 恢复到该 HP 比例可归队
    recoveredInfection: 8,    // 感染低于该值可归队
    careSearchRadius: 700,    // 最远寻医距离
    careSpeedMul: 1.1,
    returnSpeedMul: 1.15,
    stopRangeMul: 0.85,       // 对远程目标停在射程的这一比例
    medicAssistRadius: 460,   // 治疗兵主动迎向伤员的搜索半径
    medicStopRatio: 0.72,     // 停在治疗射程的这一比例
    hospitalStopRatio: 0.60,  // 停在医疗站半径的这一比例
    civilianFleeRadius: 190,
    civilianFleeSpeedMul: 1.15,
    dodgeRadius: 132,         // 狂尸冲刺进入该距离时触发闪避
    dodgeMinDot: 0.5,         // 冲刺方向与"冲向自己"的最小夹角余弦
    dodgeDuration: 0.35,
    dodgeSpeed: 195,
    dodgeCooldown: 1.3,
    separationGap: 0.5,
    separationPush: 0.5,
    homeEpsilon: 6,
    squad: {
      joinRadius: 280,
      keepRadiusMul: 1.35,
      capacity: 6,
      rebuildSec: 1.0,
      arriveEps: 8,
      shieldSpacing: 36,
      lateralSpacing: 26,
      overflowTierDepth: 28,
      rowMax: 8,
      rowSpacing: 28,
      civilianExtraDepth: 60,
      searchStopInset: 120,
      squadSpeedCap: 58,
      catchUpMul: 1.35,
      catchUpDist: 120,
      roleDepth: {
        tank: 0, melee: 40, flame: 56, shotgun: 76,
        rifle: 108, rocket: 144, medic: 144, civilian: 184
      }
    }
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.humans = humans;
  ZG.Data.humanAi = humanAi;
  ZG.Data.humanOrder = ['pistol', 'shotgun', 'mg', 'flame', 'rocket', 'shield', 'medic', 'civilian'];
})();
