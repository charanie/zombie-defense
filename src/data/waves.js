/* 波次构成、预览与批次生成 */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const ORDER = ['walker', 'runner', 'shield', 'boomer', 'mother', 'giant'];
  const ELITE_ORDER = ['runner', 'shield', 'boomer', 'mother', 'giant'];
  const EDGES = ['top', 'right', 'bottom', 'left'];

  function spawnPoint(rng, edge) {
    const inset = ZG.Const.SPAWN_EDGE_INSET;
    const d = ZG.Const.SPAWN_OUT_MIN +
      rng.next() * (ZG.Const.SPAWN_OUT_MAX - ZG.Const.SPAWN_OUT_MIN);
    if (edge === 'top') return { x: inset + rng.next() * (ZG.Const.W - 2 * inset), y: -d, edge };
    if (edge === 'bottom') return { x: inset + rng.next() * (ZG.Const.W - 2 * inset), y: ZG.Const.H + d, edge };
    if (edge === 'left') return { x: -d, y: inset + rng.next() * (ZG.Const.H - 2 * inset), edge };
    return { x: ZG.Const.W + d, y: inset + rng.next() * (ZG.Const.H - 2 * inset), edge: 'right' };
  }

  function percents(R) {
    let p;
    if (R <= 2) p = [1, 0, 0, 0, 0, 0];
    else if (R === 3) p = [0.85, 0.15, 0, 0, 0, 0];
    else if (R === 4) p = [0.68, 0.15, 0.09, 0.08, 0, 0];
    else if (R === 5) p = [0.55, 0.16, 0.11, 0.10, 0.08, 0];
    else p = [0.45, 0.17, 0.13, 0.12, 0.08, 0.05];

    if (R >= 10) {
      const steps = Math.floor((R - 10) / 5) + 1;
      for (let i = 0; i < steps; i++) {
        if (p[0] <= 0.30) break;
        const move = Math.min(0.02, p[0] - 0.30);
        p[0] -= move;
        const idx = 1 + (i % ELITE_ORDER.length);
        p[idx] += move;
      }
    }
    return p;
  }

  function composition(R) {
    const N = 6 + 5 * R;
    const p = percents(R);
    const out = ORDER.map((t, i) => Math.floor(N * p[i]));
    let used = out.reduce((a, b) => a + b, 0);
    const rem = ORDER.map((t, i) => ({ i, r: N * p[i] - out[i] }));
    rem.sort((a, b) => (b.r - a.r) || (a.i - b.i));
    let k = 0;
    while (used < N && k < rem.length * 4) {
      out[rem[k % rem.length].i]++;
      used++;
      k++;
    }
    const obj = {};
    ORDER.forEach((t, i) => { obj[t] = out[i]; });
    return obj;
  }

  function total(R) { return 6 + 5 * R; }

  function isBossRound(R) { return R > 0 && R % ZG.Const.BOSS_EVERY === 0; }

  function escortCount(R) {
    return isBossRound(R) ? Math.round((6 + 5 * R) * 0.2) : 0;
  }

  function newTypes(R) {
    return ORDER.filter(t => ZG.Data.zombies[t].unlock === R);
  }

  function preview(R) {
    const counts = composition(R);
    const escort = escortCount(R);
    const boss = isBossRound(R);
    return {
      round: R,
      counts,
      boss,
      bossCount: boss ? 1 : 0,
      escort,
      total: total(R) + escort,
      newTypes: newTypes(R)
    };
  }

  function pickWeightedType(counts, rng) {
    let sum = 0;
    for (const t of ORDER) sum += counts[t] || 0;
    if (sum <= 0) return 'walker';
    let r = rng.next() * sum;
    for (const t of ORDER) {
      r -= counts[t] || 0;
      if (r <= 0) return t;
    }
    return 'walker';
  }

  function build(R, rng) {
    const counts = composition(R);
    const types = [];
    for (const t of ORDER) for (let i = 0; i < counts[t]; i++) types.push(t);

    const bossRound = isBossRound(R);
    const escort = escortCount(R);
    if (bossRound) {
      // BOSS 占一个护卫名额
      for (let i = 0; i < escort - 1; i++) types.push(pickWeightedType(counts, rng));
      types.push('boss');
    }

    rng.shuffle(types);

    const totalLen = types.length;
    let k = Math.max(1, Math.ceil(totalLen / ZG.Const.BATCH_MAX));
    // 保证每批 >= 6（只有总量很小的时候才例外）
    if (totalLen >= ZG.Const.BATCH_MIN) {
      k = Math.min(k, Math.floor(totalLen / ZG.Const.BATCH_MIN));
    }
    k = Math.max(1, k);

    const sizes = [];
    const base = Math.floor(totalLen / k);
    let rem = totalLen - base * k;
    for (let i = 0; i < k; i++) sizes.push(base + (rem > 0 ? 1 : 0) * (rem--, 1));

    // 切批
    const batches = [];
    let cursor = 0;
    for (let i = 0; i < k; i++) {
      const size = sizes[i];
      const chunk = types.slice(cursor, cursor + size);
      cursor += size;
      batches.push({
        spawns: chunk.map((t, j) => {
          const sp = spawnPoint(rng, EDGES[(i + j) % 4]);
          sp.type = t;
          return sp;
        })
      });
    }

    // BOSS 放到中间批次
    if (bossRound) {
      let bossBatch = -1, bossIdx = -1;
      for (let i = 0; i < batches.length; i++) {
        const idx = batches[i].spawns.findIndex(s => s.type === 'boss');
        if (idx >= 0) { bossBatch = i; bossIdx = idx; break; }
      }
      if (bossBatch >= 0) {
        const target = Math.floor(batches.length / 2);
        if (target !== bossBatch) {
          const b = batches[bossBatch].spawns.splice(bossIdx, 1)[0];
          if (batches[target].spawns.length < ZG.Const.BATCH_MAX) {
            batches[target].spawns.push(b);
          } else {
            const swap = batches[target].spawns.pop();
            batches[target].spawns.push(b);
            batches[bossBatch].spawns.push(swap);
          }
        }
      }
    }

    // 时间
    let at = ZG.Const.SPAWN_FIRST_DELAY;
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      if (i > 0) at += ZG.Const.BATCH_GAP_MIN + rng.next() * (ZG.Const.BATCH_GAP_MAX - ZG.Const.BATCH_GAP_MIN);
      b.at = at;
      b.portalAt = at - ZG.Const.SPAWN_WARN;
      b.warned = false;
    }

    return { batches, bossRound, total: totalLen, bossBatchIndex: Math.floor(batches.length / 2) };
  }

  ZG.Waves = { composition, total, isBossRound, escortCount, newTypes, preview, build, spawnPoint, ORDER };
})();
