/* 英雄奖励：优先未拥有、集齐后强化、重伤回归 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function ownedTypes(state) {
    const set = new Set();
    for (const h of state.humans) {
      if (h.alive && h.heroId) set.add(h.heroId);
    }
    for (const h of state.woundedHeroes) {
      if (h.heroId && h.wounded) set.add(h.heroId);
    }
    return set;
  }

  function spawnHero(state, heroId) {
    const c = ZG.Geom.deployCenter(state.map.deploy);
    const angle = (state.stats.heroes || 0) * 1.7;
    const x = c.x + Math.cos(angle) * 26;
    const y = c.y + Math.sin(angle) * 26;
    const h = ZG.State.spawnHuman(state, heroId, x, y, { heroId });
    state.stats.heroes = (state.stats.heroes || 0) + 1;
    state.bus.emit(ZG.Events.HERO_GRANTED, { human: h, heroId });
    state.bus.emit(ZG.Events.UI_TOAST, {
      text: '英雄加入：' + h.name, kind: 'hero'
    });
    return h;
  }

  function buffDuplicate(state, heroId) {
    state.stats.heroStacks[heroId] = (state.stats.heroStacks[heroId] || 0) + 1;
    const key = heroId + ':dmg';
    state.stats.heroStacks[key] = (state.stats.heroStacks[key] || 0) + 1;
    const heroes = state.humans.filter(h => h.alive && h.heroId === heroId);
    for (const h of heroes) {
      h.heroHpStacks = (h.heroHpStacks || 0) + 1;
      h.maxHp *= 1.2;
      h.hp *= 1.2;
      h.heroDmgStacks = (h.heroDmgStacks || 0) + 1;
      h.dmgMul += 0.15;
    }
    state.bus.emit(ZG.Events.UI_TOAST, {
      text: '重复英雄强化：' + ZG.Data.heroes[heroId].name + ' +20% 生命 / +15% 伤害',
      kind: 'hero'
    });
    return heroes[0] || null;
  }

  function grant(state) {
    const order = ZG.Data.heroOrder;
    const owned = ownedTypes(state);
    const missing = order.filter(id => !owned.has(id));

    let heroId;
    if (missing.length) {
      heroId = state.rng.hero.pick(missing);
      return spawnHero(state, heroId);
    }

    // 集齐后重复强化
    heroId = state.rng.hero.pick(order);
    const alive = state.humans.filter(h => h.alive && h.heroId === heroId);
    if (alive.length) return buffDuplicate(state, heroId);

    // 该英雄正在重伤：只叠加属性，回归时生效
    state.stats.heroStacks[heroId] = (state.stats.heroStacks[heroId] || 0) + 1;
    state.stats.heroStacks[heroId + ':dmg'] =
      (state.stats.heroStacks[heroId + ':dmg'] || 0) + 1;
    return null;
  }

  function onHeroDeath(state, hero) {
    hero.wounded = true;
    hero.woundedUntilRound = state.round + 1;
    if (state.woundedHeroes.indexOf(hero) < 0) state.woundedHeroes.push(hero);
  }

  function returnWounded(state) {
    const out = [];
    for (let i = state.woundedHeroes.length - 1; i >= 0; i--) {
      const h = state.woundedHeroes[i];
      if (!h.wounded) continue;
      if (state.round > h.woundedUntilRound) {
        h.wounded = false;
        h.alive = true;
        h.hp = h.maxHp * 0.5;
        h.infection = 0;
        const c = ZG.Geom.deployCenter(state.map.deploy);
        h.x = c.x; h.y = c.y; h.homeX = c.x; h.homeY = c.y;
        if (state.humans.indexOf(h) < 0) state.humans.push(h);
        state.woundedHeroes.splice(i, 1);
        state.bus.emit(ZG.Events.UI_TOAST, {
          text: h.name + ' 重伤痊愈，重返战场', kind: 'hero'
        });
        out.push(h);
      }
    }
    return out;
  }

  ZG.Heroes = { grant, onHeroDeath, returnWounded, ownedTypes };
})();
