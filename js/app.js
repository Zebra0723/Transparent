/* ==========================================================
   app.js — routing, rendering and interactions
   ========================================================== */
(function () {
  "use strict";

  const CATEGORIES = ["Handhelds", "Consoles", "Controllers", "Keyboards", "Phones", "Audio", "Computers", "Wearables", "Other"];
  const DIFFICULTY = ["", "Easy", "Moderate", "Involved", "Hard", "Expert"];
  const STATUSES = ["open", "building", "built"];
  const MAX_PHOTOS = 12;
  const SEED_VERSION = 3;

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
  const pad = (n, w = 3) => String(n).padStart(w, "0");

  function timeAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    const units = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
    for (const [n, u] of units) if (s >= n) return Math.floor(s / n) + u + " ago";
    return "just now";
  }
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

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
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  };

  const meter = (d) => `<span class="meter" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= d ? "on" : ""}"></i>`).join("")}</span>`;

  // catalogue numbers follow the order mods were added: T-001, T-002 …
  let catalogue = new Map();
  function indexCatalogue() {
    catalogue = new Map([...state.mods].sort((a, b) => a.createdAt - b.createdAt).map((m, i) => [m.id, "T-" + pad(i + 1)]));
  }
  const catNo = (m) => catalogue.get(m.id) || "T-" + pad(state.mods.length + 1);

  // ---------- data ----------
  async function load() {
    const seeded = await Store.get("meta", "seeded");
    if (!seeded) await seed();
    else if ((seeded.version || 1) < SEED_VERSION) await refreshSeedArt();
    [state.mods, state.ideas] = await Promise.all([Store.all("mods"), Store.all("ideas")]);
    indexCatalogue();
  }

  async function seed() {
    await Promise.all([Store.clear("mods"), Store.clear("ideas")]);
    await Store.putMany("mods", Seed.mods());
    await Store.putMany("ideas", Seed.ideas());
    await Store.put("meta", { id: "seeded", at: Date.now(), version: SEED_VERSION });
  }

  // swap in the newest sample artwork without touching anything the user added
  async function refreshSeedArt() {
    const fresh = new Map(Seed.mods().map((m) => [m.id, m.photos]));
    const mods = await Store.all("mods");
    const updated = mods.filter((m) => m.seed && fresh.has(m.id)).map((m) => ({ ...m, photos: fresh.get(m.id) }));
    if (updated.length) await Store.putMany("mods", updated);
    await Store.put("meta", { id: "seeded", at: Date.now(), version: SEED_VERSION });
  }

  async function saveMod(mod) {
    await Store.put("mods", mod);
    const i = state.mods.findIndex((m) => m.id === mod.id);
    if (i >= 0) state.mods[i] = mod; else state.mods.push(mod);
    indexCatalogue();
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
      if (ideaId) fillForm(null, state.ideas.find((i) => i.id === ideaId));
      else if (form.elements.id.value || form.elements.fromIdea.value) fillForm(null);
    }
  }

  function showView(view) {
    $$(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
    $$(".nav a").forEach((a) => {
      const on = a.dataset.route === view;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (view === "mods") renderMods();
    if (view === "ideas") renderIdeas();
    if (view === "submit") renderPreview();
    if (showView.current !== view) window.scrollTo(0, 0);
    showView.current = view;
  }

  // ---------- archive ----------
  function renderStats() {
    const photos = state.mods.reduce((n, m) => n + (m.photos?.length || 0), 0);
    const built = state.ideas.filter((i) => i.status === "built").length;
    const stats = [["Exhibits", state.mods.length], ["Photographs", photos], ["Ideas pitched", state.ideas.length], ["Ideas built", built]];
    $("#stats").innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${pad(v, 2)}</dd></div>`).join("");
  }

  function renderFeatured() {
    const host = $("#featured");
    const m = [...state.mods].sort((a, b) => b.likes - a.likes)[0];
    if (!m) { host.innerHTML = ""; return; }
    host.innerHTML = `
      <article class="feature glass" data-id="${esc(m.id)}" tabindex="0" role="link" aria-label="Featured: ${esc(m.title)}">
        <div class="feature-media">${m.photos?.[0] ? `<img src="${esc(m.photos[0])}" alt="">` : ""}</div>
        <div class="feature-body">
          <p class="feature-tag">Featured exhibit · ${esc(catNo(m))}</p>
          <h2 class="feature-title">${esc(m.title)}</h2>
          <p class="feature-desc">${esc(m.description)}</p>
          <dl class="specs">
            <div><dt>Device</dt><dd>${esc(m.device)}</dd></div>
            <div><dt>Difficulty</dt><dd>${meter(m.difficulty)}${esc(DIFFICULTY[m.difficulty])}</dd></div>
            <div><dt>Builder</dt><dd>${esc(m.author || "Anonymous")}</dd></div>
          </dl>
          <span class="feature-link">View exhibit <span aria-hidden="true">→</span></span>
        </div>
      </article>`;
  }

  function renderTabs() {
    const counts = {};
    state.mods.forEach((m) => (counts[m.category] = (counts[m.category] || 0) + 1));
    const cats = ["All", ...CATEGORIES.filter((c) => counts[c])];
    if (!cats.includes(state.category)) state.category = "All";
    counts.All = state.mods.length;
    $("#category-chips").innerHTML = cats
      .map((c) => `<button class="tab ${c === state.category ? "is-active" : ""}" data-cat="${esc(c)}" aria-pressed="${c === state.category}">${esc(c)}<sup>${counts[c]}</sup></button>`)
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
    const attrs = preview ? "" : `data-id="${esc(m.id)}" tabindex="0" role="link" aria-label="${esc(m.title)}"`;
    return `
      <article class="card glass" ${attrs} style="animation-delay:${Math.min(index, 9) * 50}ms">
        <div class="card-media">
          ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : ""}
          ${m.photos?.length > 1 ? `<span class="card-count">${m.photos.length} photos</span>` : ""}
        </div>
        <div class="card-body">
          <div class="card-meta"><b>${esc(catNo(m))}</b><span>${esc(m.category || "Other")}</span></div>
          <h3 class="card-title">${esc(m.title || "Untitled mod")}</h3>
          <p class="card-device">${esc(m.device || "Device")}</p>
          <div class="card-foot">
            <span>${meter(m.difficulty || 1)}${esc(DIFFICULTY[m.difficulty || 1])}</span>
            <button class="like ${m.liked ? "is-liked" : ""}" ${preview ? "disabled" : `data-like="${esc(m.id)}"`} aria-label="Like ${esc(m.title)}" aria-pressed="${!!m.liked}">${ICON.heart}<span>${m.likes || 0}</span></button>
          </div>
        </div>
      </article>`;
  }

  function renderMods() {
    renderStats();
    renderFeatured();
    renderTabs();
    const list = filteredMods();
    $("#archive-count").textContent = pad(list.length, 2);
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
      setTimeout(() => btn.classList.remove("pop"), 300);
    });
  }

  // ---------- detail modal ----------
  const modal = $("#mod-modal");
  const currentModId = () => (location.hash.startsWith("#/mod/") ? decodeURIComponent(location.hash.slice(6)) : null);

  function openMod(id) {
    const m = state.mods.find((x) => x.id === id);
    if (!m) { toast("That mod doesn't exist anymore"); location.hash = "#/mods"; return; }
    state.viewerIndex = 0;
    renderModal(m);
    if (!modal.open) modal.showModal();
    $(".modal-body", modal).scrollTop = 0;
  }

  function renderModal(m) {
    const photos = m.photos || [];
    const i = Math.min(state.viewerIndex, Math.max(0, photos.length - 1));
    const link = safeUrl(m.link);
    $("#modal-content").innerHTML = `
      <div class="detail">
        <div class="detail-media">
          <div class="viewer">
            <img src="${esc(photos[i] || Seed.art("board", 180, 1))}" alt="${esc(m.title)}, photo ${i + 1} of ${Math.max(1, photos.length)}">
            ${photos.length > 1 ? `
              <button class="viewer-btn prev" data-nav="-1" aria-label="Previous photo">${ICON.left}</button>
              <button class="viewer-btn next" data-nav="1" aria-label="Next photo">${ICON.right}</button>
              <span class="viewer-index">${pad(i + 1, 2)} / ${pad(photos.length, 2)}</span>` : ""}
          </div>
          ${photos.length > 1 ? `<div class="thumbs">${photos.map((p, k) => `<button class="${k === i ? "is-active" : ""}" data-thumb="${k}" aria-label="Photo ${k + 1}"><img src="${esc(p)}" alt=""></button>`).join("")}</div>` : ""}
        </div>
        <div class="detail-info">
          <div class="detail-top">
            <div>
              <p class="detail-tag">Exhibit ${esc(catNo(m))} · ${esc(m.category)}</p>
              <h2 class="detail-title" id="modal-title">${esc(m.title)}</h2>
              <p class="detail-device">${esc(m.device)}</p>
            </div>
            <button class="close-btn" data-close aria-label="Close">${ICON.close}</button>
          </div>

          <dl class="specs">
            <div><dt>Difficulty</dt><dd>${meter(m.difficulty)}${esc(DIFFICULTY[m.difficulty])}</dd></div>
            <div><dt>Build time</dt><dd>${m.hours ? esc(m.hours) + " hours" : "—"}</dd></div>
            <div><dt>Builder</dt><dd>${esc(m.author || "Anonymous")}</dd></div>
            <div><dt>Added</dt><dd>${fmtDate(m.createdAt)}</dd></div>
          </dl>

          <p class="detail-desc">${esc(m.description)}</p>

          ${m.parts?.length ? `<section><h3 class="detail-h"><span>Parts &amp; materials</span><span>${pad(m.parts.length, 2)}</span></h3><ol class="numbered">${m.parts.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></section>` : ""}
          ${m.steps?.length ? `<section><h3 class="detail-h"><span>Build steps</span><span>${pad(m.steps.length, 2)}</span></h3><ol class="numbered numbered--steps">${m.steps.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></section>` : ""}
          ${m.tags?.length ? `<div class="tags">${m.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
          ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="detail-link">${esc(link.replace(/^https?:\/\//, "").slice(0, 70))} ↗</a>` : ""}

          <div class="detail-actions">
            <button class="btn btn--sm btn--ghost ${m.liked ? "is-liked" : ""}" data-like-lg="${esc(m.id)}" aria-pressed="${!!m.liked}">${ICON.heart} ${m.likes}</button>
            <button class="btn btn--sm btn--ghost" data-share="${esc(m.id)}">Copy link</button>
            <a class="btn btn--sm btn--ghost" href="#/edit/${encodeURIComponent(m.id)}">Edit</a>
            <button class="btn btn--sm btn--text btn--danger" data-delete="${esc(m.id)}">Delete</button>
          </div>

          <section>
            <h3 class="detail-h"><span>Comments</span><span>${pad(m.comments?.length || 0, 2)}</span></h3>
            <div class="comments">
              ${(m.comments || []).map((c) => `<div class="comment"><div class="comment-head"><b>${esc(c.author)}</b><span>${timeAgo(c.at)}</span></div><p>${esc(c.text)}</p></div>`).join("")}
            </div>
            <form class="comment-form" data-comment="${esc(m.id)}">
              <input name="text" maxlength="500" placeholder="Add a comment" aria-label="Comment" required>
              <button class="btn btn--sm btn--ink" type="submit">Post</button>
            </form>
          </section>
          ${m.updatedAt ? `<p class="posted">Last edited ${timeAgo(m.updatedAt)}</p>` : ""}
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
    const m = state.mods.find((x) => x.id === currentModId());
    if (t.hasAttribute("data-close")) return closeModal();
    if (t.dataset.nav && m) {
      const n = m.photos.length;
      state.viewerIndex = (state.viewerIndex + Number(t.dataset.nav) + n) % n;
      renderModal(m);
      $(`[data-nav="${t.dataset.nav}"]`, modal)?.focus();
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
      indexCatalogue();
      closeModal();
      renderMods();
      toast("Mod deleted");
    }
  });

  modal.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-comment]");
    if (!f) return;
    e.preventDefault();
    const text = f.elements.text.value.trim();
    if (!text) return;
    const m = state.mods.find((x) => x.id === f.dataset.comment);
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

  // ---------- archive events ----------
  function openFromEvent(e) {
    const like = e.target.closest("[data-like]");
    if (like) { e.stopPropagation(); toggleLike(like.dataset.like); return; }
    const card = e.target.closest("[data-id]");
    if (card) location.hash = "#/mod/" + encodeURIComponent(card.dataset.id);
  }
  function keyOpen(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-id]");
    if (card && e.target === card) { e.preventDefault(); location.hash = "#/mod/" + encodeURIComponent(card.dataset.id); }
  }
  ["#mod-grid", "#featured"].forEach((sel) => {
    $(sel).addEventListener("click", openFromEvent);
    $(sel).addEventListener("keydown", keyOpen);
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
      .map((i) => `<button type="button" role="radio" aria-checked="${i === v}" aria-label="${i}, ${DIFFICULTY[i]}" class="${i === v ? "sel" : i < v ? "on" : ""}" data-d="${i}" title="${DIFFICULTY[i]}">${i}</button>`)
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
    const editing = state.mods.find((m) => m.id === form.elements.id.value);
    const m = { ...formData(), id: editing?.id || "__preview", likes: editing?.likes || 0 };
    if (!m.photos.length) m.photos = [Seed.art("board", 190, 3)];
    $("#live-preview").innerHTML = cardHTML(m, { preview: true });
  }

  function renderPhotoPreviews() {
    $("#photo-previews").innerHTML = state.draftPhotos
      .map((p, i) => `
        <li>
          <img src="${esc(p)}" alt="Photo ${i + 1}">
          ${i === 0 ? '<span class="cover-tag">Cover</span>' : ""}
          <div class="ph-actions">
            ${i > 0 ? `<button type="button" data-cover="${i}" aria-label="Make photo ${i + 1} the cover">Cover</button>` : "<span></span>"}
            <button type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}">Remove</button>
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

  // downscale photos so storage stays lean and pages stay fast
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
        const cx = c.getContext("2d");
        cx.fillStyle = "#0d1011";
        cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let data = c.toDataURL("image/webp", 0.85);
        if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", 0.85);
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image")); };
      img.src = url;
    });
  }

  async function addFiles(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast("Those weren't images");
    const room = MAX_PHOTOS - state.draftPhotos.length;
    if (room <= 0) return toast(`Up to ${MAX_PHOTOS} photos per mod`);
    if (list.length > room) toast(`Added the first ${room} (max ${MAX_PHOTOS})`);
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
    $("#form-eyebrow").textContent = mod ? `Editing ${catNo(mod)}` : idea ? "From the idea lab" : "New exhibit";
    $("#form-title").innerHTML = mod ? `Edit <em>${esc(mod.title)}</em>.` : idea ? "Build this <em>idea</em>." : "Submit a <em>mod</em>.";
    $("#form-submit").textContent = mod ? "Save changes" : "Publish mod";
    $$(".field.invalid", form).forEach((x) => x.classList.remove("invalid"));
    renderDifficulty();
    renderPhotoPreviews();
  }

  $("#form-reset").addEventListener("click", () => {
    if (form.elements.id.value || form.elements.fromIdea.value) history.replaceState(null, "", "#/submit");
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
      return toast("Couldn't save. Your browser storage may be full.");
    }

    const idea = state.ideas.find((i) => i.id === f.fromIdea.value);
    if (idea) { idea.status = "built"; idea.builtModId = mod.id; await saveIdea(idea); }

    toast(existing ? "Changes saved" : `Published as ${catNo(mod)}`);
    fillForm(null);
    location.hash = "#/mod/" + encodeURIComponent(mod.id);
  });

  // ---------- ideas ----------
  function renderIdeas() {
    const list = state.ideas.filter((i) => state.ideaStatus === "all" || i.status === state.ideaStatus);
    list.sort(state.ideaSort === "top" ? (a, b) => b.votes - a.votes || b.createdAt - a.createdAt : (a, b) => b.createdAt - a.createdAt);
    $("#idea-list").innerHTML = list.length
      ? list.map((i, k) => {
          const built = i.builtModId && state.mods.some((m) => m.id === i.builtModId);
          return `
        <li class="idea" style="animation-delay:${Math.min(k, 9) * 50}ms">
          <button class="vote ${i.voted ? "is-voted" : ""}" data-vote="${esc(i.id)}" aria-pressed="${!!i.voted}" aria-label="Vote for ${esc(i.title)}, ${i.votes} votes">
            <b>${i.votes}</b><small>${i.voted ? "Voted" : "Vote"}</small>
          </button>
          <div class="idea-main">
            <div class="idea-top">
              <div>
                <h3 class="idea-title">${esc(i.title)}</h3>
                <p class="idea-meta">${i.device ? esc(i.device) + " · " : ""}${esc(i.author || "Anonymous")} · ${timeAgo(i.createdAt)}</p>
              </div>
              <button class="status status--${esc(i.status)}" data-status-cycle="${esc(i.id)}" title="Change status">${esc(i.status)}</button>
            </div>
            ${i.description ? `<p class="idea-desc">${esc(i.description)}</p>` : ""}
            ${i.tags?.length ? `<div class="tags">${i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
            <div class="idea-actions">
              ${built
                ? `<a class="btn btn--sm btn--ghost" href="#/mod/${encodeURIComponent(i.builtModId)}">See the build →</a>`
                : `<a class="btn btn--sm btn--ghost" href="#/submit?idea=${encodeURIComponent(i.id)}">Build this →</a>`}
              <button class="btn btn--text btn--danger" data-idea-delete="${esc(i.id)}">Remove</button>
            </div>
          </div>
        </li>`;
        }).join("")
      : `<li class="idea-empty">No ideas here yet. Pitch the first one.</li>`;
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
    $$("#idea-filter .tab").forEach((c) => c.classList.toggle("is-active", c.dataset.status === "all"));
    renderIdeas();
    toast("Idea posted");
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
    $$("#idea-filter .tab").forEach((x) => x.classList.toggle("is-active", x === c));
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
      if (data.app !== "transparent" || !Array.isArray(data.mods) || !Array.isArray(data.ideas)) throw new Error("That isn't a Transparent backup");
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
  function syncThemeUI() {
    const t = document.documentElement.dataset.theme;
    $("#theme-toggle .tool-label").textContent = t === "dark" ? "Light" : "Dark";
    document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#0a0c0d" : "#e9edee";
  }
  $("#theme-toggle").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    lsSet("transparent:theme", t);
    syncThemeUI();
    window.Internals?.redraw();
  });
  syncThemeUI();

  $("#xray-toggle").addEventListener("click", (e) => {
    const on = document.body.classList.toggle("xray");
    e.currentTarget.setAttribute("aria-pressed", on);
  });

  // ---------- boot ----------
  window.addEventListener("hashchange", route);
  load()
    .then(() => {
      fillForm(null);
      route();
      if (!Store.persistent) toast("Storage unavailable. Changes won't be saved this session.");
    })
    .catch((err) => {
      console.error(err);
      toast("Something went wrong loading your mods");
    });
})();
