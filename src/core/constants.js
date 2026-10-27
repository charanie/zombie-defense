/* 尸潮防线 — 全局常量与调色板 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const COLORS = {
    bg: '#0E1420',
    ground: '#1A2233',
    grid: '#22304A',
    road: '#232D42',
    human: {
      pistol: '#4FC3F7',
      shotgun: '#FFB74D',
      mg: '#81C784',
      flame: '#FF7043',
      rocket: '#BA68C8',
      shield: '#90A4AE',
      medic: '#F06292',
      civilian: '#FFF176',
      officer: '#FFD54F',
      samurai: '#EF9A9A',
      gatling: '#A5D6A7',
      plague: '#B39DDB'
    },
    zombie: {
      walker: '#7CB342',
      runner: '#C0CA33',
      shield: '#6D4C41',
      boomer: '#E53935',
      mother: '#8E24AA',
      giant: '#33691E',
      baby: '#AED581',
      boss: '#37474F',
      bossRipper: '#8E1B1B',
      bossSpitter: '#6B7F3A',
      bossBrood: '#5E3A5E',
      turned: '#9CCC65'
    },
    infection: '#AB47BC',
    shield: '#42A5F5',
    gold: '#FFD54F',
    danger: '#EF5350',
    heal: '#66BB6A',
    text: '#E6EDF7',
    dim: '#8FA3BF',
    captain: '#FFC107',
    hero: '#FF8A65'
  };

  ZG.Const = Object.freeze({
    VERSION: 'v1.6.0',
    W: 1280,
    H: 720,
    STEP_MS: 1000 / 60,
    STEP_SEC: 1 / 60,
    GRID: 32,
    GRID_COLS: 40,
    GRID_ROWS: 23,
    HASH_CELL: 64,
    MAX_STEPS_PER_FRAME: 5,

    ZOMBIE_CAP_DESKTOP: 300,
    ZOMBIE_CAP_MOBILE: 200,
    PARTICLE_CAP_DESKTOP: 250,
    PARTICLE_CAP_MOBILE: 120,
    DAMAGE_NUMBER_CAP: 50,
    MAX_EFFECTS: 400,
    MAX_EFFECTS_MOBILE: 200,
    PATH_H_WEIGHT: 10,
    PATH_V_WEIGHT: 12,

    MAX_POP: 80,
    MAX_CIVILIANS: 8,
    MAX_CAPTAINS: 8,
    MAX_HEROES: 4,
    MAX_CONVERTED: 15,
    CONVERT_PER_ROUND: 5,
    INITIAL_MONEY: 400,
    INITIAL_POP_CAP: 10,

    STUCK_SEC: 8,
    BERSERK_AT: 180,
    BERSERK_INTERVAL: 30,
    ROUND_HARD_CAP: 240,
    ROUND_END_DELAY: 3,
    DEATH_CONFIRM: 1,

    BATCH_MIN: 6,
    BATCH_MAX: 12,
    BATCH_GAP_MIN: 5,
    BATCH_GAP_MAX: 8,
    SPAWN_FIRST_DELAY: 5,
    SPAWN_WARN: 1,
    SPAWN_OUT_MIN: 10,
    SPAWN_OUT_MAX: 60,
    SPAWN_EDGE_INSET: 20,
    SPAWN_WORLD_MARGIN: 80,
    PATH_REFRESH_STEPS: 15,
    PLACE_MARGIN: 4,
    PLACE_GAP: 2,

    BOSS_EVERY: 7,
    CAPTAIN_EVERY: 3,

    DAMAGE: Object.freeze({
      RANGED: 'ranged',
      MELEE: 'melee',
      FIRE: 'fire',
      EXPLOSION: 'explosion',
      POISON: 'poison'
    }),

    COLORS: Object.freeze(COLORS)
  });
})();
