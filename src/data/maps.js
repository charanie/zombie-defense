/* 三张地图：郊区公路 / 医院广场 / 地铁站台 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const suburban = {
    id: 'suburban',
    name: '郊区公路',
    difficulty: 1,
    desc: '两条车道，两个出生点。新手教学图。',
    theme: { ground: '#1A2233', road: '#232D42', accent: '#2C3E57', obstacle: '#4A4038' },
    deploy: { kind: 'rect', x: 140, y: 520, w: 1000, h: 160 },
    spawns: [{ x: 80, y: 80 }, { x: 1200, y: 80 }],
    obstacles: [
      { kind: 'circle', x: 420, y: 300, r: 36, theme: 'car' },
      { kind: 'circle', x: 860, y: 300, r: 36, theme: 'car' }
    ],
    terrain: [],
    slots: [
      { id: 's1', x: 260, y: 460 },
      { id: 's2', x: 420, y: 460 },
      { id: 's3', x: 580, y: 460 },
      { id: 's4', x: 740, y: 460 },
      { id: 's5', x: 900, y: 460 },
      { id: 's6', x: 1020, y: 460 }
    ],
    roads: [
      { x: 0, y: 210, w: 1280, h: 110 },
      { x: 0, y: 480, w: 1280, h: 40 }
    ]
  };

  const hospital = {
    id: 'hospital',
    name: '医院广场',
    difficulty: 2,
    desc: '四面受压；消毒池可降低感染获取。',
    theme: { ground: '#182130', road: '#243044', accent: '#2E4052', obstacle: '#4C566A' },
    deploy: { kind: 'circle', x: 640, y: 400, r: 170 },
    spawns: [{ x: 640, y: 60 }, { x: 80, y: 380 }, { x: 1200, y: 380 }],
    obstacles: [],
    terrain: [
      { kind: 'circle', x: 300, y: 560, r: 100, theme: 'pool', infectionMul: 0.5 },
      { kind: 'circle', x: 980, y: 560, r: 100, theme: 'pool', infectionMul: 0.5 }
    ],
    slots: [
      { id: 's1', x: 640, y: 120 },
      { id: 's2', x: 859, y: 225 },
      { id: 's3', x: 913, y: 462 },
      { id: 's4', x: 761, y: 652 },
      { id: 's5', x: 519, y: 652 },
      { id: 's6', x: 367, y: 462 },
      { id: 's7', x: 421, y: 225 }
    ],
    roads: []
  };

  const subway = {
    id: 'subway',
    name: '地铁站台',
    difficulty: 3,
    desc: '狭窄双通道，盾兵与喷火强势；巨人会拆穿防线。',
    theme: { ground: '#151C29', road: '#212B3B', accent: '#28374A', obstacle: '#546E7A' },
    deploy: { kind: 'rect', x: 930, y: 10, w: 300, h: 700 },
    spawns: [{ x: 70, y: 80 }, { x: 70, y: 640 }],
    obstacles: [
      { kind: 'circle', x: 380, y: 250, r: 40, theme: 'pillar' },
      { kind: 'circle', x: 380, y: 500, r: 40, theme: 'pillar' },
      { kind: 'circle', x: 700, y: 370, r: 40, theme: 'pillar' }
    ],
    terrain: [],
    slots: [
      { id: 's1', x: 220, y: 130 },
      { id: 's2', x: 220, y: 590 },
      { id: 's3', x: 470, y: 130 },
      { id: 's4', x: 470, y: 590 },
      { id: 's5', x: 620, y: 170 },
      { id: 's6', x: 620, y: 570 },
      { id: 's7', x: 810, y: 130 },
      { id: 's8', x: 810, y: 590 }
    ],
    roads: [
      { x: 0, y: 120, w: 930, h: 130 },
      { x: 0, y: 470, w: 930, h: 130 },
      { x: 820, y: 0, w: 110, h: 720 }
    ]
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.maps = { suburban, hospital, subway };
  ZG.Data.mapOrder = ['suburban', 'hospital', 'subway'];
})();
