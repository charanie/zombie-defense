/* 鼠标 / 键盘 / 触控输入 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  function toWorld(canvas, ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * ZG.Const.W,
      y: ((ev.clientY - r.top) / r.height) * ZG.Const.H
    };
  }

  function pickEntity(state, p) {
    let best = null, bestD = 1e9;
    for (const h of state.humans) {
      if (!h.alive) continue;
      const d = ZG.Geom.dist2(p.x, p.y, h.x, h.y);
      const r = h.radius + 6;
      if (d <= r * r && d < bestD) { bestD = d; best = { kind: 'human', id: h.id, entity: h }; }
    }
    for (const z of state.zombies) {
      if (!z.alive) continue;
      const d = ZG.Geom.dist2(p.x, p.y, z.x, z.y);
      const r = z.radius + 6;
      if (d <= r * r && d < bestD) { bestD = d; best = { kind: 'zombie', id: z.id, entity: z }; }
    }
    for (const b of state.buildings) {
      if (!b.alive) continue;
      let d, r;
      if (b.shape === 'rect') {
        const br = ZG.Geom.rectOfBuilding(b);
        d = ZG.Geom.distPointToRect(p.x, p.y, br.x, br.y, br.w, br.h);
        r = 4;
      } else {
        d = ZG.Geom.dist(p.x, p.y, b.x, b.y);
        r = (b.radius || 24) + 4;
      }
      if (d <= r && d < bestD) { bestD = d; best = { kind: 'building', id: b.id, entity: b }; }
    }
    return best;
  }

  function init(canvas, stateOrGetter, callbacks) {
    const getState = typeof stateOrGetter === 'function' ? stateOrGetter : () => stateOrGetter;
    const cb = callbacks || {};

    function state() { return getState(); }

    function cancelSelection() {
      const s = state();
      if (!s) return;
      s.ui.selectedCard = null;
      s.ui.selectedBuilding = null;
      s.ui.selectedHumanId = null;
      s.ui.selectedBuildingId = null;
      s.ui.drag = null;
    }

    canvas.addEventListener('pointermove', ev => {
      const s = state();
      if (!s || s.ui.showMenu) return;
      const p = toWorld(canvas, ev);
      s.ui.mouse = p;

      const drag = s.ui.drag;
      if (drag) {
        const h = s.humans.find(u => u.id === drag.id && u.alive);
        if (h) {
          const c = ZG.Geom.clampToWorld(p.x, p.y, h.radius);
          h.x = c.x; h.y = c.y;
        }
        return;
      }

      const hit = pickEntity(s, p);
      if (hit) {
        s.ui.hover = { kind: hit.kind, id: hit.id, x: hit.entity.x, y: hit.entity.y };
        canvas.style.cursor = hit.kind === 'human' && s.status === 'prep' ? 'grab' : 'pointer';
      } else {
        s.ui.hover = null;
        canvas.style.cursor = (s.ui.selectedCard && s.status === 'prep') ? 'crosshair' : 'default';
      }
    });

    canvas.addEventListener('pointerleave', () => {
      const s = state();
      if (s) { s.ui.hover = null; s.ui.mouse = null; }
    });

    canvas.addEventListener('pointerdown', ev => {
      if (ev.button === 2) return;
      const s = state();
      if (!s || s.ui.showMenu) return;
      const p = toWorld(canvas, ev);
      const ui = s.ui;

      // 放置人类
      if (ui.selectedCard && ZG.Data.humans[ui.selectedCard]) {
        const id = ui.selectedCard;
        const r = ZG.Sim.applyCommand(s, { op: 'recruit', classId: id, x: p.x, y: p.y });
        if (r.ok) {
          ZG.Audio.play('click');
          if (s.money < ZG.Data.humans[id].cost) ui.selectedCard = null;
        } else {
          ZG.HUD.toast(reasonText(r.reason), 'warn');
        }
        return;
      }

      // 建造
      if (ui.selectedBuilding && ZG.Data.buildings[ui.selectedBuilding]) {
        const r = ZG.Sim.applyCommand(s, {
          op: 'build',
          typeId: ui.selectedBuilding,
          x: p.x,
          y: p.y,
          vertical: !!ui.wallVertical
        });
        if (r.ok) {
          ZG.Audio.play('click');
          ZG.HUD.toast(ZG.Data.buildings[ui.selectedBuilding].name + ' 建造完成', 'ok');
          ui.selectedBuilding = null;
        } else {
          ZG.HUD.toast(reasonText(r.reason), 'warn');
        }
        return;
      }

      const hit = pickEntity(s, p);

      if (hit) {
        ui.hover = { kind: hit.kind, id: hit.id, x: hit.entity.x, y: hit.entity.y };
      }
      if (hit && hit.kind === 'human') {
        ui.selectedHumanId = hit.id;
        ui.selectedBuildingId = null;
        if (s.status === 'prep') {
          ui.drag = { id: hit.id, sx: hit.entity.x, sy: hit.entity.y };
          canvas.style.cursor = 'grabbing';
        }
        return;
      }
      if (hit && hit.kind === 'building') {
        ui.selectedBuildingId = hit.id;
        ui.selectedHumanId = null;
        return;
      }
      if (hit && hit.kind === 'zombie') {
        ui.selectedHumanId = null;
        ui.selectedBuildingId = null;
        return;
      }

      ui.selectedHumanId = null;
      ui.selectedBuildingId = null;
    });

    canvas.addEventListener('pointerup', () => {
      const s = state();
      if (!s) return;
      const drag = s.ui.drag;
      if (!drag) return;
      const h = s.humans.find(u => u.id === drag.id && u.alive);
      if (h) {
        const check = ZG.Economy.canPlace(s, h.x, h.y, h.radius, h.id);
        if (!check.ok) {
          h.x = drag.sx; h.y = drag.sy;
          ZG.HUD.toast('不能放在这里', 'warn');
        } else {
          h.homeX = h.x; h.homeY = h.y;
        }
      }
      s.ui.drag = null;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      cancelSelection();
    });

    window.addEventListener('keydown', ev => {
      const s = state();
      if (!s) return;
      const tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (ev.code === 'Space') {
        ev.preventDefault();
        cb.onPause && cb.onPause();
      } else if (ev.key === '1' || ev.key === '2' || ev.key === '3') {
        cb.onSpeed && cb.onSpeed(parseInt(ev.key, 10));
      } else if (ev.key === 'Tab') {
        ev.preventDefault();
        cb.onPanelNext && cb.onPanelNext();
      } else if (ev.key === 'm' || ev.key === 'M') {
        cb.onMute && cb.onMute();
      } else if (ev.key === 'h' || ev.key === 'H') {
        cb.onHelp && cb.onHelp();
      } else if (ev.key === 'r' || ev.key === 'R') {
        if (s.ui.selectedBuilding === 'barricade') {
          s.ui.wallVertical = !s.ui.wallVertical;
          ZG.HUD.toast(s.ui.wallVertical ? '竖墙' : '横墙', 'info');
        }
      } else if (ev.key === 'Escape') {
        if (s.ui.showHelp || s.ui.showSettings) cb.onCloseModal && cb.onCloseModal();
        else cancelSelection();
      }
    });
  }

  function reasonText(reason) {
    const map = {
      money: '金钱不足', population: '人口已满', 'civilian-cap': '平民已满',
      outside: '地图外', overlap: '位置重叠', obstacle: '障碍阻挡',
      limit: '已达上限', 'not-prep': '战斗中不能操作'
    };
    return map[reason] || '无法执行';
  }

  ZG.Input = { init, pickEntity, toWorld };
})();
