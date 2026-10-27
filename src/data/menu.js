/* 开始流程的纯数据：主菜单文案、模式/动作、地图简报、剧情占位、开场文案
 *
 * 约束：不访问 DOM / window / localStorage；不参与任何模拟公式。
 * mapBriefs[id].mix 是“威胁构成估计”，三项之和恒为 100（tests/menu.test.js 兜底）。
 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  ZG.Data = ZG.Data || {};
  ZG.Data.menu = {
    topBadge: { zone: 'QUARANTINE ZONE 07', signal: 'SIGNAL LOST', clock: '03:47:12', temp: '17°C' },
    hero: {
      title: '尸潮防线',
      en: 'ZOMBIE DEFENSE',
      tagline: '最后一道防线，由你决定它倒下的方式。'
    },
    feed: { title: '战区监视', en: 'SECTOR FEED', cam: 'CAM-03', mode: 'THERMAL', uplink: 93 },
    modes: [
      {
        id: 'endless', name: '无尽模式', en: 'ENDLESS DEFENSE', sub: '3 个作战区域',
        badge: '3 MAPS', available: true
      },
      {
        id: 'story', name: '剧情模式', en: 'STORY MODE', sub: 'CHAPTER 00',
        badge: 'LOCKED', available: false, soon: '即将开放'
      }
    ],
    actions: [
      { id: 'codex', name: '战地图鉴', en: 'CODEX', sub: '单位 / 威胁 / 操作', badge: 'ARCHIVE', action: 'help' },
      { id: 'settings', name: '系统设置', en: 'SETTINGS', sub: '音效 / 画面 / 存档', badge: 'CONFIG', action: 'settings' }
    ],
    mapBriefs: {
      suburban: {
        codename: 'SUBURBAN HIGHWAY',
        tags: ['开阔', '四向', '教学'],
        loadout: '2 手枪兵 · 1 盾兵 · 1 机枪兵',
        note: '先占住公路中线，盾兵朝向来袭方向。',
        tip: '开阔地形，优先拉开射界；不要堆在一个角落。',
        mix: [62, 22, 16],
        hostiles: '四面来袭'
      },
      hospital: {
        codename: 'HOSPITAL PLAZA',
        tags: ['感染', '广场', '中距'],
        loadout: '2 手枪兵 · 1 霰弹兵 · 1 治疗兵',
        note: '治疗兵放在消毒池边缘，优先点感染单位。',
        tip: '掩体少，用建筑制造拐角，别让喷火兵贴脸。',
        mix: [48, 18, 34],
        hostiles: '四面来袭'
      },
      subway: {
        codename: 'SUBWAY PLATFORM',
        tags: ['狭窄', '双通道', '高危'],
        loadout: '1 盾兵 · 2 喷火兵（第 2 回合补导弹兵）',
        note: '盾兵堵北通道，喷火覆盖南通道，导弹兵留到第 2 回合处理巨人。',
        tip: '窄口是优势也是陷阱，两只盾兵不要叠在同一格。',
        mix: [35, 15, 50],
        hostiles: '2 通道 · 西侧'
      }
    },
    copy: {
      selectBack: '← 返回主菜单',
      selectCrumb: '无尽模式 / 选择战场',
      selectTitle: '选择战场',
      selectSub: '三条防线。三份遗书。选择你的死法。',
      selectFootLeft: '所有战区已解锁 · 记录自动保存',
      selectFootRight: '选择后播放开场 · 可跳过',
      keys: '↑↓ 选择　ENTER 确认　ESC 返回',
      skip: '跳过 ▸',
      enter: '进入 →',
      back: '返回',
      locked: '待解锁',
      teaserTitle: '档案封存',
      teaserEn: 'CLASSIFIED',
      teaserSub: '剧情模式 · 序章',
      teaserFoot: '剧情模式将在后续版本开放。'
    },
    story: {
      id: 'story',
      title: '剧情模式',
      chapterTitle: '序章：撤离命令',
      blurb: '指挥链已经断了。你是最后一支还能收到命令的小队。',
      chapters: [
        { id: 'ch01', name: '撤离命令', mapId: 'suburban', locked: true },
        { id: 'ch02', name: '隔离区', mapId: 'hospital', locked: true },
        { id: 'ch03', name: '巢穴', mapId: 'subway', locked: true }
      ]
    }
  };
})();
