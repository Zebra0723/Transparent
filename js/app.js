/* ==========================================================
   app.js — routing, rendering and interactions
   ========================================================== */
(function () {
  "use strict";

  const CATEGORIES = ["Handhelds", "Consoles", "Controllers", "Keyboards", "Phones", "Audio", "Computers", "Wearables", "Other"];
  const DIFFICULTY = ["", "Easy", "Moderate", "Involved", "Hard", "Expert"];
  const STATUSES = ["open", "building", "built"];
  const MAX_PHOTOS = 12;

  const state = {
    mods: [],
    ideas: [],
    category: "All",
    query: "",
    sort: "new",
    ideaStatus: "all",
    ideaSort: "top",
    draftPhotos: [],
    viewerIndex: 0,
  };

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const lines = (s) => String(s || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const csv = (s) => [...new Set(String(s || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

  function timeAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    const units = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
    for (const [n, u] of units) if (s >= n) return Math.floor(s / n) + u + " ago";
    return "just now";
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

  const ICON = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.2-9C1.4 8 3.3 4.5 6.8 4.5c2 0 3.4 1.1 4.2 2.4h2c.8-1.3 2.2-2.4 4.2-2.4 3.5 0 5.4 3.5 4 6.5C19 15.6 12 20 12 20z" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    wrench: '<svg viewBox="0 0 24 24"><path d="M14.5 5.5a4 4 0 0 0 5 5L12 18a2.1 2.1 0 0 1-3-3z"/><path d="m4 20 3-3"/></svg>',
  };

  const difficultyBars = (d) => `<span class="difficulty" title="${esc(DIFFICULTY[d])}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= d ? "on" : ""}"></i>`).join("")}</span>`;

  // ---------- data ----------
  async function load() {
    const seeded = await Store.get("meta", "seeded");
    if (!seeded) await seed();
    [state.mods, state.ideas] = await Promise.all([Store.all("mods"), Store.all("ideas")]);
  }

  async function seed() {
    await Promise.all([Store.clear("mods"), Store.clear("ideas")]);
    await Store.putMany("mods", Seed.mods());
    await Store.putMany("ideas", Seed.ideas());
    await Store.put("meta", { id: "seeded", at: Date.now() });
  }

  async function saveMod(mod) {
    await Store.put("mods", mod);
    const i = state.mods.findIndex((m) => m.id === mod.id);
    if (i >= 0) state.mods[i] = mod; else state.mods.push(mod);
  }

  async function saveIdea(idea) {
    await Store.put("ideas", idea);
    const i = state.ideas.findIndex((m) => m.id === idea.id);
    if (i >= 0) state.ideas[i] = idea; else state.ideas.push(idea);
  }

  // ---------- routing ----------
  function route() {
    const hash = location.hash.replace(/^#\/?/, "") || "mods";
    const [path, queryStr] = hash.split("?");
    const parts = path.split("/");
    const params = new URLSearchParams(queryStr || "");
    let view = parts[0];

    if (view === "mod" && parts[1]) {
      showView("mods");
      openMod(decodeURIComponent(parts[1]));
      return;
    }
    if (view === "edit" && parts[1]) {
      closeModal(true);
      showView("submit");
      fillForm(state.mods.find((m) => m.id === decodeURIComponent(parts[1])));
      return;
    }
    if (!["mods", "ideas", "submit", "about"].includes(view)) view = "mods";
    closeModal(true);
    showView(view);
    if (view === "submit") {
      const ideaId = params.get("idea");
      const editing = $("#mod-form").elements.id.value;
      if (ideaId) fillForm(null, state.ideas.find((i) => i.id === ideaId));
      else if (editing) fillForm(null);
    }
  }

  function showView(view) {
    $$(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
    $$(".nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.route === view));
    if (view === "mods") renderMods();
    if (view === "ideas") renderIdeas();
    if (view === "submit") renderPreview();
    if (showView.current !== view) window.scrollTo(0, 0);
    showView.current = view;
  }

  // ---------- mods gallery ----------
  function renderStats() {
    const photos = state.mods.reduce((n, m) => n + (m.photos?.length || 0), 0);
    const built = state.ideas.filter((i) => i.status === "built").length;
    const stats = [["Mods", state.mods.length], ["Photos", photos], ["Ideas", state.ideas.length], ["Ideas built", built]];
    $("#stats").innerHTML = stats.map(([k, v]) => `<div class="stat"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  }

  function renderChips() {
    const present = new Set(state.mods.map((m) => m.category));
    const cats = ["All", ...CATEGORIES.filter((c) => present.has(c))];
    if (!cats.includes(state.category)) state.category = "All";
    $("#category-chips").innerHTML = cats
      .map((c) => `<button class="chip ${c === state.category ? "is-active" : ""}" data-cat="${esc(c)}" aria-pressed="${c === state.category}">${esc(c)}</button>`)
      .join("");
  }

  function filteredMods() {
    const q = state.query.trim().toLowerCase();
    let list = state.mods.filter((m) => state.category === "All" || m.category === state.category);
    if (q) {
      list = list.filter((m) =>
        [m.title, m.device, m.description, m.author, m.category, ...(m.tags || []), ...(m.parts || [])].join(" ").toLowerCase().includes(q)
      );
    }
    const by = {
      new: (a, b) => b.createdAt - a.createdAt,
      liked: (a, b) => b.likes - a.likes,
      easy: (a, b) => a.difficulty - b.difficulty || b.likes - a.likes,
      hard: (a, b) => b.difficulty - a.difficulty || b.likes - a.likes,
    }[state.sort];
    return list.sort(by);
  }

  function cardHTML(m, { preview = false, index = 0 } = {}) {
    const cover = m.photos?.[0];
    const tags = (m.tags || []).slice(0, 3);
    const tag = preview ? "div" : "article";
    return `
      <${tag} class="mod-card glass" ${preview ? "" : `data-id="${esc(m.id)}" tabindex="0" role="link" aria-label="${esc(m.title)}"`} style="animation-delay:${Math.min(index, 10) * 40}ms">
        <div class="cover">
          ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : ""}
          <div class="cover-badges">
            <span class="badge">${esc(m.category || "Other")}</span>
            ${m.photos?.length > 1 ? `<span class="badge">${m.photos.length} photos</span>` : ""}
          </div>
        </div>
        <div class="card-body">
          <span class="card-device">${esc(m.device || "Device")}</span>
          <h3>${esc(m.title || "Untitled mod")}</h3>
          <p class="card-desc">${esc(m.description || "Describe your mod…")}</p>
          ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
          <div class="card-foot">
            ${difficultyBars(m.difficulty || 1)}
            <button class="like-btn ${m.liked ? "is-liked" : ""}" ${preview ? "disabled" : `data-like="${esc(m.id)}"`} aria-label="Like" aria-pressed="${!!m.liked}">${ICON.heart}<span>${m.likes || 0}</span></button>
          </div>
        </div>
      </${tag}>`;
  }

  function renderMods() {
    renderStats();
    renderChips();
    const list = filteredMods();
    $("#mod-grid").innerHTML = list.map((m, i) => cardHTML(m, { index: i })).join("");
    $("#mod-empty").hidden = list.length > 0;
  }

  async function toggleLike(id) {
    const m = state.mods.find((x) => x.id === id);
    if (!m) return;
    m.liked = !m.liked;
    m.likes = Math.max(0, (m.likes || 0) + (m.liked ? 1 : -1));
    await saveMod(m);
    $$(`[data-like="${CSS.escape(id)}"]`).forEach((btn) => {
      btn.classList.toggle("is-liked", m.liked);
      btn.setAttribute("aria-pressed", m.liked);
      btn.querySelector("span").textContent = m.likes;
      btn.classList.add("pop");
      setTimeout(() => btn.classList.remove("pop"), 250);
    });
  }

  // ---------- mod detail modal ----------
  const modal = $("#mod-modal");

  function openMod(id) {
    const m = state.mods.find((x) => x.id === id);
    if (!m) { toast("That mod doesn't exist anymore"); location.hash = "#/mods"; return; }
    state.viewerIndex = 0;
    renderModal(m);
    if (!modal.open) modal.showModal();
    $(".modal-body", modal).scrollTop = 0;
  }

  function renderModal(m) {
    const photos = m.photos?.length ? m.photos : [];
    const i = Math.min(state.viewerIndex, Math.max(0, photos.length - 1));
    const link = safeUrl(m.link);
    $("#modal-content").innerHTML = `
      <div class="detail">
        <div class="detail-media">
          <div class="viewer">
            ${photos.length ? `<img src="${esc(photos[i])}" alt="${esc(m.title)} photo ${i + 1} of ${photos.length}">` : `<img src="${esc(Seed.art("board", 180, 1))}" alt="">`}
            ${photos.length > 1 ? `
              <div class="viewer-nav prev"><button class="icon-btn" data-nav="-1" aria-label="Previous photo">${ICON.left}</button></div>
              <div class="viewer-nav next"><button class="icon-btn" data-nav="1" aria-label="Next photo">${ICON.right}</button></div>` : ""}
          </div>
          ${photos.length > 1 ? `<div class="thumbs">${photos.map((p, k) => `<button class="${k === i ? "is-active" : ""}" data-thumb="${k}" aria-label="Photo ${k + 1}"><img src="${esc(p)}" alt=""></button>`).join("")}</div>` : ""}
        </div>
        <div class="detail-info">
          <div class="detail-head">
            <div>
              <p class="eyebrow">${esc(m.category)} · ${esc(m.device)}</p>
              <h2 id="modal-title">${esc(m.title)}</h2>
            </div>
            <button class="icon-btn close-btn" data-close aria-label="Close">${ICON.close}</button>
          </div>
          <dl class="detail-meta">
            <div><dt>Difficulty</dt><dd>${difficultyBars(m.difficulty)} ${esc(DIFFICULTY[m.difficulty])}</dd></div>
            <div><dt>Build time</dt><dd>${m.hours ? esc(m.hours) + " h" : "—"}</dd></div>
            <div><dt>Builder</dt><dd>${esc(m.author || "Anonymous")}</dd></div>
          </dl>
          <p class="detail-desc">${esc(m.description)}</p>
          ${m.parts?.length ? `<section><h4>Parts &amp; materials</h4><ul class="parts">${m.parts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></section>` : ""}
          ${m.steps?.length ? `<section><h4>Build steps</h4><ol class="steps">${m.steps.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></section>` : ""}
          ${m.tags?.length ? `<div class="tags">${m.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
          ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="mono">${esc(link.replace(/^https?:\/\//, "").slice(0, 60))} ↗</a>` : ""}
          <section>
            <h4>Comments (${m.comments?.length || 0})</h4>
            <div class="comments">
              ${(m.comments || []).map((c) => `<div class="comment"><b>${esc(c.author)}</b> <span class="mono muted">${timeAgo(c.at)}</span><p>${esc(c.text)}</p></div>`).join("")}
              <form class="comment-form" data-comment="${esc(m.id)}">
                <input name="text" maxlength="500" placeholder="Say something nice about it…" aria-label="Comment" required>
                <button class="btn btn--sm btn--primary" type="submit">Post</button>
              </form>
            </div>
          </section>
          <div class="detail-actions">
            <button class="btn btn--sm like-btn-lg ${m.liked ? "is-liked" : ""}" data-like-lg="${esc(m.id)}">${ICON.heart} ${m.liked ? "Liked" : "Like"} · ${m.likes}</button>
            <button class="btn btn--sm" data-share="${esc(m.id)}">${ICON.link} Copy link</button>
            <a class="btn btn--sm" href="#/edit/${encodeURIComponent(m.id)}">${ICON.edit} Edit</a>
            <button class="btn btn--sm btn--danger" data-delete="${esc(m.id)}">${ICON.trash} Delete</button>
          </div>
          <p class="mono muted">Posted ${timeAgo(m.createdAt)}${m.updatedAt ? " · edited " + timeAgo(m.updatedAt) : ""}</p>
        </div>
      </div>`;
  }

  function closeModal(silent) {
    if (modal.open) modal.close();
    if (!silent && location.hash.startsWith("#/mod/")) history.replaceState(null, "", "#/mods");
  }

  modal.addEventListener("click", async (e) => {
    if (e.target === modal) return closeModal();
    const t = e.target.closest("button, a");
    if (!t) return;
    const m = state.mods.find((x) => x.id === location.hash.split("/")[2] || x.id === t.dataset.likeLg || x.id === t.dataset.delete || x.id === t.dataset.share);
    if (t.hasAttribute("data-close")) return closeModal();
    if (t.dataset.nav && m) {
      const n = m.photos.length;
      state.viewerIndex = (state.viewerIndex + Number(t.dataset.nav) + n) % n;
      renderModal(m);
    } else if (t.dataset.thumb && m) {
      state.viewerIndex = Number(t.dataset.thumb);
      renderModal(m);
    } else if (t.dataset.likeLg) {
      await toggleLike(t.dataset.likeLg);
      renderModal(state.mods.find((x) => x.id === t.dataset.likeLg));
    } else if (t.dataset.share) {
      const url = location.href.split("#")[0] + "#/mod/" + encodeURIComponent(t.dataset.share);
      try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast(url); }
    } else if (t.dataset.delete) {
      if (!confirm("Delete this mod and its photos? This can't be undone.")) return;
      await Store.remove("mods", t.dataset.delete);
      state.mods = state.mods.filter((x) => x.id !== t.dataset.delete);
      closeModal();
      renderMods();
      toast("Mod deleted");
    }
  });

  modal.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-comment]");
    if (!form) return;
    e.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) return;
    const m = state.mods.find((x) => x.id === form.dataset.comment);
    m.comments = [...(m.comments || []), { id: uid("c"), author: lsGet("transparent:name") || "You", text, at: Date.now() }];
    await saveMod(m);
    renderModal(m);
    $(".modal-body", modal).scrollTop = 1e6;
  });

  modal.addEventListener("close", () => {
    if (location.hash.startsWith("#/mod/")) history.replaceState(null, "", "#/mods");
  });

  modal.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const btn = $(`[data-nav="${e.key === "ArrowRight" ? 1 : -1}"]`, modal);
      if (btn) { btn.click(); e.preventDefault(); }
    }
  });

  // ---------- gallery events ----------
  $("#mod-grid").addEventListener("click", (e) => {
    const like = e.target.closest("[data-like]");
    if (like) { e.stopPropagation(); toggleLike(like.dataset.like); return; }
    const card = e.target.closest(".mod-card[data-id]");
    if (card) location.hash = "#/mod/" + encodeURIComponent(card.dataset.id);
  });
  $("#mod-grid").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".mod-card[data-id]");
    if (card && e.target === card) { e.preventDefault(); location.hash = "#/mod/" + encodeURIComponent(card.dataset.id); }
  });
  $("#category-chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-cat]");
    if (!c) return;
    state.category = c.dataset.cat;
    renderMods();
  });
  $("#mod-search").addEventListener("input", (e) => { state.query = e.target.value; renderMods(); });
  $("#mod-sort").addEventListener("change", (e) => { state.sort = e.target.value; renderMods(); });

  // ---------- submit form ----------
  const form = $("#mod-form");

  $("#category-select").innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join("");

  function renderDifficulty() {
    const v = Number(form.elements.difficulty.value);
    $("#difficulty-input").innerHTML = [1, 2, 3, 4, 5]
      .map((i) => `<button type="button" role="radio" aria-checked="${i === v}" class="${i <= v ? "on" : ""}" data-d="${i}" title="${DIFFICULTY[i]}">${i}</button>`)
      .join("");
  }
  $("#difficulty-input").addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    form.elements.difficulty.value = b.dataset.d;
    renderDifficulty();
    renderPreview();
  });

  function formData() {
    const f = form.elements;
    return {
      title: f.title.value.trim(),
      device: f.device.value.trim(),
      category: f.category.value,
      difficulty: Number(f.difficulty.value) || 1,
      hours: f.hours.value ? Number(f.hours.value) : "",
      description: f.description.value.trim(),
      parts: lines(f.parts.value),
      steps: lines(f.steps.value),
      tags: csv(f.tags.value),
      author: f.author.value.trim() || "Anonymous",
      link: f.link.value.trim(),
      photos: state.draftPhotos.slice(),
    };
  }

  function renderPreview() {
    const m = { ...formData(), likes: 0 };
    if (!m.photos.length) m.photos = [Seed.art("board", 175, 3)];
    $("#live-preview").innerHTML = cardHTML(m, { preview: true });
  }

  function renderPhotoPreviews() {
    $("#photo-previews").innerHTML = state.draftPhotos
      .map((p, i) => `
        <li>
          <img src="${esc(p)}" alt="Photo ${i + 1}">
          ${i === 0 ? '<span class="cover-tag">cover</span>' : ""}
          <div class="ph-actions">
            ${i > 0 ? `<button type="button" data-cover="${i}" title="Make cover" aria-label="Make photo ${i + 1} the cover">★</button>` : "<span></span>"}
            <button type="button" data-remove="${i}" title="Remove" aria-label="Remove photo ${i + 1}">✕</button>
          </div>
        </li>`)
      .join("");
    renderPreview();
  }

  $("#photo-previews").addEventListener("click", (e) => {
    const r = e.target.closest("[data-remove]");
    const c = e.target.closest("[data-cover]");
    if (r) state.draftPhotos.splice(Number(r.dataset.remove), 1);
    if (c) { const [p] = state.draftPhotos.splice(Number(c.dataset.cover), 1); state.draftPhotos.unshift(p); }
    if (r || c) renderPhotoPreviews();
  });

  // Downscale photos so IndexedDB stays lean and pages stay fast.
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) return reject(new Error("Not an image"));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#0b1416";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let data = c.toDataURL("image/webp", 0.85);
        if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", 0.85);
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read image")); };
      img.src = url;
    });
  }

  async function addFiles(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast("Those weren't images");
    const room = MAX_PHOTOS - state.draftPhotos.length;
    if (room <= 0) return toast(`Max ${MAX_PHOTOS} photos per mod`);
    if (list.length > room) toast(`Only the first ${room} photo(s) were added (max ${MAX_PHOTOS})`);
    for (const f of list.slice(0, room)) {
      try { state.draftPhotos.push(await readPhoto(f)); } catch (err) { toast(err.message); }
    }
    renderPhotoPreviews();
  }

  const dz = $("#dropzone");
  $("#photo-input").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  // paste images straight into the form
  document.addEventListener("paste", (e) => {
    if ($('[data-view="submit"]').hidden) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  form.addEventListener("input", (e) => {
    e.target.closest(".field")?.classList.remove("invalid");
    renderPreview();
  });

  function fillForm(mod, idea) {
    form.reset();
    const f = form.elements;
    f.id.value = mod?.id || "";
    f.fromIdea.value = idea?.id || "";
    f.difficulty.value = mod?.difficulty || 2;
    f.author.value = mod?.author || lsGet("transparent:name") || "";
    if (mod) {
      f.title.value = mod.title; f.device.value = mod.device; f.category.value = mod.category;
      f.hours.value = mod.hours ?? ""; f.description.value = mod.description;
      f.parts.value = (mod.parts || []).join("\n"); f.steps.value = (mod.steps || []).join("\n");
      f.tags.value = (mod.tags || []).join(", "); f.link.value = mod.link || "";
    } else if (idea) {
      f.title.value = idea.title; f.device.value = idea.device || ""; f.description.value = idea.description || "";
      f.tags.value = (idea.tags || []).join(", ");
    }
    state.draftPhotos = mod ? [...(mod.photos || [])] : [];
    $("#form-eyebrow").textContent = mod ? "Editing" : idea ? "Building an idea" : "New build";
    $("#form-title").textContent = mod ? `Edit “${mod.title}”` : idea ? "Turn this idea into a mod" : "Add a transparent mod";
    $("#form-submit").textContent = mod ? "Save changes" : "Publish mod";
    $$(".field.invalid", form).forEach((x) => x.classList.remove("invalid"));
    renderDifficulty();
    renderPhotoPreviews();
  }

  $("#form-reset").addEventListener("click", () => {
    if (form.elements.id.value) { location.hash = "#/submit"; }
    fillForm(null);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    let firstBad = null;
    ["title", "device", "description"].forEach((name) => {
      const ok = f[name].value.trim().length > 0;
      f[name].closest(".field").classList.toggle("invalid", !ok);
      if (!ok && !firstBad) firstBad = f[name];
    });
    if (f.link.value && !safeUrl(f.link.value.trim())) {
      f.link.closest(".field").classList.add("invalid");
      firstBad = firstBad || f.link;
    }
    if (firstBad) { firstBad.focus(); return toast("A few fields need attention"); }

    const data = formData();
    const existing = state.mods.find((m) => m.id === f.id.value);
    const mod = existing
      ? { ...existing, ...data, updatedAt: Date.now() }
      : { id: uid("mod"), ...data, likes: 0, liked: false, comments: [], createdAt: Date.now() };

    if (data.author !== "Anonymous") lsSet("transparent:name", data.author);

    try {
      await saveMod(mod);
    } catch (err) {
      console.error(err);
      return toast("Couldn't save — your browser storage may be full");
    }

    // mark the source idea as built
    const idea = state.ideas.find((i) => i.id === f.fromIdea.value);
    if (idea) { idea.status = "built"; idea.builtModId = mod.id; await saveIdea(idea); }

    toast(existing ? "Changes saved" : "Mod published ✨");
    fillForm(null);
    location.hash = "#/mod/" + encodeURIComponent(mod.id);
  });

  // ---------- ideas ----------
  function renderIdeas() {
    let list = state.ideas.filter((i) => state.ideaStatus === "all" || i.status === state.ideaStatus);
    list.sort(state.ideaSort === "top" ? (a, b) => b.votes - a.votes || b.createdAt - a.createdAt : (a, b) => b.createdAt - a.createdAt);
    $("#idea-list").innerHTML = list.length
      ? list.map((i, k) => `
        <li class="idea glass" style="animation-delay:${Math.min(k, 10) * 40}ms">
          <button class="vote ${i.voted ? "is-voted" : ""}" data-vote="${esc(i.id)}" aria-pressed="${!!i.voted}" aria-label="Upvote">${ICON.up}<span>${i.votes}</span></button>
          <div class="idea-main">
            <div class="idea-top">
              <div>
                <h4>${esc(i.title)}</h4>
                <span class="idea-meta">${i.device ? esc(i.device) + " · " : ""}${esc(i.author || "Anonymous")} · ${timeAgo(i.createdAt)}</span>
              </div>
              <button class="status status--${esc(i.status)}" data-status-cycle="${esc(i.id)}" title="Click to change status">${esc(i.status)}</button>
            </div>
            ${i.description ? `<p class="idea-desc">${esc(i.description)}</p>` : ""}
            ${i.tags?.length ? `<div class="tags">${i.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
            <div class="idea-actions">
              ${i.builtModId && state.mods.some((m) => m.id === i.builtModId)
                ? `<a class="btn btn--sm" href="#/mod/${encodeURIComponent(i.builtModId)}">See the build →</a>`
                : `<a class="btn btn--sm" href="#/submit?idea=${encodeURIComponent(i.id)}">${ICON.wrench} Build this</a>`}
              <button class="btn btn--sm btn--danger" data-idea-delete="${esc(i.id)}">${ICON.trash} Remove</button>
            </div>
          </div>
        </li>`).join("")
      : `<li class="empty glass">No ideas here yet. Pitch one!</li>`;
  }

  $("#idea-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const title = f.title.value.trim();
    if (!title) return;
    const author = f.author.value.trim() || "Anonymous";
    if (author !== "Anonymous") lsSet("transparent:name", author);
    await saveIdea({
      id: uid("idea"), title, device: f.device.value.trim(), description: f.description.value.trim(),
      tags: csv(f.tags.value), author, votes: 1, voted: true, status: "open", createdAt: Date.now(), comments: [],
    });
    e.target.reset();
    f.author.value = lsGet("transparent:name") || "";
    state.ideaStatus = "all";
    state.ideaSort = "new";
    $("#idea-sort").value = "new";
    $$("#idea-filter .chip").forEach((c) => c.classList.toggle("is-active", c.dataset.status === "all"));
    renderIdeas();
    toast("Idea posted 💡");
  });

  $("#idea-list").addEventListener("click", async (e) => {
    const v = e.target.closest("[data-vote]");
    const s = e.target.closest("[data-status-cycle]");
    const d = e.target.closest("[data-idea-delete]");
    if (v) {
      const i = state.ideas.find((x) => x.id === v.dataset.vote);
      i.voted = !i.voted;
      i.votes = Math.max(0, i.votes + (i.voted ? 1 : -1));
      await saveIdea(i);
      renderIdeas();
    } else if (s) {
      const i = state.ideas.find((x) => x.id === s.dataset.statusCycle);
      i.status = STATUSES[(STATUSES.indexOf(i.status) + 1) % STATUSES.length];
      await saveIdea(i);
      renderIdeas();
    } else if (d) {
      if (!confirm("Remove this idea?")) return;
      await Store.remove("ideas", d.dataset.ideaDelete);
      state.ideas = state.ideas.filter((x) => x.id !== d.dataset.ideaDelete);
      renderIdeas();
      toast("Idea removed");
    }
  });

  $("#idea-filter").addEventListener("click", (e) => {
    const c = e.target.closest("[data-status]");
    if (!c) return;
    state.ideaStatus = c.dataset.status;
    $$("#idea-filter .chip").forEach((x) => x.classList.toggle("is-active", x === c));
    renderIdeas();
  });
  $("#idea-sort").addEventListener("change", (e) => { state.ideaSort = e.target.value; renderIdeas(); });

  // ---------- backup ----------
  $("#export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "transparent", version: 1, exportedAt: new Date().toISOString(), mods: state.mods, ideas: state.ideas })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transparent-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Backup downloaded");
  });

  $("#import-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "transparent" || !Array.isArray(data.mods) || !Array.isArray(data.ideas)) throw new Error("Not a Transparent backup");
      const validId = (x) => x && typeof x.id === "string";
      const mods = data.mods.filter(validId).map((m) => ({ ...m, photos: (m.photos || []).filter((p) => typeof p === "string" && p.startsWith("data:image/")) }));
      const ideas = data.ideas.filter(validId);
      if (!confirm(`Import ${mods.length} mods and ${ideas.length} ideas? Items with the same ID will be overwritten.`)) return;
      await Store.putMany("mods", mods);
      await Store.putMany("ideas", ideas);
      await load();
      renderMods();
      toast("Backup imported");
    } catch (err) {
      toast(err.message || "Import failed");
    }
  });

  $("#reset-btn").addEventListener("click", async () => {
    if (!confirm("Erase everything and restore the sample mods and ideas?")) return;
    await seed();
    await load();
    toast("Reset to sample data");
    location.hash = "#/mods";
    renderMods();
  });

  // ---------- theme + x-ray ----------
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    lsSet("transparent:theme", t);
    document.querySelector('meta[name="theme-color"]').content = t === "light" ? "#dfe9ea" : "#0b1416";
    window.Internals?.redraw();
  }
  document.querySelector('meta[name="theme-color"]').content = document.documentElement.dataset.theme === "light" ? "#dfe9ea" : "#0b1416";
  $("#theme-toggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));

  $("#xray-toggle").addEventListener("click", (e) => {
    const on = document.body.classList.toggle("xray");
    e.currentTarget.setAttribute("aria-pressed", on);
    toast(on ? "X-ray on — internals exposed" : "X-ray off");
  });

  // ---------- boot ----------
  window.addEventListener("hashchange", route);
  load()
    .then(() => {
      renderDifficulty();
      fillForm(null);
      route();
      if (!Store.persistent) toast("Storage unavailable — changes won't be saved this session");
    })
    .catch((err) => {
      console.error(err);
      toast("Something went wrong loading your mods");
    });
})();
