/* Web Audio 程序音效（零音频文件） */
(function () {
  'use strict';
  const ZG = globalThis.ZG = globalThis.ZG || {};

  const NAMES = [
    'pistol', 'shotgun', 'mg', 'flame', 'rocket', 'explosion',
    'heal', 'infect', 'bossRoar', 'click', 'horn', 'coin',
    'dash', 'spit', 'summon',
    'missile', 'slash', 'stomp', 'rockBreak', 'fuse'
  ];

  function create(opts) {
    const o = opts || {};
    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let muted = false;
    let initializing = false;
    const lastPlayed = {};

    const api = {
      names: NAMES,
      init() {
        if (ctx || initializing) return ctx;
        initializing = true;
        try {
          const factory = o.ctxFactory ||
            (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
          if (!factory) { initializing = false; return null; }
          ctx = typeof factory === 'function' && !(factory.prototype && factory.prototype.createGain)
            ? factory() : new factory();
          if (!ctx) { initializing = false; return null; }
          master = ctx.createGain();
          master.gain.value = muted ? 0 : 0.18;
          master.connect(ctx.destination);
          // 噪声缓冲
          const len = Math.floor(ctx.sampleRate * 0.6);
          noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
          const data = noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        } catch (e) {
          ctx = null;
        }
        initializing = false;
        return ctx;
      },
      setMuted(v) {
        muted = !!v;
        if (master) master.gain.value = muted ? 0 : 0.18;
      },
      isMuted() { return muted; },
      resume() {
        try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { /* 忽略 */ }
      },
      play(name) {
        if (muted) return;
        if (!ctx) api.init();
        if (!ctx || !master) return;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const last = lastPlayed[name] || 0;
        if (now - last < 0.03) return;
        lastPlayed[name] = now;
        try {
          if (name === 'pistol' || name === 'mg') gunshot(0.035, name === 'mg' ? 900 : 620);
          else if (name === 'shotgun') gunshot(0.08, 300);
          else if (name === 'rocket') sweep(180, 60, 0.28, 'sawtooth', 0.16);
          else if (name === 'flame') noise(0.09, 1200, 0.08);
          else if (name === 'explosion') explosion();
          else if (name === 'heal') tone(660, 0.14, 'sine', 0.1);
          else if (name === 'infect') sweep(120, 90, 0.25, 'square', 0.08);
          else if (name === 'bossRoar') sweep(90, 38, 0.8, 'sawtooth', 0.22);
          else if (name === 'dash') sweep(520, 70, 0.22, 'sawtooth', 0.14);
          else if (name === 'spit') noise(0.11, 760, 0.09);
          else if (name === 'summon') sweep(58, 132, 0.45, 'sine', 0.15);
          else if (name === 'missile') { sweep(220, 900, 0.25, 'square', 0.1); sweep(90, 40, 0.5, 'sine', 0.18); }
          else if (name === 'slash') noise(0.09, 2600, 0.16);
          else if (name === 'stomp') { sweep(70, 34, 0.3, 'square', 0.2); noise(0.2, 180, 0.22); }
          else if (name === 'rockBreak') { noise(0.16, 480, 0.2); noise(0.22, 900, 0.12); }
          else if (name === 'fuse') { tone(1200, 0.04, 'square', 0.04); setTimeout(() => tone(900, 0.04, 'square', 0.03), 180); }
          else if (name === 'click') tone(880, 0.04, 'square', 0.05);
          else if (name === 'horn') horn();
          else if (name === 'coin') coin();
        } catch (e) { /* 忽略音频错误 */ }
      }
    };

    function tone(freq, dur, type, gain) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(gain || 0.1, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g); g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    }

    function gunshot(dur, cutoff) {
      if (!ctx || !noiseBuf) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, ctx.currentTime);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
      src.stop(ctx.currentTime + dur + 0.02);
    }

    function noise(dur, cutoff, gain) {
      if (!ctx || !noiseBuf) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
      src.stop(ctx.currentTime + dur + 0.02);
    }

    function explosion() {
      if (!ctx) return;
      noise(0.45, 220, 0.35);
      sweep(110, 32, 0.4, 'sine', 0.22);
    }

    function sweep(from, to, dur, type, gain) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(from, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), ctx.currentTime + dur);
      g.gain.setValueAtTime(gain || 0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g); g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.03);
    }

    function coin() {
      tone(1046, 0.06, 'sine', 0.08);
      setTimeout(() => tone(1568, 0.09, 'sine', 0.07), 55);
    }

    function horn() {
      if (!ctx) return;
      for (const f of [196, 294, 392]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.05, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
        osc.connect(g); g.connect(master);
        osc.start(); osc.stop(ctx.currentTime + 0.95);
      }
    }

    return api;
  }

  const singleton = create();
  ZG.Audio = Object.assign({ create }, {
    init: () => singleton.init(),
    play: n => singleton.play(n),
    setMuted: v => singleton.setMuted(v),
    isMuted: () => singleton.isMuted(),
    resume: () => singleton.resume(),
    names: NAMES
  });
})();
