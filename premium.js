/* ──────────────────────────────────────────────────────────────────────────
   CivicPulse — Premium experience layer
   Ambient cursor glow · full-screen menu · 3D card tilt
   Plain (non-module) script. Enhances the app without touching core logic.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  /* ── Ambient cursor glow ─────────────────────────────────────────── */
  const glow = document.getElementById("ambCursor");
  if (glow && !isTouch && !reduce) {
    let gx = innerWidth / 2, gy = innerHeight / 2, cx = gx, cy = gy, raf = null;
    function loop() {
      cx += (gx - cx) * 0.16; cy += (gy - cy) * 0.16;
      glow.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      raf = Math.abs(gx - cx) > 0.5 || Math.abs(gy - cy) > 0.5 ? requestAnimationFrame(loop) : null;
    }
    addEventListener("pointermove", e => {
      gx = e.clientX; gy = e.clientY;
      glow.style.opacity = "";
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
  } else if (glow) {
    glow.style.display = "none";
  }

  /* ── Premium full-screen menu ────────────────────────────────────── */
  const burger = document.getElementById("navBurger");
  const pmenu  = document.getElementById("pmenu");
  const pclose = document.getElementById("pmenuClose");

  function openMenu() {
    if (!pmenu) return;
    // reveal admin entry only for authorized admins (mirror the admin nav button)
    const adminBtn = document.getElementById("adminNavBtn");
    const adminLink = pmenu.querySelector(".pmenu-admin");
    if (adminLink) adminLink.style.display = (adminBtn && adminBtn.style.display !== "none") ? "" : "none";
    pmenu.classList.add("open");
    pmenu.setAttribute("aria-hidden", "false");
    if (burger) burger.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  function closeMenu() {
    if (!pmenu) return;
    pmenu.classList.remove("open");
    pmenu.setAttribute("aria-hidden", "true");
    if (burger) burger.classList.remove("active");
    document.body.style.overflow = "";
  }

  burger && burger.addEventListener("click", () => pmenu.classList.contains("open") ? closeMenu() : openMenu());
  pclose && pclose.addEventListener("click", closeMenu);
  addEventListener("keydown", e => { if (e.key === "Escape" && pmenu && pmenu.classList.contains("open")) closeMenu(); });
  pmenu && pmenu.addEventListener("click", e => { if (e.target === pmenu) closeMenu(); });

  // Navigation links → trigger the existing (hidden) nav buttons
  document.querySelectorAll(".pmenu-link[data-go]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const view = link.dataset.go;
      const btn = view === "admin"
        ? document.getElementById("adminNavBtn")
        : document.querySelector(`.nav-btn[data-view="${view}"]`);
      closeMenu();
      setTimeout(() => btn && btn.click(), 180);
    });
  });
  // Mission link is a real anchor — let it navigate, just close first
  document.querySelectorAll('.pmenu-link[href]').forEach(link => {
    link.addEventListener("click", () => closeMenu());
  });

  // Quick actions → proxy to existing controls
  const actMap = { report: "openReportBtn", theme: "themeToggleBtn", share: "shareAppBtn", feedback: "feedbackBtn" };
  document.querySelectorAll(".pmenu-act[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.act === "tour") { closeMenu(); setTimeout(startTour, 280); return; }
      const target = document.getElementById(actMap[btn.dataset.act]);
      const keepOpen = btn.dataset.act === "theme";
      if (!keepOpen) closeMenu();
      setTimeout(() => target && target.click(), keepOpen ? 0 : 180);
    });
  });

  /* ── 3D tilt on cards ────────────────────────────────────────────── */
  if (!isTouch && !reduce) {
    const SEL = ".issue-card, .dash-card";
    let active = null;
    function reset(el) {
      el.style.transform = "";
      el.style.removeProperty("--shx");
      el.style.removeProperty("--shy");
    }
    document.addEventListener("pointermove", e => {
      const card = e.target.closest(SEL);
      if (card !== active) { if (active) reset(active); active = card; }
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rx = (0.5 - py) * 7, ry = (px - 0.5) * 9;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
      card.style.setProperty("--shx", (px * 100) + "%");
      card.style.setProperty("--shy", (py * 100) + "%");
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (active) { reset(active); active = null; } }, true);
  }

  /* ── Guided spotlight tour ───────────────────────────────────────── */
  const STEPS = [
    { sel: null,
      title: "Welcome to CivicPulse",
      desc: "Here's how to report a local issue in under a minute. Let's take a quick look around." },
    { sel: "#mapReportCta|#bnReport|#openReportBtn",
      title: "1 · Start a report",
      desc: "Tap “Report a Problem” to begin — it's always one tap away, wherever you are in the app." },
    { sel: "#uploadArea", modal: true,
      title: "2 · Add a photo",
      desc: "Snap or upload a photo of the issue — a pothole, broken streetlight, garbage, anything that needs fixing." },
    { sel: "#analyzeBtn", modal: true,
      title: "3 · Let the AI do the work",
      desc: "Gemini reads your photo and auto-fills the category, severity, the right department, even an estimated repair cost. Prefer talking? Use voice reporting." },
    { sel: "#map",
      title: "4 · Track it live",
      desc: "Your report drops onto the community map. Neighbours can verify it and officials act on it — you'll get notified the moment it's resolved." },
    { sel: "#navBurger",
      title: "Explore everything",
      desc: "Open the menu anytime to browse the feed, dashboards, your impact profile and our mission." },
    { sel: null,
      title: "You're all set!",
      desc: "That's it — make your neighbourhood better. Report your first issue now.",
      finishLabel: "Start reporting", finishAct: "openReportBtn" }
  ];

  const tour      = document.getElementById("tour");
  const hole      = document.getElementById("tourHole");
  const card      = document.getElementById("tourCard");
  const elTitle   = document.getElementById("tourTitle");
  const elDesc    = document.getElementById("tourDesc");
  const elIx      = document.getElementById("tourIx");
  const elTotal   = document.getElementById("tourTotal");
  const elDots    = document.getElementById("tourDots");
  const btnNext   = document.getElementById("tourNext");
  const btnBack   = document.getElementById("tourBack");
  const btnSkip   = document.getElementById("tourSkip");
  const TOUR_KEY  = "cp_tour_done";

  let idx = 0, resizeTimer = null;

  function tourSeen()  { try { return localStorage.getItem(TOUR_KEY) === "1"; } catch (e) { return false; } }
  function markSeen()  { try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) {} }

  function visible(el) { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; }
  function resolveTarget(sel) {
    if (!sel) return null;
    for (const s of sel.split("|")) { const el = document.querySelector(s.trim()); if (el && visible(el)) return el; }
    return null;
  }
  function modalOpen() { const m = document.getElementById("reportModal"); return !!(m && m.classList.contains("open")); }
  function ensureModal(want) {
    const open = modalOpen();
    if (want && !open)  { const b = document.getElementById("openReportBtn");  if (b) b.click(); return true; }
    if (!want && open)  { const b = document.getElementById("closeModalBtn");  if (b) b.click(); return true; }
    return false;
  }

  function renderDots() {
    elDots.innerHTML = "";
    STEPS.forEach((_, i) => {
      const d = document.createElement("span");
      if (i === idx) d.className = "on";
      elDots.appendChild(d);
    });
  }

  function position() {
    if (!tour.classList.contains("open")) return;
    const step = STEPS[idx];
    const el = resolveTarget(step.sel);
    if (!el) { tour.classList.add("no-hole"); centerCard(); return; }
    tour.classList.remove("no-hole");
    const r = el.getBoundingClientRect(), pad = 8;
    const top = Math.max(8, r.top - pad), left = Math.max(8, r.left - pad);
    const w = Math.min(r.width + pad * 2, innerWidth - 16), h = r.height + pad * 2;
    hole.style.top = top + "px"; hole.style.left = left + "px";
    hole.style.width = w + "px"; hole.style.height = h + "px";

    const cw = card.offsetWidth, ch = card.offsetHeight;
    const cardLeft = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), innerWidth - cw - 12);
    let cardTop;
    if (r.bottom + ch + 18 < innerHeight)   cardTop = r.bottom + 16;
    else if (r.top - ch - 18 > 0)           cardTop = r.top - ch - 16;
    else                                    cardTop = Math.min(Math.max(12, innerHeight - ch - 12), innerHeight - ch - 12);
    card.style.top = cardTop + "px"; card.style.left = cardLeft + "px";
  }
  function centerCard() {
    const cw = card.offsetWidth, ch = card.offsetHeight;
    card.style.top = Math.max(12, (innerHeight - ch) / 2) + "px";
    card.style.left = ((innerWidth - cw) / 2) + "px";
  }

  function render() {
    const step = STEPS[idx];
    const toggled = ensureModal(!!step.modal);
    elTitle.textContent = step.title;
    elDesc.textContent  = step.desc;
    elIx.textContent    = idx + 1;
    elTotal.textContent = STEPS.length;
    renderDots();
    btnBack.style.visibility = idx === 0 ? "hidden" : "visible";
    btnNext.textContent = idx === STEPS.length - 1 ? (step.finishLabel || "Done") : "Next →";
    // re-trigger the 3D card entrance
    card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
    setTimeout(position, toggled ? 400 : 50);
  }

  function startTour() {
    if (!tour) return;
    const mapBtn = document.querySelector('.nav-btn[data-view="map"]') || document.querySelector('.bn-item[data-bn="map"]');
    if (mapBtn) mapBtn.click();
    idx = 0;
    tour.classList.add("open");
    tour.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(render, 120);
    addEventListener("resize", onResize);
    addEventListener("keydown", onKey);
  }
  function finish(act) {
    ensureModal(false);
    tour.classList.remove("open");
    tour.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    removeEventListener("resize", onResize);
    removeEventListener("keydown", onKey);
    markSeen();
    if (act) { const t = document.getElementById(act); if (t) setTimeout(() => t.click(), 320); }
  }
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(position, 120); }
  function onKey(e)   { if (e.key === "Escape") finish(); }

  if (tour) {
    btnNext.addEventListener("click", () => {
      if (idx >= STEPS.length - 1) finish(STEPS[idx].finishAct);
      else { idx++; render(); }
    });
    btnBack.addEventListener("click", () => { if (idx > 0) { idx--; render(); } });
    btnSkip.addEventListener("click", () => finish());
  }
  window.startCivicTour = startTour;

  /* First-login auto-launch. app.js calls this right after a successful
     interactive sign-in (Google or guest). It runs only once per device. */
  window.startCivicTourFirstRun = function () {
    if (!tour || tourSeen()) return;
    setTimeout(() => { if (!tourSeen()) startTour(); }, 900);
  };

  /* This premium tour replaces the legacy onboarding modal, so suppress it. */
  (function suppressLegacyOnboarding() {
    try { localStorage.setItem("civicpulse_onboarded", "1"); } catch (e) {}
    const ob = document.getElementById("onboardingOverlay");
    if (ob) ob.classList.remove("show");
  })();
})();
