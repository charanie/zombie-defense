/* 纯函数视图模型（可在 Node 中测试） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function humansAlive(state) {
    return state.humans.filter(h => h.alive);
  }

  function topBar(state) {
    const humans = humansAlive(state);
    const pop = ZG.Economy.populationUsed(state);
    const heroes = humans.filter(h => h.hero).length;
    return {
      round: state.round,
      money: state.money,
      pop,
      popCap: ZG.Balance.populationCap(state.round),
      heroes,
      alive: humans.length,
      zombies: state.zombies.filter(z => z.alive).length +
        ZG.Spawner.remaining(state),
      remainingZombies: ZG.Spawner.remaining(state),
      speed: state.ui.speed,
      paused: state.ui.paused,
      status: state.status,
      boss: state.battle.bossId
        ? state.zombies.find(z => z.id === state.battle.bossId && z.alive) || null
        : null
    };
  }

  function cardState(state, classId) {
    const data = ZG.Data.humans[classId];
    if (!data) return { disabled: true, reason: 'unknown', cost: 0 };
    let reason = null;
    if (state.status !== 'prep') reason = 'not-prep';
    else if (state.money < data.cost) reason = 'money';
    else if (data.pop > 0 && ZG.Economy.populationUsed(state) + data.pop > ZG.Balance.populationCap(state.round)) reason = 'population';
    else if (classId === 'civilian' && ZG.Economy.civilianCount(state) >= ZG.Const.MAX_CIVILIANS) reason = 'civilian-cap';
    return { disabled: reason !== null, reason, cost: data.cost };
  }

  function buildingCard(state, classId) {
    const data = ZG.Data.buildings[classId];
    if (!data) return { disabled: true, reason: 'unknown', cost: 0, count: 0, limit: 0 };
    const count = state.buildings.filter(b => b.alive && b.typeId === classId).length;
    const limit = data.limit === undefined ? Infinity : data.limit;
    let reason = null;
    if (state.status !== 'prep') reason = 'not-prep';
    else if (count >= limit) reason = 'limit';
    else if (state.money < data.cost) reason = 'money';
    return { disabled: reason !== null, reason, cost: data.cost, count, limit };
  }

  function wavePreview(state) {
    const p = ZG.Waves.preview(state.round);
    p.formation = (ZG.Data.zombieOrder || []).map(id => ({
      id,
      name: ZG.Data.zombies[id].name,
      count: p.counts[id] || 0
    })).filter(x => x.count > 0);
    if (p.boss) p.formation.push({ id: 'boss', name: 'BOSS 坦克', count: 1 });
    return p;
  }

  const AI_LABELS = {
    guard: '警戒',
    advance: '自主追击',
    hold: '守住阵线',
    engage: '交火',
    return: '回防',
    assist: '前往救治',
    flee: '躲避威胁',
    dodge: '闪避冲刺'
  };

  function aiLabel(h) {
    if (h.aiState === 'heal') {
      const moving = Math.abs(h.moveX || 0) + Math.abs(h.moveY || 0) > 0.001;
      if (!moving) return '治疗中';
      return h.careKind === 'hospital' ? '前往医疗站' : '前往治疗兵';
    }
    return AI_LABELS[h.aiState] || AI_LABELS.guard;
  }

  function humanInfo(state, id) {
    const h = state.humans.find(u => u.id === id);
    if (!h) return null;
    const st = ZG.Stats.human(state, h);
    const ai = aiLabel(h);
    return {
      id: h.id,
      name: h.name + (h.captain ? '（队长）' : '') + (h.hero ? '（英雄）' : ''),
      classId: h.classId,
      hp: h.hp,
      maxHp: h.maxHp,
      shield: h.shield,
      maxShield: h.maxShield,
      infection: h.infection,
      dps: st.dps,
      range: st.range,
      level: h.captain ? '队长' : (h.hero ? '英雄' : '普通'),
      state: h.converted ? '疫医转化兵 · ' + ai : (h.wounded ? '重伤' : ai),
      aiState: h.aiState,
      careKind: h.careKind,
      moveSpeed: h.moveSpeed,
      huntRadius: h.huntRadius,
      infected: h.infection > 0,
      x: h.x, y: h.y
    };
  }

  function zombieInfo(state, id) {
    const z = state.zombies.find(u => u.id === id);
    if (!z) return null;
    const data = ZG.Data.zombies[z.typeId];
    const st = ZG.Stats.zombie(state, z);
    return {
      id: z.id,
      name: z.name,
      typeId: z.typeId,
      hp: z.hp,
      maxHp: z.maxHp,
      shield: z.shield,
      maxShield: z.maxShield,
      speed: st.speed,
      damage: z.isBoss ? ZG.Balance.bossRockDamage(state.round) : st.damage,
      bounty: z.isBoss ? ZG.Balance.bossReward(state.round) : z.bountyBase,
      radius: z.radius,
      special: data ? data.special : '',
      isBoss: !!z.isBoss,
      x: z.x, y: z.y
    };
  }

  function buildingInfo(state, id) {
    const b = state.buildings.find(u => u.id === id);
    if (!b) return null;
    const data = ZG.Data.buildings[b.typeId];
    return {
      id: b.id, name: b.name, typeId: b.typeId,
      hp: b.hp, maxHp: b.maxHp, blurb: data ? data.blurb : '',
      charges: b.charges, x: b.x, y: b.y
    };
  }

  function techRow(state, line) {
    const lvl = state.tech[line] || 0;
    const max = ZG.Balance.TECH_MAX;
    const names = { fire: '火力', armor: '护甲', econ: '经济', serum: '血清' };
    const effects = {
      fire: '+5% 全体伤害 / 级',
      armor: '+6% 最大生命 / 级',
      econ: '击杀 +4%，通关 +8% / 级',
      serum: '+1 血清，治疗 +5% / 级'
    };
    return {
      line,
      name: names[line],
      level: lvl,
      max,
      maxed: lvl >= max,
      cost: lvl >= max ? null : ZG.Balance.techCost(line, lvl),
      effect: effects[line],
      current: lvl > 0 ? ZG.Balance.techMul(line, lvl) : 1,
      next: lvl >= max ? null : ZG.Balance.techMul(line, lvl + 1)
    };
  }

  function touchTargetSize() {
    return 44;
  }

  function tutorialSteps() {
    return [
      '点击“手枪兵”卡片，在底部部署区放下 4 名士兵（初始 400 金足够）。',
      '点击右下角“开始回合”，观察第一波丧尸。',
      '结算后用金币补盾兵与治疗兵，把前排和治疗补齐。',
      '建筑提供光环，科技永久强化；悬停单位可查看详细数值。'
    ];
  }

  function createTutorial() {
    const steps = tutorialSteps();
    return {
      step: 0,
      done: false,
      steps,
      next() {
        this.step++;
        if (this.step >= steps.length) { this.done = true; this.step = steps.length - 1; }
        return this.done;
      },
      restart() { this.step = 0; this.done = false; },
      current() { return steps[this.step] || ''; }
    };
  }

  ZG.Model = {
    topBar, cardState, buildingCard, wavePreview, humanInfo, zombieInfo,
    buildingInfo, techRow, touchTargetSize, tutorialSteps
  };
  ZG.Tutorial = { create: createTutorial };
})();
