/* ==========================================================
   internals.js — a clear circuit board etched behind the glass.
   Hairline copper traces, outlined chips and vias are drawn once
   to an offscreen canvas; signal pulses and LEDs animate on top.
   ========================================================== */
(function () {
  const canvas = document.getElementById("internals");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CELL = 26;
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  let W = 0, H = 0, DPR = 1;
  let board = null;
  let traces = [], pulses = [], leds = [];
  let pal = null;
  let raf = 0, last = 0;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function palette() {
    const dark = document.documentElement.dataset.theme === "dark";
    return dark
      ? {
          bg: "#0a0c0d",
          trace: "rgba(221, 151, 90, .20)", traceWide: "rgba(221, 151, 90, .30)",
          pad: "rgba(221, 151, 90, .45)",
          chipFill: "rgba(255, 255, 255, .025)", chipLine: "rgba(255, 255, 255, .16)",
          pin: "rgba(221, 151, 90, .5)", text: "rgba(255, 255, 255, .28)",
          grid: "rgba(255, 255, 255, .035)",
          pulse: [240, 170, 105], leds: [[79, 216, 180], [255, 120, 110]],
        }
      : {
          bg: "#e9edee",
          trace: "rgba(168, 100, 42, .30)", traceWide: "rgba(168, 100, 42, .42)",
          pad: "rgba(168, 100, 42, .6)",
          chipFill: "rgba(16, 22, 24, .03)", chipLine: "rgba(16, 22, 24, .26)",
          pin: "rgba(168, 100, 42, .6)", text: "rgba(16, 22, 24, .38)",
          grid: "rgba(16, 22, 24, .05)",
          pulse: [214, 128, 46], leds: [[14, 160, 120], [225, 70, 70]],
        };
  }

  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    pal = palette();

    const rand = rng(2077);
    const cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1;
    const used = new Uint8Array(cols * rows);
    const mark = (c, r) => { if (c >= 0 && r >= 0 && c < cols && r < rows) used[r * cols + c] = 1; };
    const free = (c, r) => c >= 1 && r >= 1 && c < cols - 1 && r < rows - 1 && !used[r * cols + c];

    board = document.createElement("canvas");
    board.width = canvas.width; board.height = canvas.height;
    const b = board.getContext("2d");
    b.scale(DPR, DPR);
    b.fillStyle = pal.bg;
    b.fillRect(0, 0, W, H);

    // fine dot grid, like a drafting mat under clear acrylic
    b.fillStyle = pal.grid;
    for (let x = CELL; x < W; x += CELL) for (let y = CELL; y < H; y += CELL) b.fillRect(x - .5, y - .5, 1, 1);

    // ---- chips ----
    const chips = [];
    const target = Math.max(3, Math.round((cols * rows) / 420));
    for (let i = 0; i < target * 6 && chips.length < target; i++) {
      const cw = 3 + Math.floor(rand() * 5), ch = 3 + Math.floor(rand() * 4);
      const c0 = 2 + Math.floor(rand() * (cols - cw - 4)), r0 = 2 + Math.floor(rand() * (rows - ch - 4));
      let ok = true;
      for (let r = r0 - 3; r < r0 + ch + 3 && ok; r++)
        for (let c = c0 - 3; c < c0 + cw + 3; c++)
          if (c >= 0 && r >= 0 && c < cols && r < rows && used[r * cols + c]) { ok = false; break; }
      if (!ok) continue;
      for (let r = r0 - 1; r <= r0 + ch; r++) for (let c = c0 - 1; c <= c0 + cw; c++) mark(c, r);
      chips.push({ c0, r0, cw, ch });
    }

    // ---- traces: routed random walks with 45° bends ----
    traces = [];
    const starts = [];
    chips.forEach((cp) => {
      for (let r = cp.r0; r < cp.r0 + cp.ch; r++) { starts.push({ c: cp.c0 - 2, r, d: 4, pin: true }); starts.push({ c: cp.c0 + cp.cw + 1, r, d: 0, pin: true }); }
      for (let c = cp.c0; c < cp.c0 + cp.cw; c++) { starts.push({ c, r: cp.r0 - 2, d: 6, pin: true }); starts.push({ c, r: cp.r0 + cp.ch + 1, d: 2, pin: true }); }
    });
    const extra = Math.round((cols * rows) / 55);
    for (let i = 0; i < extra; i++) starts.push({ c: Math.floor(rand() * cols), r: Math.floor(rand() * rows), d: Math.floor(rand() * 4) * 2 });

    starts.forEach((s) => {
      if (!free(s.c, s.r) || rand() < 0.2) return;
      let c = s.c, r = s.r, d = s.d, straight = 0;
      const pts = [[c, r]];
      mark(c, r);
      const maxLen = 5 + Math.floor(rand() * 30);
      for (let step = 0; step < maxLen; step++) {
        let nd = d;
        if (straight > 2 && rand() < 0.2) nd = (d + (rand() < 0.5 ? 1 : 7)) % 8;
        let [dc, dr] = DIRS[nd];
        if (!free(c + dc, r + dr)) { nd = d; [dc, dr] = DIRS[nd]; if (!free(c + dc, r + dr)) break; }
        straight = nd === d ? straight + 1 : 0;
        d = nd; c += dc; r += dr; mark(c, r);
        const prev = pts[pts.length - 1], prev2 = pts[pts.length - 2];
        if (prev2 && Math.sign(prev[0] - prev2[0]) === dc && Math.sign(prev[1] - prev2[1]) === dr) { prev[0] = c; prev[1] = r; }
        else pts.push([c, r]);
      }
      if (pts.length < 2) return;
      const px = pts.map(([pc, pr]) => [pc * CELL, pr * CELL]);
      const segs = []; let len = 0;
      for (let i = 1; i < px.length; i++) { const l = Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]); segs.push(l); len += l; }
      if (len < CELL * 3) return;
      traces.push({ pts: px, len, segs, wide: rand() < 0.1, pin: s.pin });
    });

    b.lineCap = "round"; b.lineJoin = "round";
    traces.forEach((t) => {
      b.strokeStyle = t.wide ? pal.traceWide : pal.trace;
      b.lineWidth = t.wide ? 2.4 : 1;
      b.beginPath(); b.moveTo(t.pts[0][0], t.pts[0][1]);
      for (let i = 1; i < t.pts.length; i++) b.lineTo(t.pts[i][0], t.pts[i][1]);
      b.stroke();
      // via: a hollow ring at the end
      const [ex, ey] = t.pts[t.pts.length - 1];
      b.strokeStyle = pal.pad; b.lineWidth = 1.2;
      b.beginPath(); b.arc(ex, ey, 3.2, 0, Math.PI * 2); b.stroke();
      if (!t.pin) { b.beginPath(); b.arc(t.pts[0][0], t.pts[0][1], 2.2, 0, Math.PI * 2); b.stroke(); }
    });

    // chips: outlined packages with fine pins
    b.font = "500 9px 'Geist Mono', ui-monospace, monospace";
    b.textAlign = "left"; b.textBaseline = "alphabetic";
    const names = ["MCU", "PMIC", "DSP", "RF-24", "USB-C", "FLASH", "LPDDR", "BLE", "CODEC", "IMU", "SoC"];
    chips.forEach((cp, i) => {
      const x = cp.c0 * CELL - CELL / 2, y = cp.r0 * CELL - CELL / 2, w = cp.cw * CELL, h = cp.ch * CELL;
      b.strokeStyle = pal.pin; b.lineWidth = 1;
      b.beginPath();
      for (let r = cp.r0; r < cp.r0 + cp.ch; r++) {
        b.moveTo(x - CELL * 1.5, r * CELL); b.lineTo(x, r * CELL);
        b.moveTo(x + w, r * CELL); b.lineTo(x + w + CELL * 1.5, r * CELL);
      }
      for (let c = cp.c0; c < cp.c0 + cp.cw; c++) {
        b.moveTo(c * CELL, y - CELL * 1.5); b.lineTo(c * CELL, y);
        b.moveTo(c * CELL, y + h); b.lineTo(c * CELL, y + h + CELL * 1.5);
      }
      b.stroke();
      b.fillStyle = pal.pin;
      for (let r = cp.r0; r < cp.r0 + cp.ch; r++) { b.fillRect(x - 6, r * CELL - 1.5, 6, 3); b.fillRect(x + w, r * CELL - 1.5, 6, 3); }
      for (let c = cp.c0; c < cp.c0 + cp.cw; c++) { b.fillRect(c * CELL - 1.5, y - 6, 3, 6); b.fillRect(c * CELL - 1.5, y + h, 3, 6); }
      rr(b, x, y, w, h, 3);
      b.fillStyle = pal.bg; b.fill();
      b.fillStyle = pal.chipFill; b.fill();
      b.strokeStyle = pal.chipLine; b.lineWidth = 1; b.stroke();
      b.fillStyle = pal.text;
      b.beginPath(); b.arc(x + 8, y + 8, 2, 0, Math.PI * 2); b.fill();
      b.fillText(names[i % names.length], x + 8, y + h - 18);
      b.fillText("U" + (i + 1) + " · " + (2100 + i * 37), x + 8, y + h - 7);
    });

    // passives: tiny outlined 0603 packages
    const smd = Math.round((cols * rows) / 90);
    for (let i = 0; i < smd; i++) {
      const c = 1 + Math.floor(rand() * (cols - 2)), r = 1 + Math.floor(rand() * (rows - 2));
      if (!free(c, r) || !free(c + 1, r)) continue;
      mark(c, r); mark(c + 1, r);
      b.save();
      b.translate(c * CELL + CELL / 2, r * CELL);
      if (rand() < 0.5) b.rotate(Math.PI / 2);
      b.fillStyle = pal.pad; b.fillRect(-9, -3, 4, 6); b.fillRect(5, -3, 4, 6);
      b.strokeStyle = pal.chipLine; b.lineWidth = 1; b.strokeRect(-5, -2.5, 10, 5);
      b.restore();
    }

    leds = [];
    for (let i = 0; i < Math.round(target * 1.4); i++) {
      const c = 1 + Math.floor(rand() * (cols - 2)), r = 1 + Math.floor(rand() * (rows - 2));
      if (!free(c, r)) continue;
      mark(c, r);
      leds.push({ x: c * CELL, y: r * CELL, phase: rand() * 6.28, speed: 0.5 + rand() * 1.4, color: pal.leds[i % pal.leds.length] });
    }

    pulses = [];
    const pool = traces.filter((t) => t.len > CELL * 6);
    const n = Math.min(pool.length, Math.max(8, Math.round(pool.length * 0.18)));
    for (let i = 0; i < n; i++) {
      const t = pool[Math.floor(rand() * pool.length)];
      pulses.push({ t, pos: rand() * t.len, speed: 50 + rand() * 90, tail: 30 + rand() * 40 });
    }
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function pointAt(t, d) {
    d = Math.max(0, Math.min(t.len, d));
    for (let i = 0; i < t.segs.length; i++) {
      if (d <= t.segs[i] || i === t.segs.length - 1) {
        const k = t.segs[i] ? d / t.segs[i] : 0, a = t.pts[i], b = t.pts[i + 1];
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
      d -= t.segs[i];
    }
    return t.pts[t.pts.length - 1];
  }

  function draw(dt, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(board, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineCap = "round";
    const [pr, pg, pb] = pal.pulse;

    pulses.forEach((p) => {
      p.pos += p.speed * dt;
      if (p.pos - p.tail > p.t.len) p.pos = 0;
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const a = pointAt(p.t, p.pos - (p.tail * i) / steps), b = pointAt(p.t, p.pos - (p.tail * (i + 1)) / steps);
        ctx.strokeStyle = `rgba(${pr},${pg},${pb},${(1 - i / steps) * 0.85})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const h = pointAt(p.t, p.pos);
      const g = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], 8);
      g.addColorStop(0, `rgba(${pr},${pg},${pb},.6)`); g.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h[0], h[1], 8, 0, Math.PI * 2); ctx.fill();
    });

    leds.forEach((l) => {
      const on = 0.2 + 0.8 * Math.max(0, Math.sin(time * l.speed + l.phase));
      const [r, g, bl] = l.color;
      const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 12);
      glow.addColorStop(0, `rgba(${r},${g},${bl},${0.55 * on})`); glow.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(l.x, l.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${r},${g},${bl},${0.5 + 0.5 * on})`;
      ctx.fillRect(l.x - 2.5, l.y - 1.5, 5, 3);
    });
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 30) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(dt, now / 1000);
  }

  function start() {
    cancelAnimationFrame(raf);
    build();
    if (reduceMotion) { draw(0, 0); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(start, 150); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduceMotion) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  const root = document.documentElement;
  window.addEventListener("pointermove", (e) => {
    root.style.setProperty("--mx", e.clientX + "px");
    root.style.setProperty("--my", e.clientY + "px");
  }, { passive: true });

  window.Internals = { redraw: start };
  start();
  // redraw once the mono font is in, so chip labels use it
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
})();
