/* ==========================================================
   internals.js — a procedurally generated circuit board that
   lives behind the glass. Static board is drawn once to an
   offscreen canvas; signal pulses and LEDs animate on top.
   ========================================================== */
(function () {
  const canvas = document.getElementById("internals");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CELL = 22;
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  let W = 0, H = 0, DPR = 1;
  let board = null;      // offscreen canvas
  let traces = [];       // [{pts:[[x,y]...], len, segs:[]}]
  let pulses = [];
  let leds = [];
  let palette = null;
  let raf = 0;
  let last = 0;

  // deterministic RNG so the board doesn't reshuffle on every resize
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function themePalette() {
    const light = document.documentElement.dataset.theme === "light";
    return light
      ? {
          bg1: "#cfe0df", bg2: "#e6efee",
          trace: "rgba(20, 110, 98, .30)", traceHi: "rgba(20, 110, 98, .55)",
          pad: "rgba(160, 120, 40, .55)", hole: "#e6efee",
          chip: "rgba(30, 60, 62, .42)", chipEdge: "rgba(255,255,255,.6)", chipText: "rgba(255,255,255,.45)",
          pin: "rgba(150, 130, 90, .8)", smd: "rgba(90, 70, 40, .55)",
          silk: "rgba(20, 60, 60, .25)",
          pulse: [11, 143, 124], led: [106, 79, 224],
        }
      : {
          bg1: "#06100f", bg2: "#0b1a1a",
          trace: "rgba(110, 220, 200, .16)", traceHi: "rgba(140, 243, 223, .30)",
          pad: "rgba(214, 178, 110, .45)", hole: "#06100f",
          chip: "rgba(14, 20, 22, .95)", chipEdge: "rgba(160, 230, 220, .18)", chipText: "rgba(180, 240, 230, .28)",
          pin: "rgba(214, 190, 140, .55)", smd: "rgba(200, 170, 110, .35)",
          silk: "rgba(200, 255, 245, .10)",
          pulse: [142, 243, 223], led: [185, 166, 255],
        };
  }

  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    palette = themePalette();

    const rand = rng(1337);
    const cols = Math.ceil(W / CELL) + 1;
    const rows = Math.ceil(H / CELL) + 1;
    const used = new Uint8Array(cols * rows);
    const mark = (c, r) => { if (c >= 0 && r >= 0 && c < cols && r < rows) used[r * cols + c] = 1; };
    const free = (c, r) => c >= 1 && r >= 1 && c < cols - 1 && r < rows - 1 && !used[r * cols + c];

    board = document.createElement("canvas");
    board.width = canvas.width;
    board.height = canvas.height;
    const b = board.getContext("2d");
    b.scale(DPR, DPR);

    // substrate
    const g = b.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, palette.bg1);
    g.addColorStop(1, palette.bg2);
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);

    // faint fiberglass weave
    b.strokeStyle = palette.silk;
    b.globalAlpha = 0.25;
    b.lineWidth = 1;
    for (let x = 0; x < W; x += CELL * 4) { b.beginPath(); b.moveTo(x + .5, 0); b.lineTo(x + .5, H); b.stroke(); }
    for (let y = 0; y < H; y += CELL * 4) { b.beginPath(); b.moveTo(0, y + .5); b.lineTo(W, y + .5); b.stroke(); }
    b.globalAlpha = 1;

    // ---- chips ----
    const chips = [];
    const chipCount = Math.max(4, Math.round((cols * rows) / 380));
    for (let i = 0; i < chipCount * 4 && chips.length < chipCount; i++) {
      const cw = 3 + Math.floor(rand() * 6);
      const ch = 3 + Math.floor(rand() * 5);
      const c0 = 2 + Math.floor(rand() * (cols - cw - 4));
      const r0 = 2 + Math.floor(rand() * (rows - ch - 4));
      let ok = true;
      for (let r = r0 - 2; r < r0 + ch + 2 && ok; r++)
        for (let c = c0 - 2; c < c0 + cw + 2; c++)
          if (c >= 0 && r >= 0 && c < cols && r < rows && used[r * cols + c]) { ok = false; break; }
      if (!ok) continue;
      for (let r = r0 - 1; r <= r0 + ch; r++) for (let c = c0 - 1; c <= c0 + cw; c++) mark(c, r);
      chips.push({ c0, r0, cw, ch });
    }

    // ---- traces (random walks with 45° bends) ----
    traces = [];
    const starts = [];
    chips.forEach((cp) => {
      // pins on left/right edges become trace starts
      for (let r = cp.r0; r < cp.r0 + cp.ch; r++) {
        starts.push({ c: cp.c0 - 2, r, d: 4 });
        starts.push({ c: cp.c0 + cp.cw + 1, r, d: 0 });
      }
      for (let c = cp.c0; c < cp.c0 + cp.cw; c++) {
        starts.push({ c, r: cp.r0 - 2, d: 6 });
        starts.push({ c, r: cp.r0 + cp.ch + 1, d: 2 });
      }
    });
    const extra = Math.round((cols * rows) / 40);
    for (let i = 0; i < extra; i++) {
      starts.push({ c: Math.floor(rand() * cols), r: Math.floor(rand() * rows), d: Math.floor(rand() * 4) * 2 });
    }

    starts.forEach((s) => {
      if (!free(s.c, s.r) || rand() < 0.25) return;
      let c = s.c, r = s.r, d = s.d;
      const pts = [[c, r]];
      mark(c, r);
      const maxLen = 6 + Math.floor(rand() * 34);
      let straight = 0;
      for (let step = 0; step < maxLen; step++) {
        let nd = d;
        if (straight > 2 && rand() < 0.18) nd = (d + (rand() < 0.5 ? 1 : 7)) % 8;
        let [dc, dr] = DIRS[nd];
        if (!free(c + dc, r + dr)) {
          nd = d; [dc, dr] = DIRS[nd];
          if (!free(c + dc, r + dr)) break;
        }
        straight = nd === d ? straight + 1 : 0;
        d = nd; c += dc; r += dr;
        mark(c, r);
        const prev = pts[pts.length - 1];
        const prev2 = pts[pts.length - 2];
        if (prev2 && Math.sign(prev[0] - prev2[0]) === dc && Math.sign(prev[1] - prev2[1]) === dr) {
          prev[0] = c; prev[1] = r; // extend the current segment
        } else {
          pts.push([c, r]);
        }
      }
      if (pts.length < 2) return;
      const px = pts.map(([pc, pr]) => [pc * CELL, pr * CELL]);
      let len = 0;
      const segs = [];
      for (let i = 1; i < px.length; i++) {
        const l = Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]);
        segs.push(l); len += l;
      }
      if (len < CELL * 3) return;
      traces.push({ pts: px, len, segs, wide: rand() < 0.12 });
    });

    // draw traces
    b.lineCap = "round";
    b.lineJoin = "round";
    traces.forEach((t) => {
      b.strokeStyle = t.wide ? palette.traceHi : palette.trace;
      b.lineWidth = t.wide ? 3.2 : 1.6;
      b.beginPath();
      b.moveTo(t.pts[0][0], t.pts[0][1]);
      for (let i = 1; i < t.pts.length; i++) b.lineTo(t.pts[i][0], t.pts[i][1]);
      b.stroke();
      // via at the end, pad at the start
      const [ex, ey] = t.pts[t.pts.length - 1];
      b.fillStyle = palette.pad;
      b.beginPath(); b.arc(ex, ey, 4, 0, Math.PI * 2); b.fill();
      b.fillStyle = palette.hole;
      b.beginPath(); b.arc(ex, ey, 1.6, 0, Math.PI * 2); b.fill();
    });

    // draw chips
    b.font = "500 9px 'JetBrains Mono', monospace";
    b.textAlign = "center";
    b.textBaseline = "middle";
    const names = ["MCU", "PMIC", "DSP", "RF", "USB-C", "FLASH", "DDR4", "BT/WIFI", "CODEC", "IMU", "GPU", "SoC"];
    chips.forEach((cp, i) => {
      const x = cp.c0 * CELL - CELL * 0.5, y = cp.r0 * CELL - CELL * 0.5;
      const w = cp.cw * CELL, h = cp.ch * CELL;
      // pins
      b.fillStyle = palette.pin;
      for (let r = cp.r0; r < cp.r0 + cp.ch; r++) {
        b.fillRect(x - 9, r * CELL - 1.5, 9, 3);
        b.fillRect(x + w, r * CELL - 1.5, 9, 3);
        // connect pin to trace start
        b.fillRect(x - CELL * 1.5, r * CELL - 0.8, CELL * 1.5 - 9, 1.6);
        b.fillRect(x + w + 9, r * CELL - 0.8, CELL * 1.5 - 9, 1.6);
      }
      for (let c = cp.c0; c < cp.c0 + cp.cw; c++) {
        b.fillRect(c * CELL - 1.5, y - 9, 3, 9);
        b.fillRect(c * CELL - 1.5, y + h, 3, 9);
        b.fillRect(c * CELL - 0.8, y - CELL * 1.5, 1.6, CELL * 1.5 - 9);
        b.fillRect(c * CELL - 0.8, y + h + 9, 1.6, CELL * 1.5 - 9);
      }
      // body
      roundRect(b, x, y, w, h, 4);
      b.fillStyle = palette.chip; b.fill();
      b.strokeStyle = palette.chipEdge; b.lineWidth = 1; b.stroke();
      // pin-1 dot + label
      b.fillStyle = palette.chipText;
      b.beginPath(); b.arc(x + 7, y + 7, 2, 0, Math.PI * 2); b.fill();
      b.fillText(names[i % names.length], x + w / 2, y + h / 2 - 5);
      b.fillText("TR-" + (100 + i * 7), x + w / 2, y + h / 2 + 7);
    });

    // scattered SMD passives
    const smdCount = Math.round((cols * rows) / 70);
    for (let i = 0; i < smdCount; i++) {
      const c = 1 + Math.floor(rand() * (cols - 2)), r = 1 + Math.floor(rand() * (rows - 2));
      if (!free(c, r) || !free(c + 1, r)) continue;
      mark(c, r); mark(c + 1, r);
      const x = c * CELL, y = r * CELL;
      const vertical = rand() < 0.5;
      b.save();
      b.translate(x + CELL / 2, y);
      if (vertical) b.rotate(Math.PI / 2);
      b.fillStyle = palette.pad;
      b.fillRect(-9, -3.5, 5, 7);
      b.fillRect(4, -3.5, 5, 7);
      b.fillStyle = palette.smd;
      b.fillRect(-4, -3, 8, 6);
      b.restore();
    }

    // LEDs
    leds = [];
    for (let i = 0; i < Math.round(chipCount * 1.5); i++) {
      const c = 1 + Math.floor(rand() * (cols - 2)), r = 1 + Math.floor(rand() * (rows - 2));
      if (!free(c, r)) continue;
      mark(c, r);
      leds.push({ x: c * CELL, y: r * CELL, phase: rand() * Math.PI * 2, speed: 0.6 + rand() * 1.6 });
    }

    // pulses on a subset of traces
    pulses = [];
    const candidates = traces.filter((t) => t.len > CELL * 6);
    const count = Math.min(candidates.length, Math.max(10, Math.round(candidates.length * 0.22)));
    for (let i = 0; i < count; i++) {
      const t = candidates[Math.floor(rand() * candidates.length)];
      pulses.push({ t, pos: rand() * t.len, speed: 40 + rand() * 110, tail: 26 + rand() * 40 });
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function pointAt(t, d) {
    d = Math.max(0, Math.min(t.len, d));
    for (let i = 0; i < t.segs.length; i++) {
      if (d <= t.segs[i] || i === t.segs.length - 1) {
        const k = t.segs[i] ? d / t.segs[i] : 0;
        const a = t.pts[i], b = t.pts[i + 1];
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
      d -= t.segs[i];
    }
    return t.pts[t.pts.length - 1];
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    if (now - last < 30) return; // ~30fps is plenty for ambience
    last = now;
    draw(dt, now / 1000);
  }

  function draw(dt, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(board, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineCap = "round";
    const [pr, pg, pb] = palette.pulse;

    pulses.forEach((p) => {
      p.pos += p.speed * dt;
      if (p.pos - p.tail > p.t.len) p.pos = 0;
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const a = pointAt(p.t, p.pos - (p.tail * i) / steps);
        const b = pointAt(p.t, p.pos - (p.tail * (i + 1)) / steps);
        const alpha = (1 - i / steps) * 0.9;
        ctx.strokeStyle = `rgba(${pr},${pg},${pb},${alpha})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const head = pointAt(p.t, p.pos);
      const glow = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 10);
      glow.addColorStop(0, `rgba(${pr},${pg},${pb},.75)`);
      glow.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(head[0], head[1], 10, 0, Math.PI * 2); ctx.fill();
    });

    const [lr, lg, lb] = palette.led;
    leds.forEach((l) => {
      const on = 0.25 + 0.75 * Math.max(0, Math.sin(time * l.speed + l.phase));
      const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 14);
      glow.addColorStop(0, `rgba(${lr},${lg},${lb},${0.8 * on})`);
      glow.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(l.x, l.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * on})`;
      ctx.fillRect(l.x - 2, l.y - 1.5, 4, 3);
    });
  }

  function start() {
    cancelAnimationFrame(raf);
    build();
    if (reduceMotion) { draw(0, 0); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(start, 150);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduceMotion) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  // the clear "lens" in the frosted pane follows the pointer
  const root = document.documentElement;
  window.addEventListener("pointermove", (e) => {
    root.style.setProperty("--mx", e.clientX + "px");
    root.style.setProperty("--my", e.clientY + "px");
  }, { passive: true });

  window.Internals = { redraw: start };
  start();
})();
