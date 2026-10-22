/* 回合生命周期与固定步长模拟 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const STEP = ZG.Const.STEP_SEC;

  function createGame(opts) {
    const o = opts || {};
    const state = ZG.State.create({
      mapId: o.mapId || 'suburban',
      seed: o.seed === undefined ? 1 : o.seed,
      quality: o.quality || 'desktop'
    });
    state.map = ZG.Data.maps[state.mapId];
    state.spatial = ZG.Spatial.create();
    state.pathing = ZG.Pathing.build(state);
    state.status = 'prep';
    return state;
  }

  function resetRoundBattle(state) {
    state.battle.time = 0;
    state.battle.stepCount = 0;
    state.battle.killCount = 0;
    state.battle.spawned = 0;
    state.battle.berserkTier = 0;
    state.battle.bossId = null;
    state.battle.deathConfirmT = 0;
    state.battle.infectionTimer = 0;
    state.battle.convertedThisRound = 0;
    state.battle.babyCount = 0;
    state.battle.minesTriggered = 0;
    state.battle.killIncome = 0;
    state.battle.reason = null;
    state.projectiles.length = 0;
    state.effects.length = 0;
    state.stats.missilesFired = 0;
  }

  function startRound(state) {
    if (state.status !== 'prep') return { ok: false, reason: 'not-prep' };
    const alive = state.humans.filter(h => h.alive);
    if (!alive.length) return { ok: false, reason: 'no-humans' };

    resetRoundBattle(state);

    for (const h of state.humans) {
      if (!h.alive) continue;
      // 回到玩家布置的站位，清除上一场战斗的追击/寻医状态
      h.x = h.homeX;
      h.y = h.homeY;
      h.aiState = 'guard';
      h.careTargetId = 0;
      h.careKind = null;
      h.moveX = 0;
      h.moveY = 0;
      h.dodgeT = 0;
      h.dodgeCd = 0;
      h.cd = 0;
      h.reloadT = 0;
      h.poisonT = 0;
      h.poisonDps = 0;
      if (h.attack && h.attack.ammo) h.ammo = h.attack.ammo;
      if (h.attack && h.attack.warmup) h.warmup = h.attack.warmup;
      h.abilityUsed = false;
      h.nextInspireAt = undefined;
      h.nextGroupHealAt = undefined;
      h.serumCd = 0;
      h.dispelCd = 0;
      h.squadId = null;
      h.squadTier = 0;
      h.squadDirty = false;
      h.formationX = h.x;
      h.formationY = h.y;
      if (h.baseAttack) h.attack = Object.assign({}, h.baseAttack);
      if (h.baseRole) h.role = h.baseRole;
      if (h.maxShield > 0) { h.shield = h.maxShield; h.shieldBroken = false; }
      if (h.classId === 'medic') h.serumLeft = ZG.Balance.serumCount(state.tech.serum);
    }
    state.squads = [];
    state.squadDirty = true;
    state.squadTimer = 0;
    // 医疗站：范围内治疗兵每回合血清 +1（同类不叠加）
    for (const b of state.buildings) {
      if (!b.alive || b.typeId !== 'hospital') continue;
      const radius = ZG.Data.buildings.hospital.heal.radius;
      for (const h of state.humans) {
        if (!h.alive || h.classId !== 'medic') continue;
        if (ZG.Geom.dist2(h.x, h.y, b.x, b.y) <= radius * radius) h.serumLeft++;
      }
    }

    state.pathing = ZG.Pathing.build(state);
    ZG.Spawner.prepare(state);
    state.battle.waveTotal = state.spawner.total;
    state.status = 'battle';
    state.ui.paused = false;
    state.ui.selectedCard = null;
    state.ui.selectedHumanId = null;
    state.bus.emit(ZG.Events.ROUND_STARTED, { round: state.round });
    return { ok: true };
  }

  function step(state) {
    if (state.status !== 'battle' || state.ui.paused) return;

    state.battle.time += STEP;
    state.battle.stepCount = (state.battle.stepCount || 0) + 1;
    if (state.battle.stepCount % ZG.Const.PATH_REFRESH_STEPS === 0) {
      state.pathing = ZG.Pathing.build(state);
    }

    // 狂暴与 240 秒强制结算
    if (state.battle.time >= ZG.Const.BERSERK_AT) {
      state.battle.berserkTier = 1 + Math.floor((state.battle.time - ZG.Const.BERSERK_AT) / ZG.Const.BERSERK_INTERVAL);
    }
    if (state.battle.time >= ZG.Const.ROUND_HARD_CAP) {
      for (const z of state.zombies) z.alive = false;
      state.zombies.length = 0;
      state.spawner.batches = [];
      state.spawner.batchIndex = 0;
      state.battle.reason = 'timeout';
      settleRound(state);
      return;
    }

    ZG.Spawner.step(state);
    ZG.Spatial.rebuild(state.spatial, state);
    ZG.AI.step(state);
    ZG.Projectiles.step(state);
    ZG.Infection.tick(state);

    checkRoundEnd(state);
  }

  function tick(state, n) {
    for (let i = 0; i < n; i++) {
      step(state);
      if (state.status === 'over') break;
    }
    return state;
  }

  function checkRoundEnd(state) {
    if (state.status !== 'battle') return;

    const humanCount = state.humans.filter(h => h.alive).length;

    if (humanCount === 0) {
      state.battle.deathConfirmT += STEP;
      if (state.battle.deathConfirmT >= ZG.Const.DEATH_CONFIRM) {
        state.battle.deathConfirmT = ZG.Const.DEATH_CONFIRM;
        state.status = 'over';
        state.battle.reason = 'no-humans';
        state.stats.bestRound = Math.max(state.stats.bestRound || 1, state.round);
        state.bus.emit(ZG.Events.GAME_OVER, { round: state.round, reason: 'no-humans' });
      }
      return;
    }
    state.battle.deathConfirmT = 0;

    const remainingSpawns = ZG.Spawner.remaining(state);
    const zombiesAlive = state.zombies.filter(z => z.alive).length;
    if (remainingSpawns === 0 && zombiesAlive === 0) {
      state.battle.infectionTimer += STEP;
      if (state.battle.infectionTimer >= ZG.Const.ROUND_END_DELAY) {
        state.bus.emit(ZG.Events.BATTLE_CLEARED, { round: state.round });
        settleRound(state);
      }
    } else {
      state.battle.infectionTimer = 0;
    }
  }

  function settleRound(state) {
    const settledRound = state.round;
    let civilianIncome = 0;
    let passReward = 0;
    const killIncome = state.battle.killIncome || 0;
    const healed = [];

    // 1. 存活回血 30%
    for (const h of state.humans) {
      if (!h.alive) continue;
      const before = h.hp;
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.3);
      if (h.hp > before) healed.push({ id: h.id, amount: h.hp - before });
    }

    // 2. 感染隔离
    ZG.Infection.settlementClamp(state);

    // 3. 平民收入
    for (const h of state.humans) {
      if (h.alive && h.classId === 'civilian') {
        civilianIncome += (ZG.Data.humans.civilian.income || 12);
      }
    }
    if (civilianIncome) {
      state.money += civilianIncome;
      state.stats.totalEarned += civilianIncome;
    }

    // 4. 通关奖励
    passReward = ZG.Balance.roundReward(settledRound, state.tech.econ);
    state.money += passReward;
    state.stats.totalEarned += passReward;

    // 5. 队长晋升
    const promoted = [];
    if (settledRound % ZG.Const.CAPTAIN_EVERY === 0) {
      const got = ZG.Captains.promote(state, 3);
      for (const h of got) promoted.push(h.id);
    }

    // 6. 转化兵到期（不转化、不爆）
    let convertedExpired = false;
    for (let i = state.humans.length - 1; i >= 0; i--) {
      const h = state.humans[i];
      if (h.alive && h.converted && settledRound >= h.expireRound) {
        h.alive = false;
        state.humans.splice(i, 1);
        convertedExpired = true;
      }
    }
    if (convertedExpired && state.humans.filter(h => h.alive).length === 0) {
      state.status = 'over';
      state.battle.reason = 'converted-expired';
      state.stats.bestRound = Math.max(state.stats.bestRound || 1, settledRound);
      state.bus.emit(ZG.Events.GAME_OVER, { round: settledRound, reason: 'converted-expired' });
      return;
    }

    // 7. 建筑：护盾恢复、地雷重布、废墟清理
    for (const h of state.humans) {
      if (!h.alive) continue;
      if (h.maxShield > 0) {
        h.shield = h.maxShield;
        h.shieldBroken = false;
        if (h.baseAttack) h.attack = Object.assign({}, h.baseAttack);
        if (h.baseRole) h.role = h.baseRole;
      }
    }
    for (const b of state.buildings) {
      if (b.alive && b.typeId === 'mine') b.charges = ZG.Data.buildings.mine.mine.charges;
    }

    // 8. 清理尸体
    for (let i = state.humans.length - 1; i >= 0; i--) {
      if (!state.humans[i].alive) state.humans.splice(i, 1);
    }
    for (let i = state.zombies.length - 1; i >= 0; i--) {
      if (!state.zombies[i].alive) state.zombies.splice(i, 1);
    }

    state.lastSettlement = {
      round: settledRound,
      killIncome,
      civilianIncome,
      passReward,
      healed,
      promoted,
      total: killIncome + civilianIncome + passReward
    };

    state.round = settledRound + 1;
    state.status = 'prep';
    state.ui.paused = false;
    state.ui.selectedCard = null;
    state.ui.selectedHumanId = null;
    state.battle.infectionTimer = 0;
    state.stats.bestRound = Math.max(state.stats.bestRound || 1, settledRound);
    state.bus.emit(ZG.Events.ROUND_SETTLED, state.lastSettlement);
    state.bus.emit(ZG.Events.MONEY_CHANGED, { money: state.money, delta: civilianIncome + passReward });
  }

  function applyCommand(state, cmd) {
    if (!cmd || !cmd.op) return { ok: false, reason: 'bad-command' };
    let r;
    switch (cmd.op) {
      case 'recruit':
        r = ZG.Economy.recruit(state, cmd.classId, cmd.x, cmd.y);
        break;
      case 'sell':
        r = ZG.Economy.sell(state, cmd.humanId);
        break;
      case 'build':
        r = ZG.Economy.build(state, cmd.typeId, cmd.x, cmd.y, { vertical: !!cmd.vertical });
        break;
      case 'demolish':
        r = ZG.Economy.demolish(state, cmd.buildingId);
        break;
      case 'buyTech':
        r = ZG.Economy.buyTech(state, cmd.line);
        break;
      case 'moveHuman':
        r = ZG.Economy.moveHuman(state, cmd.humanId, cmd.x, cmd.y);
        break;
      case 'startRound':
        r = startRound(state);
        break;
      default:
        r = { ok: false, reason: 'unknown-op' };
    }
    if (r && r.ok) state.commands.push(JSON.parse(JSON.stringify(cmd)));
    return r;
  }

  function record(state) {
    return JSON.parse(JSON.stringify(state.commands));
  }

  function restart(state, opts) {
    const o = opts || {};
    return createGame({
      mapId: o.mapId || state.mapId,
      seed: o.seed === undefined ? state.seed : o.seed,
      quality: state.quality
    });
  }

  ZG.Sim = {
    createGame, startRound, step, tick, checkRoundEnd, settleRound,
    restart, applyCommand, record, resetRoundBattle
  };
})();
