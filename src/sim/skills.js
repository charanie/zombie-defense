/* 职业技能、生命分支、复活/尸爆与场外援助（纯模拟） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};
  const STEP = ZG.Const.STEP_SEC;

  function mods(state) { return ZG.Tech.mods(state); }

  function resetRound(state) {
    const m = mods(state);
    for (const h of state.humans) {
      if (!h.alive) continue;
      h.skillT = 0;
      h.skillTickT = 0;
      h.skillTickN = 0;
      h.focusTargetId = 0;
      h.focusStacks = 0;
      h.focusT = 0;
      h.rocketDouble = 0;
      h.guardT = 0;
      h.guardMul = 1;
      h.reviveRound = 0;
      h.skillAtkMul = 1;
      if (h.heroId === 'officer') {
        h.skillUses = m.hero.officerUses;
        h.skillCd = 0;
      } else if (h.heroId === 'gatling') {
        h.skillUses = 0;
        h.skillCd = m.hero.gatlingInterval * m.skillCdMul;
      } else if (h.heroId === 'plague') {
        h.skillUses = 0;
        h.skillCd = m.hero.plagueInterval * m.skillCdMul;
      } else {
        h.skillUses = 0;
        h.skillCd = 0;
      }
    }
  }

  function stepRegen(state) {
    const m = mods(state);
    if (!(m.regenPct > 0)) return;
    state.battle.regenT = (state.battle.regenT === undefined ? 5 : state.battle.regenT) - STEP;
    if (state.battle.regenT > 0) return;
    state.battle.regenT = 5;
    for (const h of state.humans) {
      if (!h.alive) continue;
      ZG.Combat.heal(state, h, h.maxHp * m.regenPct);
    }
  }

  function onDeath(state, h) {
    const m = mods(state);
    if (!h || h.hero || h.captain) return { revived: false, exploded: false };

    if (m.reviveChance > 0 && h.reviveRound !== state.round &&
        state.rng.tech.chance(m.reviveChance)) {
      h.reviveRound = state.round;
      h.hp = h.maxHp * 0.4;
      h.infection = 0;
      h.poisonT = 0;
      h.poisonDps = 0;
      h.burnT = 0;
      h.burnDps = 0;
      state.battle.revives = (state.battle.revives || 0) + 1;
      state.bus.emit('fx:revive', { x: h.x, y: h.y, human: h });
      return { revived: true, exploded: false };
    }

    if (m.boomChance > 0 && state.rng.tech.chance(m.boomChance)) {
      ZG.Projectiles.explode(state, h.x, h.y, m.boomRadius,
        ZG.Balance.deathBoomDamage(state.round), ZG.Const.DAMAGE.EXPLOSION,
        { color: '#66BB6A', kind: 'death_boom' });
      return { revived: false, exploded: true };
    }

    return { revived: false, exploded: false };
  }

  // 职业主动技：Task 5 接入；未购买任何主动节点时保持空转。
  function stepHuman() {}
  function onAttack() {}

  // 场外援助：Task 6 接入。
  function castSupport() { return { ok: false, reason: 'locked' }; }

  ZG.Skills = { resetRound, stepHuman, onAttack, onDeath, castSupport, stepRegen };
})();
