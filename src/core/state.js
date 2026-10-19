/* 全局状态工厂与实体创建 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function armorMul(state) {
    return ZG.Balance.techMul('armor', state.tech.armor);
  }

  function create(opts) {
    const o = opts || {};
    const seed = o.seed === undefined ? 1 : (o.seed >>> 0);
    const mapId = o.mapId || 'suburban';
    const map = (ZG.Data.maps && ZG.Data.maps[mapId]) || null;
    const streams = ZG.Rng.createStreams(seed);

    const state = {
      version: 1,
      status: 'prep',
      mapId,
      map,
      seed,
      round: 1,
      money: ZG.Const.INITIAL_MONEY,
      tech: { fire: 0, armor: 0, econ: 0, serum: 0 },
      humans: [],
      zombies: [],
      buildings: [],
      projectiles: [],
      effects: [],
      spawner: { batches: [], batchIndex: 0, timer: 0, remaining: 0, warning: 0, bossPending: false, portals: [] },
      battle: {
        time: 0, killCount: 0, spawned: 0, berserkTier: 0, bossId: null,
        deathConfirmT: 0, infectionTimer: 0, convertedThisRound: 0,
        minesTriggered: 0, reason: null, waveTotal: 0
      },
      stats: {
        totalKills: 0, totalEarned: 0, bestRound: 1, captains: 0, heroes: 0,
        captainOverflow: 0, missilesFired: 0, heroStacks: {},
        zombieKillsByType: {}, bossKills: 0, buildingsLost: 0
      },
      rng: streams,
      ui: {
        selectedCard: null, selectedHumanId: null,
        panel: 'recruit', tooltip: null, speed: 1, paused: false, drag: null,
        wallVertical: false,
        mapHover: null, showCodex: false, showHelp: false, showSettings: false,
        tutorialStep: -1
      },
      settings: { damageNumbers: true, shake: true, muted: false, tutorialSeen: false },
      log: [],
      uid: 1,
      bus: ZG.EventBus.create(),
      pathing: null,
      spatial: null,
      commands: [],
      lastSettlement: null,
      quality: o.quality || 'desktop',
      woundedHeroes: []
    };

    state.spatial = ZG.Spatial ? ZG.Spatial.create() : null;
    return state;
  }

  function nextId(state) {
    return state.uid++;
  }

  function heroStacksOf(state, heroId) {
    return state.stats.heroStacks[heroId] || 0;
  }

  function spawnHuman(state, classId, x, y, extra) {
    const e = extra || {};
    const data = (ZG.Data.humans && ZG.Data.humans[classId]) ||
      (ZG.Data.heroes && ZG.Data.heroes[classId]);
    if (!data) throw new Error('unknown human class: ' + classId);

    const isHero = !!(data.hero || e.heroId || (ZG.Data.heroes && ZG.Data.heroes[classId]));
    const heroId = data.hero ? data.id : (e.heroId || null);
    const stacks = heroId ? heroStacksOf(state, heroId) : 0;
    const hpMul = armorMul(state) * (1 + 0.2 * stacks);
    const maxHp = (e.maxHp !== undefined ? e.maxHp : data.hp * hpMul);
    const converted = !!e.converted;

    const h = {
      id: nextId(state),
      kind: 'human',
      typeId: classId,
      classId,
      name: data.name,
      x, y,
      radius: data.radius || 8,
      hp: e.hp !== undefined ? e.hp : maxHp,
      maxHp,
      shield: 0,
      maxShield: 0,
      facing: -Math.PI / 2,
      alive: true,
      pop: isHero || converted ? 0 : (data.pop || 0),
      cost: data.cost || 0,
      attack: data.attack ? Object.assign({}, data.attack) : null,
      cd: 0,
      targetId: null,
      captain: false,
      hero: isHero,
      heroId,
      heroHpStacks: stacks,
      heroDmgStacks: (state.stats.heroStacks[heroId + ':dmg'] || 0),
      converted,
      expireRound: converted ? (e.expireRound !== undefined ? e.expireRound : state.round + 2) : 0,
      spawnRound: state.round,
      infection: 0,
      burnT: 0,
      burnDps: 0,
      ammo: data.attack && data.attack.ammo ? data.attack.ammo : 0,
      reloadT: 0,
      serumLeft: data.serumLeft !== undefined ? ZG.Balance.serumCount(state.tech.serum) : 0,
      serumCd: 0,
      healT: 0,
      inspireT: 0,
      warmup: data.attack && data.attack.warmup ? data.attack.warmup : 0,
      abilityUsed: false,
      abilityT: 0,
      dispelCd: 0,
      groupHealCd: 0,
      homeX: x,
      homeY: y,
      moveSpeed: data.moveSpeed || 60,
      vision: data.vision || 240,
      huntRadius: data.huntRadius || 240,
      dodgeEnabled: data.dodge !== false,
      aiState: 'guard',
      careTargetId: 0,
      careKind: null,
      moveX: 0,
      moveY: 0,
      dodgeT: 0,
      dodgeCd: 0,
      dodgeDirX: 0,
      dodgeDirY: 0,
      wounded: false,
      woundedUntilRound: 0,
      dmgMul: 1 + 0.15 * stacks,
      atkSpeedMul: 1
    };

    if (data.shieldHp) {
      h.shield = h.maxShield = data.shieldHp * armorMul(state);
    }
    if (e.converted) {
      h.pop = 0;
      h.captain = false;
      h.hero = false;
    }

    state.humans.push(h);
    state.bus.emit(ZG.Events.HUMAN_SPAWNED, { human: h });
    return h;
  }

  function spawnZombie(state, typeId, x, y, extra) {
    const e = extra || {};
    const data = ZG.Data.zombies[typeId];
    if (!data) throw new Error('unknown zombie: ' + typeId);
    const R = state.round;
    const isBoss = typeId === 'boss' || !!e.isBoss;

    let maxHp;
    if (e.maxHp !== undefined) maxHp = e.maxHp;
    else if (isBoss) maxHp = ZG.Balance.bossHp(R);
    else maxHp = ZG.Balance.zombieHp(data.hp, R);

    const z = {
      id: nextId(state),
      kind: 'zombie',
      typeId,
      name: data.name,
      x, y,
      radius: data.radius || 9,
      hp: e.hp !== undefined ? e.hp : maxHp,
      maxHp,
      shield: e.shield !== undefined ? e.shield : (data.shield || 0),
      maxShield: e.shield !== undefined ? e.shield : (data.shield || 0),
      facing: Math.PI / 2,
      alive: true,
      speed: data.speed,
      damage: isBoss ? 0 : data.damage,
      speedBase: data.speed,
      speedScale: isBoss ? 1 : ZG.Balance.zombieSpeed(1, R),
      damageBase: isBoss ? 0 : data.damage,
      damageScale: isBoss ? 1 : ZG.Balance.zombieDamage(1, R),
      bountyBase: e.bounty !== undefined ? e.bounty : (isBoss ? ZG.Balance.bossReward(R) : data.bounty),
      attackInterval: data.attackInterval || 1,
      cd: 0,
      specialCd: 0,
      targetId: null,
      sprinting: false,
      sprintT: 0,
      sprintTimer: 0,
      fuseT: 0,
      fuseArmed: false,
      isBoss,
      isSiege: !!data.isSiege,
      knockbackImmune: !!data.knockbackImmune,
      infection: data.infection || null,
      slowFactor: 0,
      permSlow: 0,
      berserkMul: 1,
      stuckT: 0,
      lastX: x,
      lastY: y,
      turnedFromHuman: !!e.turnedFromHuman,
      spawnRound: R,
      rockCd: e.rockCd !== undefined ? e.rockCd : 0,
      stompCd: 0,
      burnT: 0,
      burnDps: 0,
      flashT: 0,
      wave: e.wave || null
    };
    if (isBoss) z.damageBase = 0;
    state.zombies.push(z);
    state.battle.spawned++;
    state.bus.emit(ZG.Events.ZOMBIE_SPAWNED, { zombie: z });
    if (isBoss) {
      state.battle.bossId = z.id;
      state.bus.emit(ZG.Events.BOSS_SPAWNED, { zombie: z });
    }
    return z;
  }

  function spawnBuilding(state, typeId, x, y, opts) {
    const data = ZG.Data.buildings[typeId];
    if (!data) throw new Error('unknown building: ' + typeId);
    const o = opts || {};
    const vertical = !!o.vertical && data.rotatable !== false;
    const shape = data.shape || 'circle';
    const w = shape === 'rect' ? (vertical ? data.h : data.w) : (data.radius || 24) * 2;
    const h = shape === 'rect' ? (vertical ? data.w : data.h) : (data.radius || 24) * 2;
    const radius = data.radius || Math.max(w, h) / 2;
    const b = {
      id: nextId(state),
      kind: 'building',
      typeId,
      name: data.name,
      x, y, shape, w, h, vertical, radius,
      hp: data.hp,
      maxHp: data.hp,
      alive: true,
      cd: 0,
      charges: data.mine ? data.mine.charges : 0,
      isRubble: false,
      facing: 0
    };
    state.buildings.push(b);
    state.bus.emit(ZG.Events.BUILDING_BUILT, { building: b });
    return b;
  }

  function remove(state, entity) {
    entity.alive = false;
    if (entity.kind === 'human') {
      const i = state.humans.indexOf(entity);
      if (i >= 0) state.humans.splice(i, 1);
      if (entity.heroId) state.woundedHeroes.push(entity);
    } else if (entity.kind === 'zombie') {
      const i = state.zombies.indexOf(entity);
      if (i >= 0) state.zombies.splice(i, 1);
    } else if (entity.kind === 'building') {
      const i = state.buildings.indexOf(entity);
      if (i >= 0) state.buildings.splice(i, 1);
    }
  }

  function round4(v) { return Math.round(v * 10000) / 10000; }

  function snapshot(state) {
    const humans = state.humans
      .filter(h => h.alive)
      .map(h => ({
        id: h.id, c: h.classId, x: round4(h.x), y: round4(h.y),
        hp: round4(h.hp), inf: round4(h.infection), cap: h.captain ? 1 : 0,
        conv: h.converted ? 1 : 0, sh: round4(h.shield || 0),
        sb: h.shieldBroken ? 1 : 0
      }))
      .sort((a, b) => a.id - b.id);
    const zombies = state.zombies
      .filter(z => z.alive)
      .map(z => ({
        id: z.id, t: z.typeId, x: round4(z.x), y: round4(z.y),
        hp: round4(z.hp), sh: round4(z.shield)
      }))
      .sort((a, b) => a.id - b.id);
    const buildings = state.buildings
      .filter(b => b.alive)
      .map(b => ({ id: b.id, t: b.typeId, hp: round4(b.hp), ch: b.charges,
        x: round4(b.x), y: round4(b.y), w: b.w || 0, h: b.h || 0, v: b.vertical ? 1 : 0 }))
      .sort((a, b) => a.id - b.id);
    return {
      status: state.status,
      round: state.round,
      money: state.money,
      time: round4(state.battle.time),
      tech: state.tech,
      humans, zombies, buildings,
      proj: state.projectiles.filter(p => p.alive).map(p => ({
        id: p.id, t: p.typeId, x: round4(p.x), y: round4(p.y), ttl: round4(p.life || 0)
      })).sort((a, b) => a.id - b.id)
    };
  }

  function hash(state) {
    const str = JSON.stringify(snapshot(state));
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  ZG.State = { create, nextId, spawnHuman, spawnZombie, spawnBuilding, remove, snapshot, hash, heroStacksOf };
})();
