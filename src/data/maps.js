/* 三张地图：郊区公路 / 医院广场 / 地铁站台 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const suburban = {
    id: 'suburban',
    name: '郊区公路',
    difficulty: 1,
    desc: '两条车道，四面来袭。新手教学图。',
    theme: { ground: '#1A2233', road: '#232D42', accent: '#2C3E57', obstacle: '#4A4038' },
    deploy: { kind: 'rect', x: 140, y: 520, w: 1000, h: 160 },
    obstacles: [
      { kind: 'circle', x: 420, y: 300, r: 36, theme: 'car' },
      { kind: 'circle', x: 860, y: 300, r: 36, theme: 'car' }
    ],
    terrain: [],
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
    obstacles: [],
    terrain: [
      { kind: 'circle', x: 300, y: 560, r: 100, theme: 'pool', infectionMul: 0.5 },
      { kind: 'circle', x: 980, y: 560, r: 100, theme: 'pool', infectionMul: 0.5 }
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
    obstacles: [
      { kind: 'circle', x: 380, y: 250, r: 40, theme: 'pillar' },
      { kind: 'circle', x: 380, y: 500, r: 40, theme: 'pillar' },
      { kind: 'circle', x: 700, y: 370, r: 40, theme: 'pillar' }
    ],
    terrain: [],
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
