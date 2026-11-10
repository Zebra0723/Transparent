/* ==========================================================
   seed.js — sample mods & ideas. Seed "photos" are generated
   SVG illustrations of clear-shell devices so the site looks
   alive before anyone uploads real pictures.
   ========================================================== */
(function () {
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // a little PCB drawn inside a box
  function pcb(x, y, w, h, hue, rand, opts = {}) {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opts.rx ?? 10}" fill="hsl(${hue} 45% 14% / .9)" stroke="hsl(${hue} 70% 60% / .35)"/>`;
    // traces
    for (let i = 0; i < 26; i++) {
      let px = x + 8 + rand() * (w - 16), py = y + 8 + rand() * (h - 16);
      let d = `M${px.toFixed(1)} ${py.toFixed(1)}`;
      for (let k = 0; k < 3; k++) {
        const horiz = rand() < 0.5;
        const len = 10 + rand() * 50;
        if (horiz) px = Math.max(x + 6, Math.min(x + w - 6, px + (rand() < 0.5 ? -len : len)));
        else py = Math.max(y + 6, Math.min(y + h - 6, py + (rand() < 0.5 ? -len : len)));
        const dg = 6 + rand() * 10;
        if (rand() < 0.5) { px = Math.min(x + w - 6, px + dg); py = Math.min(y + h - 6, py + dg); }
        d += ` L${px.toFixed(1)} ${py.toFixed(1)}`;
      }
      s += `<path d="${d}" fill="none" stroke="hsl(${hue} 80% 70% / ${(0.25 + rand() * 0.45).toFixed(2)})" stroke-width="${rand() < 0.15 ? 2.4 : 1.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.4" fill="hsl(40 60% 60% / .7)"/>`;
    }
    // chips
    const n = opts.chips ?? 3;
    for (let i = 0; i < n; i++) {
      const cw = 22 + rand() * Math.min(60, w * 0.3), ch = 18 + rand() * Math.min(40, h * 0.25);
      const cx = x + 10 + rand() * (w - cw - 20), cy = y + 10 + rand() * (h - ch - 20);
      s += `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="3" fill="#0c1112" stroke="hsl(${hue} 50% 70% / .35)"/>`;
      for (let p = 0; p < cw - 6; p += 5) {
        s += `<rect x="${(cx + 3 + p).toFixed(1)}" y="${(cy - 3).toFixed(1)}" width="2" height="3" fill="hsl(40 50% 65% / .7)"/>`;
        s += `<rect x="${(cx + 3 + p).toFixed(1)}" y="${(cy + ch).toFixed(1)}" width="2" height="3" fill="hsl(40 50% 65% / .7)"/>`;
      }
      s += `<circle cx="${(cx + 5).toFixed(1)}" cy="${(cy + 5).toFixed(1)}" r="1.5" fill="#ffffff44"/>`;
    }
    // LEDs
    for (let i = 0; i < 4; i++) {
      const lx = x + 10 + rand() * (w - 20), ly = y + 10 + rand() * (h - 20);
      const lh = (hue + 140 + rand() * 60) % 360;
      s += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="9" fill="url(#led${lh.toFixed(0)})"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8" fill="#fff"/>`;
      s += `<defs><radialGradient id="led${lh.toFixed(0)}"><stop offset="0" stop-color="hsl(${lh} 100% 70% / .9)"/><stop offset="1" stop-color="hsl(${lh} 100% 70% / 0)"/></radialGradient></defs>`;
    }
    return s;
  }

  const shell = (hue) => `fill="hsl(${hue} 60% 85% / .10)" stroke="hsl(${hue} 80% 92% / .65)" stroke-width="2"`;

  const DEVICES = {
    handheld(h, r) {
      return pcb(225, 70, 190, 330, h, r, { chips: 3 }) +
        `<rect x="210" y="40" width="220" height="370" rx="26" ${shell(h)}/>` +
        `<rect x="238" y="70" width="164" height="128" rx="8" fill="hsl(${h} 30% 8% / .85)" stroke="#ffffff40"/>` +
        `<rect x="250" y="82" width="140" height="104" rx="3" fill="hsl(${h} 70% 60% / .22)"/>` +
        `<path d="M262 262h16v-16h16v16h16v16h-16v16h-16v-16h-16z" fill="#ffffff22" stroke="#ffffff80"/>` +
        `<circle cx="372" cy="258" r="14" fill="#ffffff1a" stroke="#ffffff90"/><circle cx="344" cy="282" r="14" fill="#ffffff1a" stroke="#ffffff90"/>` +
        `<rect x="290" y="340" width="26" height="8" rx="4" fill="#ffffff22" stroke="#ffffff70"/><rect x="326" y="340" width="26" height="8" rx="4" fill="#ffffff22" stroke="#ffffff70"/>`;
    },
    keyboard(h, r) {
      let keys = "";
      for (let row = 0; row < 5; row++) for (let c = 0; c < 14; c++) {
        if (row === 4 && c > 3 && c < 10) { if (c === 4) keys += `<rect x="${92 + 4 * 33}" y="${148 + row * 36}" width="${6 * 33 - 5}" height="30" rx="6" fill="#ffffff12" stroke="#ffffff70"/>`; continue; }
        keys += `<rect x="${92 + c * 33}" y="${148 + row * 36}" width="28" height="30" rx="6" fill="#ffffff12" stroke="#ffffff70"/>`;
      }
      return pcb(84, 140, 472, 186, h, r, { chips: 2, rx: 6 }) +
        `<rect x="70" y="124" width="500" height="218" rx="18" ${shell(h)}/>` + keys;
    },
    phone(h, r) {
      return pcb(250, 70, 140, 140, h, r, { chips: 3 }) +
        `<rect x="252" y="220" width="136" height="150" rx="10" fill="hsl(${h} 30% 30% / .35)" stroke="#ffffff50"/>` +
        `<text x="320" y="300" text-anchor="middle" font-family="monospace" font-size="11" fill="#ffffff70">Li-ion 3.85V</text>` +
        `<rect x="236" y="44" width="168" height="352" rx="30" ${shell(h)}/>` +
        `<rect x="254" y="62" width="58" height="58" rx="14" fill="#0a0f10cc" stroke="#ffffffa0"/>` +
        `<circle cx="270" cy="78" r="9" fill="#0b1416" stroke="#ffffff80"/><circle cx="296" cy="104" r="9" fill="#0b1416" stroke="#ffffff80"/>`;
    },
    controller(h, r) {
      return pcb(200, 150, 240, 120, h, r, { chips: 2 }) +
        `<path d="M200 140c-60 0-100 40-112 120-10 70 30 110 70 90 30-16 40-60 82-60h160c42 0 52 44 82 60 40 20 80-20 70-90-12-80-52-120-112-120z" ${shell(h)}/>` +
        `<circle cx="215" cy="210" r="28" fill="#ffffff14" stroke="#ffffff90"/><circle cx="380" cy="268" r="28" fill="#ffffff14" stroke="#ffffff90"/>` +
        `<circle cx="440" cy="180" r="11" fill="#ffffff18" stroke="#ffffff90"/><circle cx="470" cy="206" r="11" fill="#ffffff18" stroke="#ffffff90"/><circle cx="410" cy="206" r="11" fill="#ffffff18" stroke="#ffffff90"/><circle cx="440" cy="232" r="11" fill="#ffffff18" stroke="#ffffff90"/>`;
    },
    console(h, r) {
      let vents = "";
      for (let i = 0; i < 14; i++) vents += `<rect x="${150 + i * 25}" y="96" width="12" height="4" rx="2" fill="#ffffff40"/>`;
      return pcb(140, 120, 360, 200, h, r, { chips: 4, rx: 4 }) +
        `<circle cx="430" cy="220" r="52" fill="none" stroke="#ffffff60" stroke-dasharray="4 6"/><circle cx="430" cy="220" r="10" fill="#ffffff30"/>` +
        `<rect x="120" y="80" width="400" height="260" rx="22" ${shell(h)}/>` + vents +
        `<circle cx="160" cy="312" r="8" fill="hsl(${h} 90% 70%)"/>`;
    },
    earbuds(h, r) {
      return pcb(230, 210, 180, 110, h, r, { chips: 2 }) +
        `<rect x="210" y="110" width="220" height="230" rx="80" ${shell(h)}/>` +
        `<line x1="214" y1="200" x2="426" y2="200" stroke="#ffffff70" stroke-width="1.5"/>` +
        `<ellipse cx="275" cy="168" rx="26" ry="34" fill="#ffffff16" stroke="#ffffffa0"/><ellipse cx="365" cy="168" rx="26" ry="34" fill="#ffffff16" stroke="#ffffffa0"/>` +
        `<circle cx="275" cy="160" r="8" fill="hsl(${h} 70% 70% / .6)"/><circle cx="365" cy="160" r="8" fill="hsl(${h} 70% 70% / .6)"/>`;
    },
    board(h, r) {
      return pcb(110, 70, 420, 310, h, r, { chips: 6, rx: 14 }) +
        `<rect x="96" y="56" width="448" height="338" rx="20" fill="none" stroke="#ffffff30" stroke-dasharray="6 8"/>`;
    },
  };

  function art(kind, hue, seed) {
    const r = rng(seed);
    const body = (DEVICES[kind] || DEVICES.board)(hue, r);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 450">
      <defs>
        <radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="hsl(${hue} 40% 16%)"/><stop offset="1" stop-color="hsl(${hue} 50% 4%)"/></radialGradient>
        <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <rect width="640" height="450" fill="url(#bg)"/>
      <ellipse cx="320" cy="420" rx="250" ry="22" fill="hsl(${hue} 80% 60% / .12)"/>
      ${body}
      <rect width="640" height="450" fill="url(#gloss)"/>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\s{2,}/g, " "));
  }

  const day = 864e5;
  const now = Date.now();

  function mods() {
    return [
      {
        title: "Crystal Clear Handheld", device: "Game Boy Color", category: "Handhelds", difficulty: 2, hours: 3,
        kind: "handheld", hue: 172,
        description: "Swapped the original purple shell for an ultra-clear polycarbonate one and added an IPS backlit screen. The mainboard, speaker and contrast wheel are all visible, and the new backlight spills light through the case at night.",
        parts: ["Clear polycarbonate shell", "IPS backlit screen kit", "Tri-wing + Phillips #00", "Clear silicone buttons", "Kapton tape"],
        steps: ["Remove the batteries and open the shell with a tri-wing driver", "Desolder the speaker and move the board over", "Install the IPS kit and trim the shell's inner ribs", "Route the ribbon cable with Kapton tape so it sits flat", "Close up and test every button"],
        tags: ["retro", "backlight", "beginner-friendly"], author: "pixelglass", likes: 128, age: 2,
      },
      {
        title: "Ghost Keyboard 65%", device: "Custom 65% mechanical", category: "Keyboards", difficulty: 3, hours: 8,
        kind: "keyboard", hue: 200,
        description: "Acrylic sandwich case, frosted-clear keycaps and a hot-swap PCB with per-key RGB. With the lights off the whole board looks like glass; switch them on and you can follow every trace.",
        parts: ["Clear acrylic stacked case", "Hot-swap 65% PCB (south-facing RGB)", "Clear-housing linear switches", "Frosted PBT keycaps", "Poron plate foam (trimmed)"],
        steps: ["Flash firmware and test every key before assembly", "Lube and install stabilisers", "Layer the acrylic case with the PCB in the middle", "Install switches and keycaps"],
        tags: ["rgb", "acrylic", "mechanical"], author: "keyframe", likes: 214, age: 5,
      },
      {
        title: "See-Through Back Phone", device: "Pixel 7", category: "Phones", difficulty: 4, hours: 5,
        kind: "phone", hue: 255,
        description: "Replaced the frosted glass back with a clear one and printed the board's real layout onto a thin film so the battery and flex cables look deliberate. Waterproofing is gone, so treat it gently.",
        parts: ["Clear replacement back glass", "B-7000 adhesive", "Heat pad / heat gun", "Opening picks", "Printed internals film"],
        steps: ["Heat the back panel evenly and lift it with picks", "Clean every bit of old adhesive", "Align the film over the battery", "Glue the clear back and clamp for 24 hours"],
        tags: ["glass", "advanced", "adhesive"], author: "nullcase", likes: 96, age: 9,
      },
      {
        title: "Ice Controller", device: "Xbox Series controller", category: "Controllers", difficulty: 2, hours: 2,
        kind: "controller", hue: 190,
        description: "A clear shell with a light blue tint plus a hall-effect stick upgrade. The rumble motors spin in full view, which is oddly satisfying.",
        parts: ["Translucent ice-blue shell", "Hall-effect stick modules", "T8 security Torx", "Clear ABXY set"],
        steps: ["Remove the grips and the hidden screw under the sticker", "Transfer the board and rumble motors", "Desolder the old sticks and fit the hall-effect modules", "Reassemble and calibrate"],
        tags: ["hall-effect", "tinted", "gaming"], author: "frostbyte", likes: 77, age: 12,
      },
      {
        title: "Atomic Purple Console", device: "Nintendo 64", category: "Consoles", difficulty: 3, hours: 6,
        kind: "console", hue: 275,
        description: "Full translucent purple shell, a recapped power supply and a status LED moved to the front so it glows through the case. The RCP heatsink is polished to look good behind the plastic.",
        parts: ["Translucent purple shell", "Capacitor kit", "3mm LED + resistor", "Gamebit driver", "Polishing compound"],
        steps: ["Open with a gamebit and remove the RF shield", "Recap the power supply", "Polish the heatsink", "Add the LED and move everything to the new shell"],
        tags: ["retro", "recap", "led"], author: "crt_ghost", likes: 163, age: 18,
      },
      {
        title: "Clear Case Earbuds", device: "AirPods Pro case", category: "Audio", difficulty: 5, hours: 10,
        kind: "earbuds", hue: 160,
        description: "Resin-cast a clear replacement charging case from a 3D-printed master. The coil, hinge and charge board are suspended in resin. It's very hard to get bubble-free; this was attempt number seven.",
        parts: ["Clear epoxy casting resin", "Silicone mould kit", "Pressure pot", "3D printed master", "Fine-grit sandpaper (up to 7000)"],
        steps: ["Print and sand the master until it's perfectly smooth", "Make a two-part silicone mould", "Cast under pressure to remove bubbles", "Wet-sand and polish to an optical finish", "Move the electronics over and seal"],
        tags: ["resin", "casting", "expert"], author: "lumen", likes: 241, age: 25,
      },
    ].map((m, i) => ({
      id: "seed-mod-" + i,
      title: m.title, device: m.device, category: m.category, difficulty: m.difficulty, hours: m.hours,
      description: m.description, parts: m.parts, steps: m.steps, tags: m.tags, author: m.author,
      link: "",
      photos: [art(m.kind, m.hue, i * 31 + 7), art("board", m.hue, i * 31 + 99), art(m.kind, (m.hue + 40) % 360, i * 31 + 13)],
      likes: m.likes, liked: false,
      comments: i % 2 === 0 ? [{ id: "c" + i, author: "glasshouse", text: "The way the light comes through this is unreal. 🔥", at: now - (m.age - 1) * day }] : [],
      createdAt: now - m.age * day,
      seed: true,
    }));
  }

  function ideas() {
    return [
      { title: "Clear-shell e-reader with edge-lit PCB", device: "Kindle Paperwhite", description: "E-ink is already ghostly. Put it in a clear back and edge-light the board so it glows faintly while you read.", tags: ["e-ink", "edge-lit"], votes: 42, status: "open", author: "pagefault", age: 1 },
      { title: "Transparent smart speaker with visible woofer", device: "Echo Dot", description: "Swap the fabric for a clear dome and show off the woofer and the mic ring LEDs.", tags: ["audio", "dome"], votes: 31, status: "building", author: "lowend", age: 3 },
      { title: "Glass-top laptop lid with board art", device: "Framework 13", description: "Framework laptops are modular already; a clear top cover with a mounted spare mainboard as decoration would look amazing.", tags: ["laptop", "framework"], votes: 58, status: "open", author: "hexhinge", age: 4 },
      { title: "Clear mouse with exposed sensor", device: "Logitech G Pro", description: "Clear shell plus a tiny lens so the optical sensor's LED is visible from the top.", tags: ["mouse", "lightweight"], votes: 19, status: "built", author: "dpi_drift", age: 8 },
      { title: "Resin-cast clear Raspberry Pi case", device: "Raspberry Pi 5", description: "Cast the case like a block of ice with the fan visible inside. Needs a heat test.", tags: ["resin", "sbc", "thermals"], votes: 27, status: "open", author: "pi_in_ice", age: 6 },
    ].map((d, i) => ({
      id: "seed-idea-" + i, title: d.title, device: d.device, description: d.description, tags: d.tags,
      votes: d.votes, voted: false, status: d.status, author: d.author, createdAt: now - d.age * day, comments: [],
    }));
  }

  window.Seed = { mods, ideas, art };
})();
