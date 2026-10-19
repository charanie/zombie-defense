/* 6 种建筑 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const buildings = {
    barricade: {
      id: 'barricade', name: '围墙', cost: 50, hp: 800,
      shape: 'rect', w: 64, h: 24, blocks: true, rotatable: true, limit: 10,
      color: '#8D6E63', symbol: '墙', blurb: '阻挡僵尸；可切换横/竖；不再减速',
      counters: '普通丧尸（绕行/阻挡）', weak: '巨人、母体'
    },
    turret: {
      id: 'turret', name: '哨塔', cost: 200, hp: 500, radius: 20, limit: 3,
      color: '#78909C', symbol: '塔', blurb: '自动火力 40 DPS；射程 280',
      attack: { damage: 10, interval: 0.25, range: 280, damageKind: 'ranged' },
      counters: '所有普通单位', weak: '巨人、母体'
    },
    hospital: {
      id: 'hospital', name: '医疗站', cost: 150, hp: 400, radius: 24, limit: 2,
      color: '#4DB6AC', symbol: '医', blurb: '半径 200：+8 HP/s，感染 -1/s',
      heal: { radius: 200, rate: 8, infection: 1 },
      counters: '感染、消耗战', weak: '巨人、母体'
    },
    ammo: {
      id: 'ammo', name: '弹药库', cost: 160, hp: 450, radius: 24, limit: 2,
      color: '#FFB300', symbol: '弹', blurb: '半径 220：+15% 攻速、+10% 射程',
      buff: { radius: 220, attackSpeed: 0.15, range: 0.10 },
      counters: '输出集群', weak: '巨人、母体'
    },
    tarpit: {
      id: 'tarpit', name: '减速陷阱', cost: 90, hp: 300, radius: 24, limit: 3,
      color: '#5C6BC0', symbol: '慢', blurb: '半径 120：僵尸 -35% 速度',
      slow: { radius: 120, amount: 0.35 }, blocks: false,
      counters: '狂尸、爆尸', weak: '巨人、母体'
    },
    mine: {
      id: 'mine', name: '地雷阵', cost: 120, hp: 250, radius: 24, limit: 3,
      color: '#A1887F', symbol: '雷', blurb: '3 次触发，半径 80 爆炸；每回合重布',
      mine: { charges: 3, radius: 80, damage: 120 }, blocks: false,
      counters: '密集群、幼体', weak: '巨人、母体'
    }
  };

  ZG.Data = ZG.Data || {};
  ZG.Data.buildings = buildings;
  ZG.Data.buildingOrder = ['barricade', 'turret', 'hospital', 'ammo', 'tarpit', 'mine'];
})();
