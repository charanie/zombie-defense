/* 三张地图：郊区公路 / 医院广场 / 地铁站台
 *
 * 数据分层：
 *   obstacles  唯一碰撞真相（circle / rect + theme）
 *   zones      人类与僵尸可活动区矩形并集（仅地铁；缺省 = 全图）
 *   spawns     僵尸出生口（仅地铁；缺省 = 四边屏幕外随机）
 *   decor      纯视觉，不参与碰撞；scatter 项用固定 seed 的 LCG 生成
 *   terrain    特殊地形（消毒池等），不阻挡
 *
 * decor 字段约定：
 *   线/带：{kind,y,x,w,h,vertical,dash,gap}
 *   点：  {kind,x,y}
 *   矩形：{kind,x,y,w,h}
 *   噪声：{kind,seed,count,area:{x,y,w,h},color,r}
 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const suburban = {
    id: 'suburban',
    name: '郊区公路',
    difficulty: 1,
    desc: '一条双向公路，四面无遮挡；废弃车辆与路障把火力走廊切开。',
    theme: {
      ground: '#1C241F', road: '#2A2C2E', accent: '#3B3D40',
      obstacle: '#4A4038', zone: '#2F3A31', line: '#C9B458'
    },
    roads: [
      { x: 0, y: 180, w: 1280, h: 340 },
      { x: 0, y: 160, w: 1280, h: 20 },
      { x: 0, y: 520, w: 1280, h: 20 }
    ],
    obstacles: [
      { kind: 'circle', x: 420, y: 300, r: 36, theme: 'car' },
      { kind: 'circle', x: 860, y: 300, r: 36, theme: 'car' },
      { kind: 'rect', x: 585, y: 222, w: 110, h: 56, theme: 'truck' },
      { kind: 'rect', x: 250, y: 480, w: 80, h: 26, theme: 'barrier' },
      { kind: 'rect', x: 1050, y: 480, w: 80, h: 26, theme: 'barrier' },
      { kind: 'circle', x: 1140, y: 250, r: 22, theme: 'tires' }
    ],
    terrain: [],
    decor: [
      { kind: 'lane', y: 270, x: 0, w: 1280, dash: 48, gap: 34 },
      { kind: 'lane', y: 430, x: 0, w: 1280, dash: 48, gap: 34 },
      { kind: 'doubleLine', y: 350, x: 0, w: 1280 },
      { kind: 'zebra', x: 230, y: 180, w: 60, h: 340 },
      { kind: 'zebra', x: 990, y: 180, w: 60, h: 340 },
      { kind: 'guardrail', y: 172, x: 0, w: 1280 },
      { kind: 'guardrail', y: 528, x: 0, w: 1280 },
      { kind: 'lamp', x: 160, y: 150 }, { kind: 'lamp', x: 620, y: 150 },
      { kind: 'lamp', x: 1080, y: 150 }, { kind: 'lamp', x: 160, y: 540 },
      { kind: 'lamp', x: 620, y: 540 }, { kind: 'lamp', x: 1080, y: 540 },
      { kind: 'cone', x: 300, y: 420 }, { kind: 'cone', x: 340, y: 432 },
      { kind: 'cone', x: 380, y: 444 }, { kind: 'cone', x: 900, y: 200 },
      { kind: 'cone', x: 940, y: 212 }, { kind: 'cone', x: 980, y: 224 },
      { kind: 'billboard', x: 1110, y: 60, w: 140, h: 80 },
      { kind: 'sign', x: 60, y: 120 },
      { kind: 'grass', seed: 11, count: 18, area: { x: 0, y: 0, w: 1280, h: 720 }, color: '#2E4630', r: 4 },
      { kind: 'crack', seed: 12, count: 10, area: { x: 0, y: 180, w: 1280, h: 340 }, color: '#1A1C1D', r: 26 },
      { kind: 'oil', seed: 13, count: 6, area: { x: 40, y: 200, w: 1200, h: 300 }, color: '#15181A', r: 12 },
      { kind: 'tire', seed: 14, count: 8, area: { x: 0, y: 180, w: 1280, h: 340 }, color: '#202223', r: 18 }
    ]
  };

  const hospital = {
    id: 'hospital',
    name: '医院广场',
    difficulty: 2,
    desc: '十字广场四面受压；消毒池降低感染，喷泉与花坛切割射界。',
    theme: {
      ground: '#1B2230', road: '#27313F', accent: '#33404F',
      obstacle: '#4C566A', zone: '#2A3442', line: '#D8E2EF'
    },
    roads: [
      { x: 0, y: 260, w: 1280, h: 200 },
      { x: 540, y: 0, w: 200, h: 720 }
    ],
    obstacles: [
      { kind: 'circle', x: 640, y: 360, r: 46, theme: 'fountain' },
      { kind: 'rect', x: 430, y: 480, w: 70, h: 40, theme: 'planter' },
      { kind: 'rect', x: 780, y: 480, w: 70, h: 40, theme: 'planter' },
      { kind: 'rect', x: 430, y: 200, w: 70, h: 40, theme: 'planter' },
      { kind: 'rect', x: 780, y: 200, w: 70, h: 40, theme: 'planter' },
      { kind: 'rect', x: 1030, y: 200, w: 100, h: 50, theme: 'van' },
      { kind: 'circle', x: 200, y: 300, r: 22, theme: 'tree' },
      { kind: 'circle', x: 1080, y: 300, r: 22, theme: 'tree' }
    ],
    terrain: [
      { kind: 'circle', x: 300, y: 560, r: 100, theme: 'pool', infectionMul: 0.5 },
      { kind: 'circle', x: 980, y: 560, r: 100, theme: 'pool', infectionMul: 0.5 }
    ],
    decor: [
      { kind: 'plazaTiles', x: 440, y: 260, w: 400, h: 200, tile: 32 },
      { kind: 'cross', x: 500, y: 360, size: 26 },
      { kind: 'cross', x: 780, y: 360, size: 26 },
      { kind: 'parking', x: 990, y: 170, w: 130, h: 70, slots: 4 },
      { kind: 'bench', x: 360, y: 280, w: 64, h: 16 },
      { kind: 'bench', x: 856, y: 280, w: 64, h: 16 },
      { kind: 'wheelchair', x: 420, y: 440 },
      { kind: 'trash', x: 860, y: 440 },
      { kind: 'sign', x: 580, y: 120 },
      { kind: 'canopy', x: 880, y: 440, w: 130, h: 60 },
      { kind: 'planterDetails', x: 430, y: 480, w: 70, h: 40 },
      { kind: 'planterDetails', x: 780, y: 200, w: 70, h: 40 },
      { kind: 'blood', seed: 21, count: 8, area: { x: 300, y: 220, w: 680, h: 380 }, color: '#5A1F22', r: 18 },
      { kind: 'puddle', seed: 22, count: 10, area: { x: 0, y: 0, w: 1280, h: 720 }, color: '#2C3B4C', r: 20 }
    ]
  };

  const subway = {
    id: 'subway',
    name: '地铁站台',
    difficulty: 3,
    desc: '两条站台通道，僵尸只从西侧隧道涌入；柱子和长椅既是掩体也是陷阱。',
    theme: {
      ground: '#121820', road: '#202932', accent: '#2B3742',
      obstacle: '#546E7A', zone: '#2B3540', line: '#E6C34A'
    },
    roads: [
      { x: 0, y: 160, w: 1000, h: 140 },
      { x: 0, y: 420, w: 1000, h: 140 },
      { x: 1000, y: 160, w: 240, h: 400 }
    ],
    obstacles: [
      { kind: 'circle', x: 400, y: 180, r: 22, theme: 'pillar' },
      { kind: 'circle', x: 560, y: 540, r: 22, theme: 'pillar' },
      { kind: 'circle', x: 1110, y: 230, r: 26, theme: 'pillar' },
      { kind: 'circle', x: 1110, y: 490, r: 26, theme: 'pillar' },
      { kind: 'rect', x: 700, y: 162, w: 100, h: 22, theme: 'bench' },
      { kind: 'rect', x: 780, y: 536, w: 100, h: 22, theme: 'bench' }
    ],
    terrain: [],
    decor: [
      { kind: 'track', x: 0, y: 0, w: 1000, h: 160, gap: 22 },
      { kind: 'track', x: 0, y: 560, w: 1000, h: 160, gap: 22 },
      { kind: 'platformLine', x: 0, y: 292, w: 1000, h: 8, dash: 26, gap: 18 },
      { kind: 'platformLine', x: 0, y: 420, w: 1000, h: 8, dash: 26, gap: 18 },
      { kind: 'tunnel', x: 0, y: 160, w: 80, h: 140 },
      { kind: 'tunnel', x: 0, y: 420, w: 80, h: 140 },
      { kind: 'kiosk', x: 880, y: 190, w: 70, h: 50 },
      { kind: 'lightbox', x: 200, y: 300, w: 90, h: 10 },
      { kind: 'lightbox', x: 200, y: 410, w: 90, h: 10 },
      { kind: 'vending', x: 950, y: 440, w: 36, h: 56 },
      { kind: 'sign', x: 820, y: 296 },
      { kind: 'sign', x: 820, y: 414 },
      { kind: 'gate', x: 1010, y: 440, w: 80, h: 24 }
    ],
    zones: [
      { id: 'north', x: -80, y: 160, w: 1080, h: 140 },
      { id: 'south', x: -80, y: 420, w: 1080, h: 140 },
      { id: 'hall', x: 1000, y: 160, w: 240, h: 400 }
    ]
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.maps = { suburban, hospital, subway };
  ZG.Data.mapOrder = ['suburban', 'hospital', 'subway'];
})();
