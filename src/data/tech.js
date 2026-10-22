/* 科技树全部节点与数值（纯数据，不依赖 DOM） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const branches = {
    fire: { id: 'fire', name: '火力', symbol: '火', color: '#FF7043' },
    econ: { id: 'econ', name: '经济', symbol: '财', color: '#FFD54F' },
    life: { id: 'life', name: '生命', symbol: '生', color: '#66BB6A' },
    hero: { id: 'hero', name: '英雄', symbol: '英', color: '#FF8A65' }
  };

  const nodes = {};

  function node(def) { nodes[def.id] = def; }

  /* ── 火力分支（20） ── */
  node({
    id: 'fire_dmg', branch: 'fire', tier: 1, name: '伤害强化',
    kind: 'stat', maxRank: 5,
    summary: '全体人类伤害 +4%/级（满 +20%）',
    detail: '每级使所有人类（含英雄、转化兵）造成的伤害提高 4%。五级合计 +20%，只作用于人类伤害，不影响建筑、哨塔与援助。',
    effects: [{ type: 'scalar', key: 'dmgMul', perRank: 0.04 }]
  });
  node({
    id: 'fire_rate', branch: 'fire', tier: 1, name: '射速强化',
    kind: 'stat', maxRank: 5,
    summary: '全体人类攻速 +4%/级（满 +20%）',
    detail: '每级使所有人类的攻击间隔缩短 4%，五级合计 +20%。与其他攻速加成相乘。',
    effects: [{ type: 'scalar', key: 'atkSpeedMul', perRank: 0.04 }]
  });

  node({
    id: 'pistol_passive', branch: 'fire', tier: 2, name: '连射专注',
    kind: 'passive', maxRank: 1,
    summary: '连续攻击同一目标，每发 +6% 伤害，最多 3 层；切换目标清零',
    detail: '仅手枪兵生效。每次命中同一目标叠加 1 层，最多 3 层（+18%）；切换目标或目标死亡时清零。',
    effects: [{ type: 'classPassive', classId: 'pistol', params: { perStack: 0.06, maxStacks: 3 } }]
  });
  node({
    id: 'pistol_active', branch: 'fire', tier: 2, name: '快速拔枪',
    kind: 'active', maxRank: 1,
    summary: '每 8 秒：接下来 2 秒攻速 +120%',
    detail: '手枪兵自动触发。冷却 8 秒，持续 2 秒内攻击间隔除以 2.2。开战时冷却清零。',
    effects: [{ type: 'classActive', classId: 'pistol', params: { cd: 8, duration: 2, atkSpeedMul: 2.2 } }]
  });
  node({
    id: 'shotgun_passive', branch: 'fire', tier: 2, name: '近身压制',
    kind: 'passive', maxRank: 1,
    summary: '目标距离 ≤120 时伤害 +25%',
    detail: '仅霰弹兵生效。命中 120 像素内目标时伤害 ×1.25；对更远目标无加成。',
    effects: [{ type: 'classPassive', classId: 'shotgun', params: { range: 120, dmgMul: 1.25 } }]
  });
  node({
    id: 'shotgun_active', branch: 'fire', tier: 2, name: '震慑射击',
    kind: 'active', maxRank: 1,
    summary: '每 10 秒：锥形内僵尸眩晕 0.8 秒并击退 40；BOSS 免疫眩晕',
    detail: '霰弹兵自动触发，扇形 42°、射程 180。普通与精英僵尸被眩晕 0.8 秒并沿反方向推开 40；BOSS 不眩晕，击退免疫单位不位移。',
    effects: [{ type: 'classActive', classId: 'shotgun', params: { cd: 10, coneDeg: 42, range: 180, stun: 0.8, knockback: 40 } }]
  });

  node({
    id: 'mg_passive', branch: 'fire', tier: 3, name: '持续压制',
    kind: 'passive', maxRank: 1,
    summary: '对同一目标连续射击，每 0.5 秒 +3% 伤害，最多 +30%',
    detail: '仅机枪兵生效。锁定同一目标每 0.5 秒叠 1 层，最多 10 层（+30%）；切换目标层数清零。',
    effects: [{ type: 'classPassive', classId: 'mg', params: { perStack: 0.03, maxStacks: 10, stepSec: 0.5 } }]
  });
  node({
    id: 'mg_active', branch: 'fire', tier: 3, name: '弹幕扫射',
    kind: 'active', maxRank: 1,
    summary: '每 12 秒：1 秒内对 150 半径内所有僵尸扫射，共 12 段 ×8 伤害',
    detail: '机枪兵自动触发。持续 1 秒，每 1/12 秒对 150 半径内全部僵尸结算 8 点伤害，共 96 点。',
    effects: [{ type: 'classActive', classId: 'mg', params: { cd: 12, radius: 150, ticks: 12, tickDamage: 8, duration: 1 } }]
  });
  node({
    id: 'flame_passive', branch: 'fire', tier: 3, name: '燃油强化',
    kind: 'passive', maxRank: 1,
    summary: '灼烧伤害 +50%，灼烧持续 3 → 4 秒',
    detail: '仅喷火兵生效。点燃的持续伤害乘以 1.5，灼烧时长从 3 秒延长到 4 秒。',
    effects: [{ type: 'classPassive', classId: 'flame', params: { burnMul: 1.5, burnTime: 4 } }]
  });
  node({
    id: 'flame_active', branch: 'fire', tier: 3, name: '烈焰喷发',
    kind: 'active', maxRank: 1,
    summary: '每 10 秒：以自身为中心 140 半径火环，120 伤害并附加灼烧',
    detail: '喷火兵自动触发。对 140 半径内僵尸造成 120 点爆炸伤害并点燃 4 秒，火环可叠加燃油强化的灼烧加成。',
    effects: [{ type: 'classActive', classId: 'flame', params: { cd: 10, radius: 140, damage: 120, burnDps: 10, burnTime: 4 } }]
  });

  node({
    id: 'rocket_passive', branch: 'fire', tier: 4, name: '破甲弹头',
    kind: 'passive', maxRank: 1,
    summary: '对 BOSS/攻城单位伤害 +30%',
    detail: '仅火箭兵生效。命中 BOSS 或攻城单位时伤害 ×1.3，溅射同样生效。',
    effects: [{ type: 'classPassive', classId: 'rocket', params: { bossSiegeMul: 1.3 } }]
  });
  node({
    id: 'rocket_active', branch: 'fire', tier: 4, name: '双联齐射',
    kind: 'active', maxRank: 1,
    summary: '每 14 秒：下一次攻击同时发射 2 枚火箭，优先不同目标',
    detail: '火箭兵自动触发。触发后下一次开火额外发射一枚火箭，优先选择原目标之外最近的僵尸；两枚都按原伤害结算。',
    effects: [{ type: 'classActive', classId: 'rocket', params: { cd: 14 } }]
  });
  node({
    id: 'shield_passive', branch: 'fire', tier: 4, name: '坚盾',
    kind: 'passive', maxRank: 1,
    summary: '护盾上限 +40%；有盾时受到伤害 -10%',
    detail: '盾兵护盾上限提高 40%。护盾未破时受到的伤害额外乘以 0.9，与其他减伤相乘。',
    effects: [
      { type: 'scalar', key: 'shieldMul', perRank: 0.4 },
      { type: 'classPassive', classId: 'shield', params: { dmgMul: 0.9 } }
    ]
  });
  node({
    id: 'shield_active', branch: 'fire', tier: 4, name: '盾墙',
    kind: 'active', maxRank: 1,
    summary: '每 15 秒：嘲讽 220 半径僵尸 2 秒，自身减伤 30% 持续 3 秒',
    detail: '盾兵自动触发。220 半径内僵尸强制把该盾兵作为目标 2 秒；盾兵自身受到伤害 ×0.7 持续 3 秒。BOSS 同样受嘲讽。',
    effects: [{ type: 'classActive', classId: 'shield', params: { cd: 15, radius: 220, taunt: 2, selfReduction: 0.3, reductionTime: 3 } }]
  });

  node({
    id: 'medic_passive', branch: 'fire', tier: 5, name: '战地急救',
    kind: 'passive', maxRank: 1,
    summary: '治疗生命低于 30% 的友军时，治疗量 +50%',
    detail: '仅治疗兵生效。目标当前生命低于最大生命 30% 时，本次治疗量 ×1.5。',
    effects: [{ type: 'classPassive', classId: 'medic', params: { lowHpRatio: 0.3, healMul: 1.5 } }]
  });
  node({
    id: 'medic_active', branch: 'fire', tier: 5, name: '群体急救',
    kind: 'active', maxRank: 1,
    summary: '每 15 秒：治疗 160 半径友军 100 HP，驱散 25 感染',
    detail: '治疗兵自动触发。对 160 半径内存活友军回复 100 生命并驱散 25 点感染；可叠加战地急救的治疗加成。',
    effects: [{ type: 'classActive', classId: 'medic', params: { cd: 15, radius: 160, heal: 100, dispel: 25 } }]
  });
  node({
    id: 'civilian_passive', branch: 'fire', tier: 5, name: '拾荒',
    kind: 'passive', maxRank: 1,
    summary: '平民每回合结算额外 +6 金（12 → 18）',
    detail: '仅平民生效。每回合结算时每名存活平民额外产出 6 金，与财源节点的收入倍率相乘。',
    effects: [{ type: 'classPassive', classId: 'civilian', params: { incomeBonus: 6 } }]
  });

  node({
    id: 'cap_dmg', branch: 'fire', tier: 6, name: '战争机器',
    kind: 'capstone', maxRank: 1,
    summary: '全体伤害 +10%',
    detail: '终局节点。所有人类造成的伤害额外 ×1.1，与火力基础节点、英雄伤害相乘。',
    effects: [{ type: 'scalar', key: 'dmgMul', perRank: 0.10 }]
  });
  node({
    id: 'cap_speed', branch: 'fire', tier: 6, name: '战争机器·疾',
    kind: 'capstone', maxRank: 1,
    summary: '全体攻速 +10%',
    detail: '终局节点。所有人类攻击间隔再缩短 10%，与射速基础节点、技能攻速相乘。',
    effects: [{ type: 'scalar', key: 'atkSpeedMul', perRank: 0.10 }]
  });
  node({
    id: 'cap_cd', branch: 'fire', tier: 6, name: '战争机器·令',
    kind: 'capstone', maxRank: 1,
    summary: '所有职业技能冷却 -15%',
    detail: '终局节点。8 个职业的主动技与长官导弹齐射间隔缩短 15%；不作用于治疗兵血清与疫医驱散的独立冷却。',
    effects: [{ type: 'scalar', key: 'skillCdMul', perRank: -0.15 }]
  });

  /* ── 经济分支（8） ── */
  node({
    id: 'econ_gold', branch: 'econ', tier: 1, name: '财源',
    kind: 'stat', maxRank: 5,
    summary: '击杀金 +5%/级，通关奖励 +10%/级',
    detail: '每级使僵尸击杀赏金提高 5%、回合结算奖励提高 10%。五级合计 +25% 击杀金与 +50% 结算奖励。',
    effects: [{ type: 'econ', killPerRank: 0.05, rewardPerRank: 0.10 }]
  });
  node({
    id: 'build_hp', branch: 'econ', tier: 1, name: '建筑加固',
    kind: 'stat', maxRank: 3,
    summary: '建筑最大生命 +25%/级（满 +75%）',
    detail: '每级使所有建筑（含围墙、哨塔、医疗站等）最大生命提高 25%，购买后现有建筑按比例补足。',
    effects: [{ type: 'scalar', key: 'buildHpMul', perRank: 0.25 }]
  });
  node({
    id: 'build_cap', branch: 'econ', tier: 1, name: '扩建',
    kind: 'stat', maxRank: 3,
    summary: '每种建筑数量上限 +1/级',
    detail: '每级使每种建筑的建造上限 +1，按建筑类型独立计算。',
    effects: [{ type: 'scalar', key: 'buildCapBonus', perRank: 1 }]
  });

  node({
    id: 'bank_power', branch: 'econ', tier: 2, name: '金钱即力量',
    kind: 'stat', maxRank: 3,
    summary: '每 500 金 +2% 全体伤害；上限 +20%/+40%/+60%',
    detail: '按当前持有金钱实时计算，只作用于人类伤害，不含建筑与援助。花钱后加成立即下降；三级分别把上限提高到 20%/40%/60%。',
    effects: [{ type: 'bank', per500: 0.02, capByRank: [0.2, 0.4, 0.6] }]
  });

  node({
    id: 'support_heal', branch: 'econ', tier: 3, name: '战地医疗支援',
    kind: 'unlock', maxRank: 1,
    summary: '解锁范围治疗：60 金/次，每回合 1 次，半径 150，回 120 HP，驱散 40 感染',
    detail: '整备期解锁后，战斗期底栏出现范围治疗按钮。点击按钮再点地图施放，不暂停游戏；每回合次数有限。',
    effects: [{ type: 'support', skill: 'areaHeal', unlocked: true }]
  });
  node({
    id: 'support_bomb', branch: 'econ', tier: 4, name: '导弹轰炸支援',
    kind: 'unlock', maxRank: 1,
    summary: '解锁导弹轰炸：120 金/次，每回合 1 次，半径 130，伤害 300 + 12×回合数',
    detail: '整备期解锁后，战斗期可手动指定落点。两发固定偏移落下，落点提前 0.35 秒预警；不暂停游戏。',
    effects: [{ type: 'support', skill: 'missileBombardment', unlocked: true }]
  });
  node({
    id: 'support_power', branch: 'econ', tier: 5, name: '支援强化',
    kind: 'enhance', maxRank: 1,
    summary: '援助半径 +25%，治疗/伤害 +25%，费用 -10%',
    detail: '同时强化范围治疗与导弹轰炸：作用半径 ×1.25、治疗与伤害 ×1.25、金币费用 ×0.9。',
    effects: [
      { type: 'support', key: 'radiusMul', value: 0.25 },
      { type: 'support', key: 'powerMul', value: 0.25 },
      { type: 'support', key: 'costMul', value: -0.10 }
    ]
  });
  node({
    id: 'support_extra', branch: 'econ', tier: 6, name: '紧急调度',
    kind: 'enhance', maxRank: 1,
    summary: '每种援助每回合 +1 次（各 2 次/回合）',
    detail: '范围治疗与导弹轰炸的每回合可用次数各 +1。次数在每回合开始时重置。',
    effects: [{ type: 'support', key: 'usesBonus', value: 1 }]
  });

  /* ── 生命分支（8） ── */
  node({
    id: 'hp_all', branch: 'life', tier: 1, name: '全员强化',
    kind: 'stat', maxRank: 5,
    summary: '全体人类最大生命 +6%/级（满 +30%）',
    detail: '每级使所有人类最大生命提高 6%。购买时按比例补足现有存活单位的当前生命，死亡单位不受影响。',
    effects: [{ type: 'scalar', key: 'hpMul', perRank: 0.06 }]
  });
  node({
    id: 'regen', branch: 'life', tier: 2, name: '再生',
    kind: 'passive', maxRank: 3,
    summary: '战斗中每 5 秒回复 0.5%/1%/1.5% 最大生命',
    detail: '仅战斗中生效。每 5 秒为所有存活人类回复最大生命的一定比例；不复活、不驱散感染。',
    effects: [{ type: 'scalar', key: 'regenPct', perRank: 0.005 }]
  });
  node({
    id: 'revive', branch: 'life', tier: 3, name: '不死意志',
    kind: 'passive', maxRank: 3,
    summary: '普通人类死亡时 15%/25%/35% 概率以 40% 生命复活；每单位每回合最多 1 次',
    detail: '仅普通人类（不含英雄与队长）生效。复活后清除感染与灼烧、不生成 walker；同一单位每回合最多触发一次。',
    effects: [{ type: 'table', key: 'reviveChance', values: [0, 0.15, 0.25, 0.35] }]
  });
  node({
    id: 'death_boom', branch: 'life', tier: 4, name: '尸爆',
    kind: 'passive', maxRank: 2,
    summary: '普通人类死亡时 30%/50% 概率爆炸：半径 80，伤害 80 + 8×回合数，只伤僵尸',
    detail: '仅普通人类（不含英雄与队长）死亡时判定，先判定复活，复活成功则不爆炸。爆炸只伤害僵尸，不伤害人类与建筑。',
    effects: [
      { type: 'table', key: 'boomChance', values: [0, 0.30, 0.50] },
      { type: 'flag', key: 'boomRadiusBase' }
    ]
  });
  node({
    id: 'infect_res', branch: 'life', tier: 5, name: '抗感染',
    kind: 'passive', maxRank: 3,
    summary: '感染获取 -20%/级（满 -60%）',
    detail: '每级使人类受到的感染积累减少 20%，与地形感染倍率相乘。三级合计 -60%。',
    effects: [{ type: 'scalar', key: 'infectResist', perRank: 0.20 }]
  });
  node({
    id: 'dmg_res', branch: 'life', tier: 5, name: '坚韧',
    kind: 'passive', maxRank: 3,
    summary: '受到伤害 -3%/级（满 -9%，最低保留 1 点）',
    detail: '每级使人类受到的伤害降低 3%，与其他减伤相乘；单次整数伤害最低保留 1 点，持续伤害不受保底影响。',
    effects: [{ type: 'scalar', key: 'dmgReduction', perRank: 0.03 }]
  });
  node({
    id: 'undying', branch: 'life', tier: 6, name: '不屈',
    kind: 'capstone', maxRank: 1,
    summary: '复活概率额外 +15%，尸爆半径 +50%',
    detail: '终局节点。在复活与尸爆节点基础上追加：复活概率 +15%，尸爆半径从 80 提高到 120。未购买对应节点时不生效。',
    effects: [{ type: 'flag', key: 'undying' }]
  });
  node({
    id: 'last_stand', branch: 'life', tier: 6, name: '绝境',
    kind: 'capstone', maxRank: 1,
    summary: '存活人类 ≤3 时，全体伤害 +25%、攻速 +20%',
    detail: '终局节点。每 15 步检测一次存活人类数量，≤3 时全体人类伤害 ×1.25、攻速 +20%，人数恢复后立即失效。',
    effects: [{ type: 'flag', key: 'lastStandUnlocked' }]
  });

  /* ── 英雄分支（11） ── */
  node({
    id: 'hero_dmg', branch: 'hero', tier: 1, name: '英雄攻击',
    kind: 'stat', maxRank: 5,
    summary: '英雄伤害 +6%/级（满 +30%）',
    detail: '每级使四名英雄造成的伤害提高 6%，与其他伤害加成相乘；不影响普通人类。',
    effects: [{ type: 'hero', key: 'dmgMul', perRank: 0.06 }]
  });
  node({
    id: 'hero_hp', branch: 'hero', tier: 1, name: '英雄生命',
    kind: 'stat', maxRank: 5,
    summary: '英雄最大生命 +6%/级（满 +30%）',
    detail: '每级使四名英雄最大生命提高 6%，购买时按比例补足当前生命。',
    effects: [{ type: 'hero', key: 'hpMul', perRank: 0.06 }]
  });

  node({
    id: 'officer_range', branch: 'hero', tier: 2, name: '导弹覆盖',
    kind: 'enhance', maxRank: 1,
    summary: '长官导弹半径 140 → 210（+50%）',
    detail: '长官每回合的导弹齐射溅射半径由 140 提高到 210，对密集群与 BOSS 更有效。',
    effects: [{ type: 'hero', key: 'officerRange', value: 210 }]
  });
  node({
    id: 'officer_uses', branch: 'hero', tier: 2, name: '导弹储备',
    kind: 'enhance', maxRank: 1,
    summary: '长官每回合导弹次数 3 → 5（+2 发）',
    detail: '长官每回合可发射的导弹由 3 发提高到 5 发；每次齐射后仍需等待 8 秒冷却。',
    effects: [{ type: 'hero', key: 'officerUses', value: 5 }]
  });

  node({
    id: 'samurai_chain', branch: 'hero', tier: 3, name: '剑气连发',
    kind: 'enhance', maxRank: 1,
    summary: '剑气触发后 40% 概率立即再放一道，最多连续 3 道',
    detail: '武士剑气触发后独立判定 40% 概率追加一道，最多连续 3 道；每道都使用当前剑气伤害与宽度。',
    effects: [{ type: 'hero', key: 'samuraiChain', value: 0.40 }]
  });
  node({
    id: 'samurai_power', branch: 'hero', tier: 3, name: '剑气强化',
    kind: 'enhance', maxRank: 1,
    summary: '剑气伤害 +40%，宽度 80 → 110',
    detail: '武士剑气伤害 ×1.4，命中宽度由 80 提高到 110。与剑气连发叠加。',
    effects: [
      { type: 'hero', key: 'samuraiPower', value: 0.40 },
      { type: 'hero', key: 'samuraiWidth', value: 110 }
    ]
  });

  node({
    id: 'gatling_heal', branch: 'hero', tier: 4, name: '鼓舞治疗',
    kind: 'enhance', maxRank: 1,
    summary: '鼓舞同时为半径内友军回复 60 HP，驱散 20 感染',
    detail: '加特林士兵触发鼓舞时，为 200 半径内存活友军回复 60 生命并驱散 20 感染。',
    effects: [
      { type: 'hero', key: 'gatlingHeal', value: 60 },
      { type: 'hero', key: 'gatlingDispel', value: 20 }
    ]
  });
  node({
    id: 'gatling_duration', branch: 'hero', tier: 4, name: '鼓舞延长',
    kind: 'enhance', maxRank: 1,
    summary: '鼓舞持续 8 → 12 秒，攻速加成 30% → 40%',
    detail: '鼓舞光环持续时间由 8 秒延长到 12 秒，攻速倍率由 1.3 提高到 1.4。',
    effects: [
      { type: 'hero', key: 'gatlingDuration', value: 12 },
      { type: 'hero', key: 'gatlingAttackSpeed', value: 1.4 }
    ]
  });

  node({
    id: 'plague_cap', branch: 'hero', tier: 5, name: '转化扩容',
    kind: 'enhance', maxRank: 1,
    summary: '每回合转化上限 5 → 8，转化概率 15% → 20%',
    detail: '疫医每回合最多转化 8 只僵尸，单次转化概率由 15% 提高到 20%。',
    effects: [
      { type: 'hero', key: 'plagueCap', value: 8 },
      { type: 'hero', key: 'plagueChance', value: 0.20 }
    ]
  });
  node({
    id: 'plague_random', branch: 'hero', tier: 5, name: '万灵药',
    kind: 'enhance', maxRank: 1,
    summary: '转化目标从固定手枪兵改为 8 个非英雄职业随机，并满血',
    detail: '转化出的单位从固定手枪兵改为在 8 个非英雄职业中随机，并以满血出现；转化出的平民不产金、不占平民上限。',
    effects: [{ type: 'hero', key: 'plagueRandom', value: true }]
  });

  node({
    id: 'medical_system', branch: 'hero', tier: 6, name: '医疗体系',
    kind: 'stat', maxRank: 3,
    summary: '治疗兵血清 +1/级、治疗量 +8%/级；医疗站治疗 +8%/级；疫医群疗 +8%/级',
    detail: '三级节点依次叠加。每级治疗兵初始血清 +1（基础 3），所有治疗量 +8%；医疗站与疫医群体治疗同样受益。购买后存活的治疗兵立即获得新增血清。',
    effects: [{ type: 'hero', key: 'medicalRank', perRank: 1 }]
  });

  const nodeOrder = [
    'fire_dmg', 'fire_rate',
    'pistol_passive', 'pistol_active', 'shotgun_passive', 'shotgun_active',
    'mg_passive', 'mg_active', 'flame_passive', 'flame_active',
    'rocket_passive', 'rocket_active', 'shield_passive', 'shield_active',
    'medic_passive', 'medic_active', 'civilian_passive',
    'cap_dmg', 'cap_speed', 'cap_cd',

    'econ_gold', 'build_hp', 'build_cap', 'bank_power',
    'support_heal', 'support_bomb', 'support_power', 'support_extra',

    'hp_all', 'regen', 'revive', 'death_boom',
    'infect_res', 'dmg_res', 'undying', 'last_stand',

    'hero_dmg', 'hero_hp', 'officer_range', 'officer_uses',
    'samurai_chain', 'samurai_power', 'gatling_heal', 'gatling_duration',
    'plague_cap', 'plague_random', 'medical_system'
  ];

  const support = {
    areaHeal: {
      id: 'areaHeal', name: '范围治疗', nodeId: 'support_heal',
      baseCost: 60, baseUses: 1, radius: 150, heal: 120, dispel: 40
    },
    missileBombardment: {
      id: 'missileBombardment', name: '导弹轰炸', nodeId: 'support_bomb',
      baseCost: 120, baseUses: 1, radius: 130, shells: 2, shellGap: 0.15,
      damageBase: 300, damagePerRound: 12,
      offsets: [{ x: -24, y: -12 }, { x: 24, y: 12 }], warnT: 0.35
    }
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.tech = {
    version: 1,
    tierCost: [120, 200, 300, 420, 580, 800],
    costGrowth: 1.35,
    branchOrder: ['fire', 'econ', 'life', 'hero'],
    branches,
    nodes,
    nodeOrder,
    convertClasses: ['pistol', 'shotgun', 'mg', 'flame', 'rocket', 'shield', 'medic', 'civilian'],
    support,
    heroDefaults: {
      officerVolleyCd: 8,
      samuraiBaseChance: 0.25
    }
  };
})();
