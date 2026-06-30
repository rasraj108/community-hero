import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc,
         getDocs, doc, updateDoc, onSnapshot,
         query, orderBy, getDoc, increment, setDoc,
         limit }                                     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes,
         getDownloadURL }                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAuth, signInAnonymously,
         signInWithPopup, GoogleAuthProvider,
         onAuthStateChanged }                from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Init ──────────────────────────────────────────────────────────────────────
const app     = initializeApp(window.CONFIG.FIREBASE);
const db      = getFirestore(app);
const storage = getStorage(app);
const auth    = getAuth(app);

const GEMINI_MODEL = "gemini-2.5-flash";
const googleProvider = new GoogleAuthProvider();

let currentUser   = null;
let userData      = { points: 0, reports: 0, votes: 0 };
let map, heatLayer = null, heatmapActive = false, clusterGroup = null, mapTileLayer = null;
let landingMap    = null;
let markers       = [];
let currentIssues = [];
let currentFilter = "all";
let officialFilter= "all";
let officialSort  = "urgency";
let activeOfficialId = null;
let selectedTickets  = new Set();
let cmdMiniMap    = null;
let uploadedImageFile = null, uploadedImageB64 = null;
let selectedLat = null, selectedLng = null;
let chatHistory = [];
let chatOpen    = false;
let currentDetailIssue = null;
let googleChartsReady  = false;

// ── Google Charts ─────────────────────────────────────────────────────────────
if (window.google) {
  google.charts.load("current", { packages: ["corechart", "bar"] });
  google.charts.setOnLoadCallback(() => { googleChartsReady = true; });
}

// ── Theme (dark default, toggleable) ───────────────────────────────────────────
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}
function tileURL() {
  return currentTheme() === "light"
    ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
}
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
const ICON_SUN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
function syncThemeButton() {
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.innerHTML = currentTheme() === "light" ? ICON_MOON : ICON_SUN;
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("civicpulse-theme", theme); } catch {}
  syncThemeButton();
  // Swap map tiles to match the theme
  if (map && mapTileLayer) {
    map.removeLayer(mapTileLayer);
    mapTileLayer = L.tileLayer(tileURL(), { attribution: "&copy; CARTO", maxZoom: 19 }).addTo(map);
  }
  // Charts are canvas-drawn — re-render if dashboard is open
  if (document.getElementById("view-dashboard")?.classList.contains("active")) renderDashboard();
}
document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
  applyTheme(currentTheme() === "light" ? "dark" : "light");
});
syncThemeButton();

// ── Landing Screen ────────────────────────────────────────────────────────────
function initLandingScreen() {
  const screen = document.getElementById("landingScreen");
  screen.classList.add("show");

  // Init landing map (non-interactive background)
  if (landingMap) return;
  landingMap = L.map("landingMap", {
    zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    touchZoom: false, keyboard: false,
  }).setView([20.5937, 78.9629], 5);
  L.tileLayer(tileURL(), { maxZoom: 19 }).addTo(landingMap);

  // Fly to user's location
  navigator.geolocation?.getCurrentPosition(pos => {
    landingMap.flyTo([pos.coords.latitude, pos.coords.longitude], 12, { duration: 2.5, easeLinearity: 0.1 });
  }, null, { timeout: 5000 });

  // Load live issue dots from Firestore (public read in test mode)
  getDocs(query(collection(db, "issues"), orderBy("createdAt", "desc")))
    .then(snap => {
      const issues = snap.docs.map(d => d.data());
      const total    = issues.length;
      const resolved = issues.filter(i => i.status === "resolved").length;
      const open     = issues.filter(i => i.status !== "resolved").length;

      document.getElementById("ls-total").textContent    = total;
      document.getElementById("ls-resolved").textContent = resolved;
      document.getElementById("ls-open").textContent     = open;
      document.getElementById("lc-live-text").textContent =
        total > 0 ? `${total} issues tracked live across your community` : "Be the first to report an issue!";

      // Place blinking markers
      issues.forEach((issue, idx) => {
        if (!issue.lat || !issue.lng) return;
        const color = CATEGORY_COLORS[issue.category] || "#bc8cff";
        const delay = ((idx * 0.37) % 3).toFixed(2);
        const icon  = L.divIcon({
          className: "",
          html: `<div class="l-marker-wrap">
            <div class="l-ring"  style="border-color:${color};animation-delay:${delay}s"></div>
            <div class="l-dot"   style="background:${color};box-shadow:0 0 6px ${color};animation-delay:${delay}s"></div>
          </div>`,
          iconSize: [20, 20], iconAnchor: [10, 10],
        });
        L.marker([issue.lat, issue.lng], { icon }).addTo(landingMap);
      });
    }).catch(() => {});
}

function dismissLanding(animate = true) {
  const screen = document.getElementById("landingScreen");
  if (animate) {
    screen.classList.add("fade-out");
    setTimeout(() => {
      screen.style.display = "none";
      if (landingMap) { landingMap.remove(); landingMap = null; }
      if (map) map.invalidateSize();
    }, 600);
  } else {
    screen.style.display = "none";
    if (landingMap) { landingMap.remove(); landingMap = null; }
  }
}

async function loginWithGoogle() {
  const btn = document.getElementById("landingGoogleBtn");
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    const result  = await signInWithPopup(auth, googleProvider);
    currentUser   = result.user;
    const typed = document.getElementById("landingName").value.trim();
    const name  = typed || currentUser.displayName;
    if (name) await saveDisplayName(name);
    dismissLanding(true);
    loadUserData();
    window.startCivicTourFirstRun?.();
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" style="flex-shrink:0"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google`;
    if (e.code === "auth/popup-blocked") showToast("Allow popups for Google Sign-In", "error");
    else if (e.code !== "auth/popup-closed-by-user") showToast("Sign-in failed. Try guest access.", "error");
  }
}

async function loginAsGuest() {
  const btn = document.getElementById("landingGuestBtn");
  btn.textContent = "Loading…"; btn.disabled = true;
  const result  = await signInAnonymously(auth);
  currentUser   = result.user;
  const name = document.getElementById("landingName").value.trim();
  if (name) await saveDisplayName(name);
  dismissLanding(true);
  loadUserData();
  window.startCivicTourFirstRun?.();
}

async function saveDisplayName(name) {
  if (!currentUser) return;
  try { await setDoc(doc(db, "users", currentUser.uid), { name }, { merge: true }); } catch {}
}

document.getElementById("landingGoogleBtn").addEventListener("click", loginWithGoogle);
document.getElementById("landingGuestBtn").addEventListener("click", loginAsGuest);

// ── Auth State ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user && !user.isAnonymous) {
    // Returning Google user — skip landing
    currentUser = user;
    dismissLanding(false);
    loadUserData();
  } else {
    // Show landing for new/guest users
    initLandingScreen();
  }
});

async function loadUserData() {
  if (!currentUser) return;
  const snap = await getDoc(doc(db, "users", currentUser.uid)).catch(() => null);
  if (snap?.exists()) { userData = { points: 0, reports: 0, votes: 0, ...snap.data() }; refreshUserHUD(); }
  trackSession();
  maybeShowAdminNav();
}

// ── Visitor / Activity Tracking ───────────────────────────────────────────────
async function trackSession() {
  if (!currentUser) return;
  const isGoogle = !currentUser.isAnonymous;
  const profileName = document.getElementById("landingName")?.value.trim();
  const name = currentUser.displayName || userData.name || profileName || `Guest_${currentUser.uid.slice(0, 5)}`;
  const sref = doc(db, "sessions", currentUser.uid);
  const existing = await getDoc(sref).catch(() => null);
  try {
    if (existing?.exists()) {
      await updateDoc(sref, {
        lastSeen:  new Date().toISOString(),
        visits:    increment(1),
        name,
      });
    } else {
      await setDoc(sref, {
        uid:         currentUser.uid,
        name,
        email:       currentUser.email || null,
        loginMethod: isGoogle ? "google" : "guest",
        userAgent:   navigator.userAgent,
        firstSeen:   new Date().toISOString(),
        lastSeen:    new Date().toISOString(),
        visits:      1,
      });
      logActivity("opened", isGoogle ? "Signed in with Google" : "Joined as Guest");
    }
  } catch (e) { /* tracking is best-effort */ }
}

async function logActivity(action, detail) {
  if (!currentUser) return;
  const name = currentUser.displayName || userData.name || `Guest_${currentUser.uid.slice(0, 5)}`;
  try {
    await addDoc(collection(db, "activity"), {
      uid: currentUser.uid,
      name,
      method: currentUser.isAnonymous ? "guest" : "google",
      action, detail,
      createdAt: new Date().toISOString(),
    });
  } catch (e) { /* best-effort */ }
}

function isAdmin() {
  return currentUser && !currentUser.isAnonymous &&
         currentUser.email && window.CONFIG.ADMIN_EMAIL &&
         currentUser.email.toLowerCase() === window.CONFIG.ADMIN_EMAIL.toLowerCase();
}

function maybeShowAdminNav() {
  document.getElementById("adminNavBtn").style.display = isAdmin() ? "" : "none";
  const adminMobile = document.getElementById("adminNavBtnMobile");
  if (adminMobile) adminMobile.style.display = isAdmin() ? "" : "none";
}

async function updateUserStats(delta) {
  if (!currentUser) return;
  const uref = doc(db, "users", currentUser.uid);
  const snap = await getDoc(uref).catch(() => null);
  if (snap?.exists()) {
    await updateDoc(uref, {
      points:  increment(delta.points  || 0),
      reports: increment(delta.reports || 0),
      votes:   increment(delta.votes   || 0),
    });
  } else {
    await setDoc(uref, {
      uid:     currentUser.uid,
      name:    userData.name || currentUser.displayName || `Hero_${currentUser.uid.slice(0, 6)}`,
      points:  delta.points  || 0,
      reports: delta.reports || 0,
      votes:   delta.votes   || 0,
    });
  }
  userData.points  += (delta.points  || 0);
  userData.reports += (delta.reports || 0);
  userData.votes   += (delta.votes   || 0);
  refreshUserHUD();
}

function refreshUserHUD() {
  document.getElementById("userPoints").textContent = `${userData.points} pts`;
  document.getElementById("myPoints").textContent   = userData.points;
  document.getElementById("myReports").textContent  = userData.reports;
  document.getElementById("myVotes").textContent    = userData.votes;
  document.getElementById("myBadge").textContent    = getBadge(userData.points);
  const pct = getTierProgress(userData.points);
  const fill = document.getElementById("tierBarFill");
  const pctEl = document.getElementById("tierPct");
  if (fill)  fill.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "%";
}

function getBadge(pts) {
  if (pts >= 1000) return "Civic Champion";
  if (pts >= 500)  return "Community Advocate";
  if (pts >= 200)  return "Civic Contributor";
  if (pts >= 50)   return "Verified Resident";
  return "New Resident";
}

// Points thresholds for the next-tier progress ring
function getTierProgress(pts) {
  const tiers = [0, 50, 200, 500, 1000];
  let lo = 0, hi = 1000;
  for (let i = 0; i < tiers.length; i++) {
    if (pts >= tiers[i]) { lo = tiers[i]; hi = tiers[i + 1] ?? tiers[i]; }
  }
  if (hi === lo) return 100;
  return Math.min(100, Math.round(((pts - lo) / (hi - lo)) * 100));
}

// ── Navigation ────────────────────────────────────────────────────────────────
function switchView(view) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add("active");
  document.querySelectorAll(".bn-item").forEach(b => b.classList.toggle("active", b.dataset.bn === view));
  if (view === "map" && map)  setTimeout(() => map.invalidateSize(), 50);
  if (view === "dashboard")   renderDashboard();
  if (view === "leaderboard") renderLeaderboard();
  if (view === "official")    openOfficialView();
  if (view === "admin")       openAdminView();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// Mobile bottom navigation
document.querySelectorAll(".bn-item").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.bn));
});

// Top-right icon shortcuts that map to a view (Official / Admin)
document.querySelectorAll(".nav-icon-btn[data-view]").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
document.getElementById("bnReport")?.addEventListener("click", () => {
  document.getElementById("openReportBtn").click();
});

// ── Map ───────────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  pothole: "#f85149", streetlight: "#d29922", water: "#58a6ff",
  waste: "#3fb950", road: "#e3853a", drainage: "#8957e5", other: "#bc8cff",
};

// ── Status model ──────────────────────────────────────────────────────────────
const STATUS_LABELS = { open: "Open", in_progress: "In Progress", en_route: "Crew En Route", resolved: "Resolved" };
const STATUS_RANK   = { open: 0, in_progress: 1, en_route: 2, resolved: 3 };
function statusLabel(s) { return STATUS_LABELS[s] || s; }
function statusOptionsHtml(current) {
  return ["open", "in_progress", "en_route", "resolved"]
    .map(s => `<option value="${s}" ${current === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("");
}

// Citizen-facing status tracker (e-commerce style timeline)
function renderStatusTracker(issue) {
  const rank = STATUS_RANK[issue.status] ?? 0;
  const h = issue.history || {};
  const ts = v => v ? formatDate(v) : "";
  const steps = [
    { key: "reported", label: "Reported", icon: "📝", done: true, time: ts(issue.createdAt), sub: "Issue submitted by citizen" },
    { key: "assigned", label: "Assigned to Department", icon: "🏢", done: rank >= 1, time: ts(h.in_progress), sub: issue.department || "Routed to responsible dept" },
    { key: "enroute",  label: "Crew En Route", icon: "🚧", done: rank >= 2, time: ts(h.en_route), sub: "Field crew dispatched" },
    { key: "resolved", label: "Resolved", icon: "✅", done: rank >= 3, time: ts(issue.resolvedAt || h.resolved), sub: issue.resolvedImageUrl ? "Photo proof added" : "Marked resolved" },
  ];
  const activeIdx = steps.findIndex(s => !s.done);
  return `<div class="tracker">${steps.map((s, idx) => `
    <div class="tracker-step ${s.done ? "done" : ""} ${idx === activeIdx ? "active" : ""}">
      <div class="tracker-dot">${s.done ? "✓" : s.icon}</div>
      <div class="tracker-info">
        <div class="tracker-label">${s.label}</div>
        <div class="tracker-sub">${s.sub}${s.time ? ` · <span>${s.time}</span>` : ""}</div>
      </div>
    </div>`).join("")}</div>`;
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([19.076, 72.8777], 12);
  mapTileLayer = L.tileLayer(tileURL(), {
    attribution: "&copy; CARTO", maxZoom: 19,
  }).addTo(map);
  // Elegant marker clustering (falls back to plain markers if plugin missing)
  if (window.L && L.markerClusterGroup) {
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        const size  = count < 10 ? 38 : count < 50 ? 46 : 54;
        return L.divIcon({
          html: `<div class="civic-cluster" style="width:${size}px;height:${size}px">${count}</div>`,
          className: "", iconSize: [size, size],
        });
      },
    });
    map.addLayer(clusterGroup);
  }
  loadIssuesRealtime();
}
initMap();

function addMapMarker(issue) {
  if (!map || !issue.lat) return;
  const color = CATEGORY_COLORS[issue.category] || "#bc8cff";
  const size  = issue.severity === "critical" ? 14 : issue.severity === "high" ? 11 : 9;
  const icon  = L.divIcon({
    className: "",
    html: `<div style="width:${size*2}px;height:${size*2}px;background:${color};border:2px solid #fff;border-radius:50%;opacity:${issue.status==="resolved"?0.4:0.9};box-shadow:0 0 8px ${color}"></div>`,
    iconSize: [size*2, size*2], iconAnchor: [size, size],
  });
  const marker = L.marker([issue.lat, issue.lng], { icon })
    .bindPopup(`<div class="civic-popup">
      <div class="cp-title">${issue.title}</div>
      <div class="cp-loc">${issue.location || "Unknown location"}</div>
      <div class="cp-chips">
        <span class="cp-chip">${issue.category}</span>
        <span class="cp-chip">${issue.status}</span>
      </div></div>`, { maxWidth: 240 });
  if (clusterGroup && !heatmapActive) clusterGroup.addLayer(marker);
  else if (!heatmapActive) marker.addTo(map);
  markers.push(marker);
}

function loadIssuesRealtime() {
  const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    currentIssues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (clusterGroup) clusterGroup.clearLayers();
    else markers.forEach(m => map.removeLayer(m));
    markers = [];
    currentIssues.forEach(i => addMapMarker(i));
    updateHeatmap();
    renderFeed();
    updateMapStats();
    if (document.getElementById("view-official")?.classList.contains("active") && officialAccessGranted()) renderOfficialPortal();
    checkResolutionLoop();
    if (adminListening) renderAdmin();
  });
}

// ── Resolution Loop — notify citizens when THEIR report is resolved ───────────
function resolveSeen() {
  try { return JSON.parse(localStorage.getItem("cp_resolved_seen") || "[]"); } catch { return []; }
}
function markResolveSeen(id) {
  const s = resolveSeen(); if (!s.includes(id)) { s.push(id); localStorage.setItem("cp_resolved_seen", JSON.stringify(s)); }
}
function checkResolutionLoop() {
  if (!currentUser?.uid) return;
  const seen = resolveSeen();
  const mine = currentIssues.filter(i =>
    i.reportedBy === currentUser.uid && i.status === "resolved" && i.resolvedImageUrl && !i.verifiedByReporter && !seen.includes(i.id));
  if (!mine.length) return;
  showResolveNotif(mine[0]);
}
function showResolveNotif(issue) {
  const el = document.getElementById("resolveNotif");
  if (!el) return;
  el.innerHTML = `
    <div class="rn-icon">✅</div>
    <div class="rn-body">
      <div class="rn-title">Your report was resolved!</div>
      <div class="rn-sub">“${escapeHtml(issue.title)}” has been marked fixed with photo proof. Please verify the work.</div>
      <div class="rn-thumbs">
        ${issue.imageUrl ? `<div class="rn-thumb"><span>Before</span><img src="${issue.imageUrl}"/></div>` : ""}
        <div class="rn-thumb"><span>After</span><img src="${issue.resolvedImageUrl}"/></div>
      </div>
      <div class="rn-actions">
        <button class="btn-primary btn-sm" id="rnVerify">✓ Verify the fix</button>
        <button class="btn-secondary btn-sm" id="rnView">View details</button>
      </div>
    </div>
    <button class="rn-close" id="rnClose" aria-label="Dismiss">✕</button>`;
  el.classList.remove("hidden");
  requestAnimationFrame(() => el.classList.add("show"));

  const dismiss = () => { el.classList.remove("show"); markResolveSeen(issue.id); setTimeout(() => el.classList.add("hidden"), 300); };
  document.getElementById("rnClose").onclick = dismiss;
  document.getElementById("rnView").onclick = () => { dismiss(); openDetail(issue.id); };
  document.getElementById("rnVerify").onclick = async () => {
    try {
      await updateDoc(doc(db, "issues", issue.id), { verifiedByReporter: true });
      logActivity?.("verified", `Verified resolution of "${issue.title}"`);
      showToast("Thanks for verifying the fix! 🎉", "success");
    } catch {}
    dismiss();
  };
}

function updateMapStats() {
  document.getElementById("totalIssues").textContent    = currentIssues.length;
  document.getElementById("resolvedIssues").textContent = currentIssues.filter(i => i.status === "resolved").length;
  document.getElementById("pendingIssues").textContent  = currentIssues.filter(i => i.status !== "resolved").length;
}

// Heat Map
document.getElementById("toggleHeatmapBtn").addEventListener("click", () => {
  heatmapActive = !heatmapActive;
  const btn = document.getElementById("toggleHeatmapBtn");
  btn.classList.toggle("active", heatmapActive);
  btn.textContent = heatmapActive ? "🗺️ Markers" : "🔥 Heat Map";
  if (clusterGroup) {
    if (heatmapActive) map.removeLayer(clusterGroup);
    else { clusterGroup.clearLayers(); markers.forEach(m => clusterGroup.addLayer(m)); map.addLayer(clusterGroup); }
  } else {
    markers.forEach(m => heatmapActive ? map.removeLayer(m) : m.addTo(map));
  }
  updateHeatmap();
});

function updateHeatmap() {
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  if (!heatmapActive || !window.L?.heatLayer) return;
  const pts = currentIssues
    .filter(i => i.lat && i.lng)
    .map(i => [i.lat, i.lng, { critical: 1.0, high: 0.7, medium: 0.4, low: 0.2 }[i.severity] || 0.4]);
  if (pts.length) heatLayer = L.heatLayer(pts, { radius: 30, blur: 20, maxZoom: 17 }).addTo(map);
}

// ── Feed ──────────────────────────────────────────────────────────────────────
function isEscalated(issue) {
  if (issue.status === "resolved") return false;
  const days = (Date.now() - new Date(issue.createdAt).getTime()) / 86400000;
  return (issue.votes || 0) >= 10 && days >= 7;
}

function renderFeed() {
  const grid = document.getElementById("feedGrid");
  let issues = currentIssues;
  if (currentFilter !== "all") issues = issues.filter(i => i.status === currentFilter);
  if (!issues.length) { grid.innerHTML = `<div class="loading-spinner">No issues found.</div>`; return; }
  grid.innerHTML = issues.map(issue => `
    <div class="issue-card" data-id="${issue.id}">
      ${issue.imageUrl
        ? `<img class="issue-card-img" src="${issue.imageUrl}" alt="${issue.title}" loading="lazy" />`
        : `<div class="issue-card-img no-img">📍</div>`}
      <div class="issue-card-body">
        <div class="issue-meta">
          <span class="issue-category-tag">${issue.category || "other"}</span>
          ${isEscalated(issue) ? `<span class="escalated-badge">🚨 Escalated</span>` : `<span style="font-size:11px;color:#8b949e">${issue.severity || ""}</span>`}
        </div>
        <div class="issue-title">${issue.title}</div>
        <div class="issue-location">📍 ${issue.location || "Unknown location"}</div>
        <div class="issue-footer">
          <span class="status-badge ${issue.status}">${statusLabel(issue.status)}</span>
          <div class="vote-row">
            <button class="vote-btn ${issue.votedBy?.includes(currentUser?.uid) ? "voted" : ""}"
                    onclick="event.stopPropagation();voteIssue('${issue.id}')">+1 Verify</button>
            <span class="vote-count">${issue.votes || 0}</span>
          </div>
        </div>
      </div>
    </div>`).join("");
  grid.querySelectorAll(".issue-card").forEach(card => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
  });
  grid.querySelectorAll(".issue-card-img:not(.no-img)").forEach(img => {
    img.addEventListener("click", e => { e.stopPropagation(); openImageViewer(img.src); });
  });
}

// ── Image Viewer (Lightbox) ───────────────────────────────────────────────────
window.openImageViewer = function(src) {
  if (!src) return;
  document.getElementById("imageViewerImg").src = src;
  document.getElementById("imageViewer").classList.add("open");
};
window.closeImageViewer = function() {
  document.getElementById("imageViewer").classList.remove("open");
  document.getElementById("imageViewerImg").src = "";
};
(function initImageViewer() {
  const viewer = document.getElementById("imageViewer");
  // Click anywhere on the backdrop (but not the image itself) to close
  viewer.addEventListener("click", e => { if (e.target === viewer) closeImageViewer(); });
  document.getElementById("imageViewerClose").addEventListener("click", closeImageViewer);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && viewer.classList.contains("open")) closeImageViewer();
  });
})();

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderFeed();
  });
});

// ── Vote ──────────────────────────────────────────────────────────────────────
window.voteIssue = async function(issueId) {
  if (!currentUser) return;
  const issue = currentIssues.find(i => i.id === issueId);
  if (!issue) return;
  if (issue.votedBy?.includes(currentUser.uid)) { showToast("Already voted!", "error"); return; }
  await updateDoc(doc(db, "issues", issueId), {
    votes: increment(1),
    votedBy: [...(issue.votedBy || []), currentUser.uid],
  });
  await updateUserStats({ points: 5, votes: 1 });
  logActivity("verified", `Verified "${issue.title}"`);
  showToast("+5 points for verifying!", "success");
};

// ── Detail Modal ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  currentDetailIssue = currentIssues.find(i => i.id === id);
  const issue = currentDetailIssue;
  if (!issue) return;
  document.getElementById("detailTitle").textContent = issue.title;

  const beforeAfterHtml = (issue.imageUrl && issue.resolvedImageUrl)
    ? `<div class="before-after">
        <div class="ba-item"><span class="ba-label">Before</span><img src="${issue.imageUrl}" /></div>
        <div class="ba-item"><span class="ba-label">After (Resolved)</span><img src="${issue.resolvedImageUrl}" /></div>
       </div>`
    : issue.imageUrl ? `<img class="detail-img" src="${issue.imageUrl}" />` : "";

  const escalateHtml = isEscalated(issue)
    ? `<button class="escalate-btn" onclick="openComplaintLetter()">📨 Generate Complaint Letter</button>` : "";

  const resolvedUploadHtml = (issue.status !== "resolved" || !issue.resolvedImageUrl)
    ? `<div class="resolved-upload" id="resolvedUploadArea" style="margin-top:10px">
        📸 Add resolution photo (after fix)<input type="file" id="resolvedPhotoInput" accept="image/*" hidden />
       </div>` : "";

  document.getElementById("detailBody").innerHTML = `
    ${beforeAfterHtml}
    <div class="detail-meta">
      <span class="status-badge ${issue.status}">${statusLabel(issue.status)}</span>
      <span class="issue-category-tag">${issue.category}</span>
      <span style="font-size:12px;color:var(--text2)">${issue.severity}</span>
      ${isEscalated(issue) ? `<span class="escalated-badge">🚨 Escalated</span>` : ""}
    </div>
    <div class="tracker-wrap"><div class="tracker-title">Status Tracker</div>${renderStatusTracker(issue)}</div>
    <div class="detail-desc">${issue.description || "No description provided."}</div>
    ${issue.aiAnalysis ? `<div class="detail-ai-box"><h4>AI Insight</h4><p>${issue.aiAnalysis}</p></div>` : ""}
    ${(issue.estimatedCost || issue.materials || issue.jurisdiction) ? `<div class="detail-estimate">
      <h4>AI Works Estimate</h4>
      ${issue.estimatedCost ? `<div class="de-row"><span>💰 Estimated cost</span><strong>${issue.estimatedCost}</strong></div>` : ""}
      ${issue.materials ? `<div class="de-row"><span>🧰 Materials</span><strong>${issue.materials}</strong></div>` : ""}
      ${issue.jurisdiction ? `<div class="de-row"><span>⚖️ Jurisdiction</span><strong>${issue.jurisdiction}</strong></div>` : ""}
    </div>` : ""}
    ${issue.department ? `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">🏢 Department: <strong>${issue.department}</strong></div>` : ""}
    <div style="font-size:12px;color:#8b949e;margin-bottom:14px">
      📍 ${issue.location || "Unknown"} &nbsp;·&nbsp; ✅ ${issue.votes || 0} verifications &nbsp;·&nbsp; ${formatDate(issue.createdAt)}
    </div>
    ${resolvedUploadHtml}
    <div class="detail-actions">
      <button class="vote-btn" onclick="voteIssue('${issue.id}')">+1 Verify (${issue.votes || 0})</button>
      <select class="status-select" onchange="updateStatus('${issue.id}', this.value)">
        ${statusOptionsHtml(issue.status)}
      </select>
      ${escalateHtml}
    </div>`;

  // Resolved photo upload
  const rUpload = document.getElementById("resolvedUploadArea");
  const rInput  = document.getElementById("resolvedPhotoInput");
  if (rUpload && rInput) {
    rUpload.addEventListener("click", () => rInput.click());
    rInput.addEventListener("change", e => uploadResolvedPhoto(issue.id, e.target.files[0]));
  }

  // Click any photo in the detail view (incl. before/after) to open the lightbox
  document.querySelectorAll("#detailBody .detail-img, #detailBody .before-after img").forEach(img => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => openImageViewer(img.src));
  });

  document.getElementById("detailModal").classList.add("open");
}

async function uploadResolvedPhoto(issueId, file) {
  if (!file) return;
  showToast("Uploading resolution photo…");
  const compressed = await compressImage(file);
  const sRef = ref(storage, `resolved/${issueId}_${Date.now()}.jpg`);
  await uploadBytes(sRef, compressed);
  const url = await getDownloadURL(sRef);
  const now = new Date().toISOString();
  await updateDoc(doc(db, "issues", issueId), {
    resolvedImageUrl: url, status: "resolved", resolvedAt: now, "history.resolved": now,
  });
  showToast("Resolution photo added!", "success");
  document.getElementById("detailModal").classList.remove("open");
}

window.updateStatus = async function(id, status) {
  const now = new Date().toISOString();
  const patch = { status, statusUpdatedAt: now, [`history.${status}`]: now };
  if (status === "resolved") patch.resolvedAt = now;
  await updateDoc(doc(db, "issues", id), patch);
  showToast(`Status → ${statusLabel(status)}`, "success");
};

document.getElementById("closeDetailBtn").addEventListener("click", () => {
  document.getElementById("detailModal").classList.remove("open");
});

// Share
document.getElementById("shareIssueBtn").addEventListener("click", () => {
  const issue = currentDetailIssue;
  if (!issue) return;
  const text = `🚨 Community Issue: "${issue.title}" at ${issue.location || "our area"}. Help get it resolved! Report & track on CivicPulse.`;
  const url  = window.location.href;
  if (navigator.share) {
    navigator.share({ title: issue.title, text, url }).catch(() => {});
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`, "_blank");
  }
});

// ── Complaint Letter ──────────────────────────────────────────────────────────
window.openComplaintLetter = async function() {
  const issue = currentDetailIssue;
  if (!issue) return;
  document.getElementById("detailModal").classList.remove("open");
  document.getElementById("complaintContent").textContent = "Generating complaint letter with AI…";
  document.getElementById("complaintModal").classList.add("open");

  const days = Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / 86400000);
  const prompt = `Generate a formal complaint letter to the Municipal Corporation about this unresolved civic issue:
Title: ${issue.title}
Category: ${issue.category}
Location: ${issue.location || "Community area"}
Description: ${issue.description || "Issue requires urgent attention"}
Community verifications: ${issue.votes}
Days unresolved: ${days}
Responsible department: ${issue.department || "Public Works Department"}
Jurisdiction (who legally owns/fixes this): ${issue.jurisdiction || "local municipal body"}
${issue.estimatedCost ? `Estimated repair cost: ${issue.estimatedCost}` : ""}

Write a professional formal complaint letter addressed to the correct authority for the jurisdiction above (e.g. Municipal Commissioner for city, State PWD for state highways, the utility company for private utilities). Include:
- Subject line
- Formal salutation to the correct authority based on jurisdiction
- Clear description of the problem and its impact
- Reference to community support (${issue.votes} verified reports)
- Request for urgent action with a specific deadline
- Formal closing

Keep it under 300 words. Be firm but respectful.`;

  try {
    const res = await callGemini(prompt, 0.3);
    document.getElementById("complaintContent").textContent = res;
  } catch {
    document.getElementById("complaintContent").textContent = "Failed to generate letter. Please try again.";
  }
};

document.getElementById("closeComplaintBtn").addEventListener("click", () => {
  document.getElementById("complaintModal").classList.remove("open");
});
document.getElementById("closeComplaintBtn2").addEventListener("click", () => {
  document.getElementById("complaintModal").classList.remove("open");
});
document.getElementById("copyLetterBtn").addEventListener("click", () => {
  const text = document.getElementById("complaintContent").textContent;
  navigator.clipboard.writeText(text).then(() => showToast("Letter copied!", "success"));
});

// ── Report Modal ──────────────────────────────────────────────────────────────
document.getElementById("openReportBtn").addEventListener("click", () => {
  resetReportModal();
  document.getElementById("reportModal").classList.add("open");
});

function resetReportModal() {
  showStep(1);
  uploadedImageFile = uploadedImageB64 = null;
  selectedLat = selectedLng = null;
  document.getElementById("photoPreview").classList.add("hidden");
  document.getElementById("uploadArea").classList.remove("hidden");
  document.getElementById("analyzeBtn").disabled = true;
  document.getElementById("issueTitle").value    = "";
  document.getElementById("issueDesc").value     = "";
  document.getElementById("issueLocation").value = "";
  document.getElementById("locationStatus").textContent = "";
  document.getElementById("aiResultCard").innerHTML = `<div class="ai-analyzing"><div class="spinner"></div><p>Gemini is analyzing your photo…</p></div>`;
  try { recognition?.abort?.(); } catch {}
  document.getElementById("voiceRec")?.classList.add("hidden");
  voiceReportBtn?.classList.remove("hidden");
}

document.getElementById("closeModalBtn").addEventListener("click", () => {
  document.getElementById("reportModal").classList.remove("open");
});

function showStep(n) {
  document.querySelectorAll(".step").forEach((s, i) => s.classList.toggle("active", i + 1 === n));
}

// Photo
const uploadArea = document.getElementById("uploadArea");
const photoInput = document.getElementById("photoInput");

uploadArea.addEventListener("click", () => photoInput.click());
uploadArea.addEventListener("dragover",  e => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => { e.preventDefault(); uploadArea.classList.remove("drag-over"); handlePhotoFile(e.dataTransfer.files[0]); });
photoInput.addEventListener("change", e => handlePhotoFile(e.target.files[0]));
document.getElementById("changePhotoBtn").addEventListener("click", () => photoInput.click());

function handlePhotoFile(file) {
  if (!file) return;
  // Some browsers report an empty type for HEIC/HEIF photos from iPhones —
  // accept those instead of silently rejecting them.
  if (file.type && !file.type.startsWith("image/")) {
    showToast("Please select an image file", "error");
    return;
  }
  uploadedImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("previewImg").src = e.target.result;
    uploadedImageB64 = e.target.result.split(",")[1];
    document.getElementById("photoPreview").classList.remove("hidden");
    uploadArea.classList.add("hidden");
    document.getElementById("analyzeBtn").disabled = false;
  };
  reader.onerror = () => showToast("Couldn't read that image — try another photo", "error");
  reader.readAsDataURL(file);
}

// Gemini Analyze
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  if (!uploadedImageB64) return;
  document.getElementById("analyzeBtn").disabled = true;
  document.getElementById("analyzeBtn").textContent = "Analyzing…";
  showStep(2);
  const stopScan = startAiScan();
  const result = await analyzeWithGemini(uploadedImageB64);
  stopScan();
  populateFromAI(result);
  autoLocate();
  document.getElementById("analyzeBtn").textContent = "✨ Analyze with Gemini AI";
});

function startAiScan() {
  const src  = document.getElementById("previewImg").src;
  const card = document.getElementById("aiResultCard");
  card.innerHTML = `
    <div class="ai-scan-wrap">
      ${src ? `<img src="${src}" alt="Analyzing" />` : ""}
      <div class="ai-scan-overlay"></div>
      <div class="ai-scan-line"></div>
    </div>
    <div class="ai-scan-status"><div class="spinner"></div><span class="ai-scan-text" id="aiScanText">Determining location…</span></div>`;
  const steps = ["Determining location…", "Identifying the issue…", "Assessing severity…", "Routing to department…", "Drafting report…"];
  let i = 0;
  const el = document.getElementById("aiScanText");
  const timer = setInterval(() => {
    i = (i + 1) % steps.length;
    if (!el) return;
    el.style.opacity = "0";
    setTimeout(() => { el.textContent = steps[i]; el.style.opacity = "1"; }, 220);
  }, 1100);
  return () => clearInterval(timer);
}

async function analyzeWithGemini(b64) {
  const prompt = `Analyze this photo of a civic infrastructure issue. You are an experienced municipal works estimator.
Respond ONLY with valid JSON, no markdown:
{"title":"short issue title (max 8 words)","category":"pothole|streetlight|water|waste|road|drainage|other","severity":"low|medium|high|critical","description":"2-3 sentence description","department":"responsible government department","jurisdiction":"city|state highway|private utility|local body|unclear — who legally owns/fixes this","estimatedResolution":"days as number","estimatedCost":"rough repair cost range in INR, e.g. ₹2,000–5,000","materials":"comma-separated materials/equipment likely required","aiInsight":"one actionable recommendation"}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": window.CONFIG.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
          generationConfig: { temperature: 0.1 },
        })
      }
    );
    const json = await res.json();
    if (!res.ok) { console.error("Gemini error:", json.error?.message); return {}; }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch (e) { console.error("Gemini parse error:", e); return {}; }
}

function populateFromAI(r) {
  const hasData = r.title || r.description || r.category;
  document.getElementById("aiResultCard").innerHTML = hasData ? `
    <div class="ai-result">
      <div><span class="ai-badge">Gemini AI</span></div>
      <div class="ai-result-title">${r.title || ""}</div>
      ${r.description ? `<div class="ai-result-desc">${r.description}</div>` : ""}
      <div class="ai-chips">
        ${r.category ? `<span class="ai-chip">${r.category}</span>` : ""}
        ${r.severity ? `<span class="ai-chip">${r.severity}</span>` : ""}
        ${r.estimatedResolution ? `<span class="ai-chip">~${r.estimatedResolution} days</span>` : ""}
        ${r.department ? `<span class="ai-chip dept">${r.department}</span>` : ""}
      </div>
      ${(r.estimatedCost || r.materials || r.jurisdiction) ? `<div class="ai-estimate">
        ${r.estimatedCost ? `<div><span>Est. cost</span><strong>${r.estimatedCost}</strong></div>` : ""}
        ${r.materials ? `<div><span>Materials</span><strong>${r.materials}</strong></div>` : ""}
        ${r.jurisdiction ? `<div><span>Jurisdiction</span><strong>${r.jurisdiction}</strong></div>` : ""}
      </div>` : ""}
      ${r.aiInsight ? `<div style="font-size:11px;color:var(--blue);margin-top:4px">Tip: ${r.aiInsight}</div>` : ""}
    </div>` : `<div style="color:var(--text2);font-size:13px;padding:8px">AI analysis unavailable — fill in details manually.</div>`;

  if (r.title) document.getElementById("issueTitle").value = r.title;
  if (r.description) document.getElementById("issueDesc").value = r.description;
  const catSel = document.getElementById("issueCategory");
  if (r.category && [...catSel.options].some(o => o.value === r.category)) catSel.value = r.category;
  const sevSel = document.getElementById("issueSeverity");
  if (r.severity && [...sevSel.options].some(o => o.value === r.severity)) sevSel.value = r.severity;
  const aiCard = document.getElementById("aiResultCard");
  aiCard.dataset.analysis     = r.aiInsight     || "";
  aiCard.dataset.department   = r.department    || "";
  aiCard.dataset.jurisdiction = r.jurisdiction  || "";
  aiCard.dataset.estimatedcost= r.estimatedCost || "";
  aiCard.dataset.materials    = r.materials     || "";
}

// ── Voice-native reporting ────────────────────────────────────────────────────
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null, voiceFinal = "";
const voiceReportBtn = document.getElementById("voiceReportBtn");
if (!SpeechRec && voiceReportBtn) voiceReportBtn.style.display = "none";

voiceReportBtn?.addEventListener("click", startVoiceReport);
document.getElementById("voiceStopBtn")?.addEventListener("click", () => recognition?.stop());

function startVoiceReport() {
  if (!SpeechRec) { showToast("Voice input isn't supported on this browser", "error"); return; }
  voiceFinal = "";
  recognition = new SpeechRec();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = true;
  const rec = document.getElementById("voiceRec");
  const recText = document.getElementById("voiceRecText");
  rec.classList.remove("hidden");
  voiceReportBtn.classList.add("hidden");

  recognition.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) voiceFinal += t + " "; else interim += t;
    }
    recText.textContent = (voiceFinal + interim).trim() || "Listening…";
  };
  recognition.onerror = ev => {
    rec.classList.add("hidden"); voiceReportBtn.classList.remove("hidden");
    showToast(ev.error === "not-allowed" ? "Microphone permission denied" : "Voice error — try again", "error");
  };
  recognition.onend = async () => {
    rec.classList.add("hidden"); voiceReportBtn.classList.remove("hidden");
    const transcript = voiceFinal.trim();
    if (!transcript) { showToast("Didn't catch that — try again", "error"); return; }
    await processVoiceTranscript(transcript);
  };
  recognition.start();
}

async function processVoiceTranscript(transcript) {
  showStep(2);
  document.getElementById("aiResultCard").innerHTML =
    `<div class="ai-analyzing"><div class="spinner"></div><p>Understanding your spoken report…</p></div>`;
  const prompt = `A citizen verbally reported a civic infrastructure issue.
Transcript: "${transcript}"
Extract structured data. Respond ONLY with valid JSON, no markdown:
{"title":"short title (max 8 words)","category":"pothole|streetlight|water|waste|road|drainage|other","severity":"low|medium|high|critical","description":"2-3 sentence cleaned-up description","location":"location mentioned or empty string","jurisdiction":"city|state highway|private utility|local body|unclear","estimatedCost":"rough INR range or empty","materials":"likely materials or empty","aiInsight":"one actionable recommendation"}`;
  let result = {};
  try {
    const txt = await callGemini(prompt, 0.2, true);
    result = parseJSONLoose(txt) || {};
  } catch (e) { console.error("Voice extraction error:", e); }
  populateFromAI(result);
  if (result.location) document.getElementById("issueLocation").value = result.location;
  autoLocate();
  showToast("Report drafted from your voice — review & submit", "success");
}

// Location
function autoLocate() {
  document.getElementById("locationStatus").textContent = "Detecting location…";
  if (!navigator.geolocation) { document.getElementById("locationStatus").textContent = "Geolocation not supported."; return; }
  navigator.geolocation.getCurrentPosition(async pos => {
    selectedLat = pos.coords.latitude;
    selectedLng = pos.coords.longitude;
    const locEl = document.getElementById("issueLocation");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${selectedLat}&lon=${selectedLng}&format=json`);
      const d = await r.json();
      const addr = d.display_name || `${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`;
      // Don't overwrite a location the user already described (e.g. via voice)
      if (!locEl.value.trim()) locEl.value = addr;
      document.getElementById("locationStatus").textContent = "📍 GPS location captured";
    } catch {
      if (!locEl.value.trim()) locEl.value = `${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`;
      document.getElementById("locationStatus").textContent = "Location set";
    }
    checkDuplicates();
  }, () => { document.getElementById("locationStatus").textContent = "Could not detect — type manually."; });
}

// ── Geo-temporal duplicate detection ──────────────────────────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkDuplicates() {
  const warn = document.getElementById("dupWarning");
  warn.classList.add("hidden");
  if (selectedLat == null || selectedLng == null) return;
  const category = document.getElementById("issueCategory").value;
  const RADIUS_M = 200, MAX_AGE_DAYS = 14;

  const candidate = currentIssues
    .filter(i => i.lat && i.lng && i.status !== "resolved" && i.category === category)
    .map(i => ({ i, dist: haversineMeters(selectedLat, selectedLng, i.lat, i.lng) }))
    .filter(x => x.dist <= RADIUS_M)
    .filter(x => (Date.now() - new Date(x.i.createdAt).getTime()) / 86400000 <= MAX_AGE_DAYS)
    .sort((a, b) => a.dist - b.dist)[0];

  if (!candidate) return;
  const { i, dist } = candidate;
  const days = Math.floor((Date.now() - new Date(i.createdAt).getTime()) / 86400000);
  const when = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  warn.innerHTML = `
    <h4>⚠️ Possible duplicate detected</h4>
    <p>A similar <strong>${i.category}</strong> issue — "<strong>${escapeHtmlSafe(i.title)}</strong>" — was reported <strong>${Math.round(dist)}m away</strong>, ${when} (${i.votes||0} verifications). Verifying the existing report helps officials more than a duplicate.</p>
    <div class="dup-actions">
      <button class="dup-verify" id="dupVerifyBtn">✓ Verify the existing report instead</button>
      <button class="dup-dismiss" id="dupDismissBtn">It's a different issue — continue</button>
    </div>`;
  warn.classList.remove("hidden");
  document.getElementById("dupVerifyBtn").onclick = async () => {
    await voteIssue(i.id);
    document.getElementById("reportModal").classList.remove("open");
    openDetail(i.id);
  };
  document.getElementById("dupDismissBtn").onclick = () => warn.classList.add("hidden");
}

function escapeHtmlSafe(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

document.getElementById("locateBtn").addEventListener("click", autoLocate);

// Submit
function compressImage(file, maxWidth = 1024, quality = 0.72) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { URL.revokeObjectURL(url); } catch {}
      clearTimeout(timer);
      resolve(result);
    };

    // Safety net: if decoding/encoding never completes (e.g. HEIC on Chrome,
    // huge image on a low-memory device), fall back to the original file so
    // the upload still succeeds instead of hanging forever.
    const timer = setTimeout(() => done(file), 12000);

    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / (img.width || maxWidth));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.max(1, Math.round((img.width  || maxWidth) * scale));
        canvas.height = Math.max(1, Math.round((img.height || maxWidth) * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          blob => done(blob && blob.size > 0 ? blob : file),
          "image/jpeg",
          quality
        );
      } catch {
        done(file);
      }
    };
    img.onerror = () => done(file);
    img.src = url;
  });
}

document.getElementById("submitIssueBtn").addEventListener("click", submitIssue);

async function submitIssue() {
  const title    = document.getElementById("issueTitle").value.trim();
  const category = document.getElementById("issueCategory").value;
  const severity = document.getElementById("issueSeverity").value;
  const desc     = document.getElementById("issueDesc").value.trim();
  const location = document.getElementById("issueLocation").value.trim();
  const aiCard   = document.getElementById("aiResultCard");
  if (!title) { showToast("Please add a title", "error"); return; }

  const btn = document.getElementById("submitIssueBtn");
  btn.disabled = true;
  try {
    let imageUrl = null;
    if (uploadedImageFile) {
      btn.textContent = "Compressing…";
      const compressed = await compressImage(uploadedImageFile);
      btn.textContent = "Uploading photo…";
      const sRef = ref(storage, `issues/${Date.now()}.jpg`);
      await uploadBytes(sRef, compressed);
      imageUrl = await getDownloadURL(sRef);
    }
    btn.textContent = "Saving…";
    await addDoc(collection(db, "issues"), {
      title, category, severity, description: desc, location,
      imageUrl, lat: selectedLat, lng: selectedLng,
      status: "open", votes: 0, votedBy: [],
      reportedBy:    currentUser?.uid || "anonymous",
      aiAnalysis:    aiCard.dataset.analysis      || "",
      department:    aiCard.dataset.department    || "",
      jurisdiction:  aiCard.dataset.jurisdiction  || "",
      estimatedCost: aiCard.dataset.estimatedcost || "",
      materials:     aiCard.dataset.materials     || "",
      createdAt:   new Date().toISOString(),
    });
    await updateUserStats({ points: 50, reports: 1 });
    logActivity("reported", `Reported "${title}" (${category})`);
    document.getElementById("pointsEarned").textContent = "+50 points earned!";
    showStep(3);
  } catch (e) {
    showToast("Error: " + e.message, "error");
    btn.disabled = false; btn.textContent = "Submit Report";
  }
}

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("reportModal").classList.remove("open");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelector("[data-view='map']").classList.add("active");
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-map").classList.add("active");
  if (map) setTimeout(() => map.invalidateSize(), 50);
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
// ── Weather-aware predictive alert (Open-Meteo, free & keyless) ───────────────
let weatherCache = { ts: 0, html: "" };
async function updateWeatherAlert() {
  const el = document.getElementById("weatherAlert");
  if (!el) return;
  // Cache 15 min to avoid refetching on every dashboard open
  if (weatherCache.html && Date.now() - weatherCache.ts < 15 * 60 * 1000) {
    el.className = "weather-alert"; el.innerHTML = weatherCache.html; return;
  }
  const lat = selectedLat ?? 19.076, lng = selectedLng ?? 72.8777;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,precipitation_probability_max&timezone=auto&forecast_days=2`);
    const d = await r.json();
    const rainMM  = Math.max(...(d.daily?.precipitation_sum || [0]));
    const rainPct = Math.max(...(d.daily?.precipitation_probability_max || [0]));

    const atRisk = currentIssues.filter(i =>
      i.status !== "resolved" && ["drainage", "water", "pothole", "road"].includes(i.category)).length;

    el.className = "weather-alert";
    if (rainMM >= 5 || rainPct >= 60) {
      weatherCache.html = `
        <div class="wx-icon">🌧️</div>
        <div class="wx-body">
          <div class="wx-title high">Elevated flood/road risk — rain forecast</div>
          <div class="wx-detail">Up to <strong>${rainMM.toFixed(0)}mm</strong> rain (${rainPct}% chance) expected in the next 48h. <strong>${atRisk}</strong> unresolved drainage / water / road issues in this area are at higher risk. Recommend preventative drain-clearing in known hotspots.</div>
        </div>`;
    } else {
      weatherCache.html = `
        <div class="wx-icon">☀️</div>
        <div class="wx-body">
          <div class="wx-title low">No weather-related risk detected</div>
          <div class="wx-detail">Low rainfall expected (${rainMM.toFixed(0)}mm, ${rainPct}% chance) over the next 48h. Conditions are stable for routine resolution.</div>
        </div>`;
    }
    weatherCache.ts = Date.now();
    el.innerHTML = weatherCache.html;
  } catch {
    el.className = "weather-alert";
    el.innerHTML = `<div class="wx-icon">🌐</div><div class="wx-body"><div class="wx-detail">Weather forecast unavailable right now.</div></div>`;
  }
}

async function renderDashboard() {
  const total    = currentIssues.length;
  const resolved = currentIssues.filter(i => i.status === "resolved").length;
  const open     = currentIssues.filter(i => i.status === "open").length;
  const inProg   = currentIssues.filter(i => i.status === "in_progress").length;

  document.getElementById("d-total").textContent    = total;
  document.getElementById("d-resolved").textContent = resolved;
  document.getElementById("d-open").textContent     = open;
  document.getElementById("d-progress").textContent = inProg;

  updateWeatherAlert();

  const cats = {}, sevs = { low:0, medium:0, high:0, critical:0 };
  currentIssues.forEach(i => {
    cats[i.category] = (cats[i.category] || 0) + 1;
    if (sevs[i.severity] !== undefined) sevs[i.severity]++;
  });

  if (googleChartsReady && window.google) {
    drawCategoryChart(cats);
    drawSeverityChart(sevs);
  } else {
    // Fallback bars
    const maxCat = Math.max(...Object.values(cats), 1);
    document.getElementById("categoryChart").innerHTML = Object.entries(cats).sort(([,a],[,b])=>b-a)
      .map(([k,v]) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:12px;color:#8b949e;width:90px">${k}</span>
        <div style="flex:1;background:#21262d;border-radius:4px;height:8px;overflow:hidden">
          <div style="width:${(v/maxCat)*100}%;height:100%;background:#58a6ff;border-radius:4px"></div></div>
        <span style="font-size:12px;font-weight:600;width:20px">${v}</span></div>`).join("") || "<div style='color:#8b949e;font-size:13px;padding:16px 0'>No data yet</div>";

    const maxSev = Math.max(...Object.values(sevs), 1);
    const sevColors = { critical:"#f85149", high:"#e3853a", medium:"#d29922", low:"#3fb950" };
    document.getElementById("severityChart").innerHTML = Object.entries(sevs)
      .map(([k,v]) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:12px;color:#8b949e;width:60px">${k}</span>
        <div style="flex:1;background:#21262d;border-radius:4px;height:8px;overflow:hidden">
          <div style="width:${(v/maxSev)*100}%;height:100%;background:${sevColors[k]};border-radius:4px"></div></div>
        <span style="font-size:12px;font-weight:600;width:20px">${v}</span></div>`).join("");
  }

  maybeGenerateInsights(currentIssues);
}

function drawCategoryChart(cats) {
  const data = new google.visualization.DataTable();
  data.addColumn("string", "Category");
  data.addColumn("number", "Issues");
  Object.entries(cats).sort(([,a],[,b]) => b-a).forEach(([k,v]) => data.addRow([k, v]));
  const chart = new google.visualization.BarChart(document.getElementById("categoryChart"));
  const t = chartTheme();
  chart.draw(data, {
    backgroundColor: "transparent",
    colors: [t.accent],
    legend: { position: "none" },
    fontName: "Inter",
    hAxis: { textStyle: { color: t.text2, fontSize: 11 }, gridlines: { color: t.grid }, baselineColor: t.grid },
    vAxis: { textStyle: { color: t.text2, fontSize: 11 } },
    chartArea: { width: "68%", height: "80%", top: 8 },
    bar: { groupWidth: "60%" },
  });
}

function chartTheme() {
  return currentTheme() === "light"
    ? { accent: "#2563eb", text2: "#64748b", grid: "#e7e9ee", pieBorder: "#ffffff", sev: ["#dc2626", "#ea580c", "#d97706", "#16a34a"] }
    : { accent: "#3b82f6", text2: "#8b949e", grid: "#21262d", pieBorder: "#161b22", sev: ["#f85149", "#e3853a", "#d29922", "#3fb950"] };
}

function drawSeverityChart(sevs) {
  const rows = [["Critical", sevs.critical||0], ["High", sevs.high||0], ["Medium", sevs.medium||0], ["Low", sevs.low||0]].filter(([,v])=>v>0);
  if (!rows.length) { document.getElementById("severityChart").innerHTML = `<div style="color:#8b949e;font-size:13px;padding:16px 0;text-align:center">No data yet</div>`; return; }
  const data = new google.visualization.DataTable();
  data.addColumn("string", "Severity");
  data.addColumn("number", "Count");
  rows.forEach(r => data.addRow(r));
  const chart = new google.visualization.PieChart(document.getElementById("severityChart"));
  const t = chartTheme();
  chart.draw(data, {
    backgroundColor: "transparent",
    colors: t.sev,
    legend: { textStyle: { color: t.text2, fontSize: 11 } },
    fontName: "Inter",
    chartArea: { width: "88%", height: "88%" },
    pieSliceBorderColor: t.pieBorder,
  });
}

// Cache insights so we don't burn Gemini quota on every dashboard open
let insightsCache = { html: "", ts: 0, count: -1 };
const INSIGHTS_TTL = 5 * 60 * 1000; // 5 minutes

function maybeGenerateInsights(issues) {
  const el = document.getElementById("aiInsights");
  if (!issues.length) {
    el.innerHTML = `<div class="insight-card"><div class="insight-type">Tip</div><p>Report the first issue to unlock AI-powered community insights.</p></div>`;
    return;
  }
  const fresh = insightsCache.html &&
                insightsCache.count === issues.length &&
                (Date.now() - insightsCache.ts) < INSIGHTS_TTL;
  if (fresh) { el.innerHTML = insightsCache.html; return; }
  generateAIInsights(issues);
}

async function generateAIInsights(issues) {
  const el = document.getElementById("aiInsights");
  el.innerHTML = `<div class="insight-loading">Generating AI insights…</div>`;
  const summary = {
    total: issues.length,
    categories: {},
    severities: {},
    resolutionRate: (issues.filter(i=>i.status==="resolved").length / issues.length * 100).toFixed(0) + "%",
  };
  issues.forEach(i => {
    summary.categories[i.category] = (summary.categories[i.category] || 0) + 1;
    summary.severities[i.severity] = (summary.severities[i.severity] || 0) + 1;
  });
  try {
    const text = await callGemini(
      `Community issue data: ${JSON.stringify(summary)}. Give exactly 3 short, actionable community insights. Respond as a JSON array of objects, each with keys "type" (one of Trend, Alert, Recommendation) and "insight" (one sentence).`,
      0.4, true
    );
    const insights = parseJSONLoose(text);
    if (!Array.isArray(insights) || !insights.length) throw new Error("Empty insights");
    const html = insights.map(ins => `
      <div class="insight-card">
        <div class="insight-type">${escapeHtml(ins.type || "Insight")}</div>
        <p>${escapeHtml(ins.insight || "")}</p>
      </div>`).join("");
    el.innerHTML = html;
    insightsCache = { html, ts: Date.now(), count: issues.length };
  } catch (e) {
    console.error("AI Insights error:", e);
    const wait = rateLimitSeconds(e);
    el.innerHTML = wait
      ? `<div class="insight-card"><div class="insight-type">Busy</div><p>AI is rate-limited. Insights will be available again in ~${wait}s.</p></div>`
      : `<div class="insight-card"><div class="insight-type">Tip</div><p>Submit more issues to generate AI-powered insights.</p></div>`;
  }
}

// Extract retry seconds from a Gemini 429 quota error message
function rateLimitSeconds(err) {
  const m = String(err?.message || "").match(/retry in ([\d.]+)s/i);
  if (m) return Math.ceil(parseFloat(m[1]));
  if (/quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(String(err?.message || ""))) return 30;
  return 0;
}

// AI Agent
document.getElementById("runAgentBtn").addEventListener("click", runAIAgent);

async function runAIAgent() {
  const btn = document.getElementById("runAgentBtn");
  const out = document.getElementById("agentOutput");

  if (!currentIssues.length) {
    out.innerHTML = `<div class="agent-idle">No issues reported yet. The AI Agent needs at least one reported issue to analyze. Report an issue first, then run the analysis.</div>`;
    return;
  }

  btn.disabled = true; btn.textContent = "Analyzing…";
  out.innerHTML = `<div class="agent-thinking">AI Agent is scanning all community issues…</div>`;

  const sample = currentIssues.slice(0, 25).map(i => ({
    title: i.title, category: i.category, severity: i.severity,
    location: i.location, votes: i.votes, status: i.status,
    daysOld: Math.floor((Date.now() - new Date(i.createdAt).getTime()) / 86400000),
  }));

  const prompt = `You are an AI civic agent analyzing community-reported infrastructure issues.

Issue data (${sample.length} issues):
${JSON.stringify(sample)}

Provide an agentic analysis with exactly 4 findings — one of each type below:
- PATTERN: clustering or trends of issues by area/category
- ALERT: critical or long-overdue issues needing immediate attention
- PREDICTION: what issues might arise next based on current patterns
- ACTION: a specific recommendation for the community or authorities

Respond with a JSON array of exactly 4 objects, each with these keys:
"type" (one of PATTERN, ALERT, PREDICTION, ACTION),
"priority" (one of high, medium, low),
"title" (short, max 8 words),
"detail" (one or two sentences).`;

  try {
    const text     = await callGemini(prompt, 0.3, true);
    const findings = parseJSONLoose(text);
    if (!Array.isArray(findings) || !findings.length) throw new Error("Empty findings");
    out.innerHTML  = findings.map(f => {
      const pr = (f.priority || "medium").toLowerCase();
      return `
      <div class="agent-finding ${pr}">
        <div class="finding-header">
          <span class="finding-type">${escapeHtml(f.type || "INSIGHT")}</span>
          <span class="finding-priority ${pr}">${pr.toUpperCase()}</span>
        </div>
        <div class="finding-title">${escapeHtml(f.title || "")}</div>
        <div class="finding-detail">${escapeHtml(f.detail || "")}</div>
      </div>`;
    }).join("");
  } catch (e) {
    console.error("AI Agent error:", e);
    const wait = rateLimitSeconds(e);
    if (wait) {
      let remaining = wait;
      out.innerHTML = `<div class="agent-idle">AI is busy (free-tier limit reached). Auto-retrying in <b id="agentCountdown">${remaining}</b>s…</div>`;
      const timer = setInterval(() => {
        remaining--;
        const cd = document.getElementById("agentCountdown");
        if (cd) cd.textContent = remaining;
        if (remaining <= 0) { clearInterval(timer); runAIAgent(); }
      }, 1000);
    } else {
      out.innerHTML = `<div style="color:#f85149;font-size:13px;padding:8px">Agent analysis failed: ${escapeHtml(e.message)}. Please try again.</div>`;
    }
  }
  btn.disabled = false; btn.textContent = "▶ Run Analysis";
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function renderLeaderboard() {
  const snap  = await getDocs(collection(db, "users")).catch(() => null);
  if (!snap) return;
  const users = snap.docs.map(d => d.data()).sort((a,b) => (b.points||0) - (a.points||0));
  const medals = ["🥇","🥈","🥉"];
  const topCls = ["top1","top2","top3"];
  document.getElementById("leaderboardList").innerHTML = users.slice(0,10).map((u,i) => `
    <div class="leader-row ${topCls[i]||""}">
      <div class="leader-rank">${medals[i]||i+1}</div>
      <div class="leader-info">
        <div class="leader-name">${u.name||"Anonymous Hero"}</div>
        <div class="leader-badges">${getBadge(u.points||0)} · ${u.reports||0} reports · ${u.votes||0} verifications</div>
      </div>
      <div class="leader-points">${u.points||0} pts</div>
    </div>`).join("") || `<div class="loading-spinner">No heroes yet. Be the first!</div>`;
  refreshUserHUD();
}

// ── Official Portal — Triage Command Center ───────────────────────────────────
const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };

// Access control — restricted to authorized municipal staff
function officialAccessGranted() {
  if (isAdmin()) return true;
  const emails = (window.CONFIG.OFFICIAL_EMAILS || []).map(e => e.toLowerCase());
  if (currentUser?.email && emails.includes(currentUser.email.toLowerCase())) return true;
  return localStorage.getItem("cp_official_ok") === "1";
}

function openOfficialView() {
  const lock  = document.getElementById("officialLock");
  const panel = document.getElementById("officialPanel");
  if (officialAccessGranted()) {
    lock.style.display = "none";
    panel.style.display = "";
    renderOfficialPortal();
  } else {
    lock.style.display = "flex";
    panel.style.display = "none";
    const code = document.getElementById("officialCode");
    if (code) code.value = "";
    const msg = document.getElementById("officialLockMsg");
    if (msg) msg.textContent = "";
  }
}

function tryOfficialUnlock() {
  const code = (document.getElementById("officialCode").value || "").trim();
  const msg  = document.getElementById("officialLockMsg");
  if (code && code === window.CONFIG.OFFICIAL_PASSCODE) {
    localStorage.setItem("cp_official_ok", "1");
    showToast("Access granted — welcome, official.", "success");
    openOfficialView();
  } else {
    msg.textContent = "Incorrect access code. Please contact your department admin.";
  }
}

document.getElementById("officialUnlockBtn")?.addEventListener("click", tryOfficialUnlock);
document.getElementById("officialCode")?.addEventListener("keydown", e => { if (e.key === "Enter") tryOfficialUnlock(); });

function getOfficialIssues() {
  let issues = currentIssues;
  if (officialFilter !== "all") issues = issues.filter(i => (i.department||"General") === officialFilter);
  const sorters = {
    urgency:  (a,b) => (isEscalated(b)-isEscalated(a)) || ((SEVERITY_RANK[b.severity]||0)-(SEVERITY_RANK[a.severity]||0)) || ((b.votes||0)-(a.votes||0)),
    severity: (a,b) => ((SEVERITY_RANK[b.severity]||0)-(SEVERITY_RANK[a.severity]||0)) || ((b.votes||0)-(a.votes||0)),
    age:      (a,b) => new Date(a.createdAt) - new Date(b.createdAt),
    votes:    (a,b) => (b.votes||0)-(a.votes||0),
  };
  return [...issues].sort(sorters[officialSort] || sorters.urgency);
}

function renderCmdMetrics() {
  const all = currentIssues;
  const open = all.filter(i => i.status !== "resolved");
  const resolved = all.filter(i => i.status === "resolved" && i.resolvedAt);
  // Avg time-to-resolve
  let avgTxt = "—";
  if (resolved.length) {
    const avgMs = resolved.reduce((s,i) => s + (new Date(i.resolvedAt) - new Date(i.createdAt)), 0) / resolved.length;
    const hrs = avgMs / 3600000;
    avgTxt = hrs >= 24 ? `${(hrs/24).toFixed(1)}d` : `${hrs.toFixed(1)}h`;
  }
  // Critical alerts (high/critical severity OR escalated, still open)
  const critical = open.filter(i => isEscalated(i) || ["critical","high"].includes(i.severity)).length;
  // Hotspot — location with most open issues
  const locCounts = {};
  open.forEach(i => { const l = (i.location||"Unknown").split(",")[0].trim(); locCounts[l] = (locCounts[l]||0)+1; });
  const hotspot = Object.entries(locCounts).sort((a,b) => b[1]-a[1])[0];
  const resolveRate = all.length ? Math.round((all.filter(i=>i.status==="resolved").length / all.length) * 100) : 0;

  document.getElementById("cmdMetrics").innerHTML = `
    <div class="metric"><span class="metric-val">${open.length}</span><span class="metric-lbl">Open tickets</span></div>
    <div class="metric ${critical?"crit":""}"><span class="metric-val">${critical}</span><span class="metric-lbl">Critical alerts</span></div>
    <div class="metric"><span class="metric-val">${avgTxt}</span><span class="metric-lbl">Avg resolve time</span></div>
    <div class="metric"><span class="metric-val">${resolveRate}%</span><span class="metric-lbl">Resolution rate</span></div>
    <div class="metric"><span class="metric-val" style="font-size:15px">${hotspot ? escapeHtml(hotspot[0]) : "—"}</span><span class="metric-lbl">Top hotspot${hotspot?` · ${hotspot[1]}`:""}</span></div>`;
}

function renderOfficialPortal() {
  const depts = [...new Set(currentIssues.map(i => i.department || "General").filter(Boolean))];
  document.getElementById("deptFilter").innerHTML = ["all", ...depts].map(d => `
    <button class="filter-btn ${officialFilter===d?"active":""}" onclick="setOfficialFilter('${d}')">${d==="all"?"All":d}</button>`).join("");

  renderCmdMetrics();

  const issues = getOfficialIssues();
  // prune selection of vanished ids
  selectedTickets.forEach(id => { if (!currentIssues.some(i => i.id === id)) selectedTickets.delete(id); });

  document.getElementById("cmdListCount").textContent = `${issues.length} ticket${issues.length!==1?"s":""}`;
  document.getElementById("officialGrid").innerHTML = issues.map(issue => `
    <div class="ticket ${isEscalated(issue)?"escalated":""} ${activeOfficialId===issue.id?"active":""}" data-id="${issue.id}">
      <input type="checkbox" class="ticket-check" data-id="${issue.id}" ${selectedTickets.has(issue.id)?"checked":""} />
      ${issue.imageUrl ? `<img class="ticket-img" src="${issue.imageUrl}" />` : `<div class="ticket-img no-img">📍</div>`}
      <div class="ticket-info">
        <div class="ticket-title">${escapeHtml(issue.title)} ${isEscalated(issue)?"🚨":""}</div>
        <div class="ticket-meta">${escapeHtml((issue.location||"Unknown").split(",")[0])} · ${formatDate(issue.createdAt)}</div>
        <div class="ticket-tags">
          <span class="status-badge ${issue.status}">${statusLabel(issue.status)}</span>
          <span class="sev-dot sev-${issue.severity}">${issue.severity}</span>
        </div>
      </div>
    </div>`).join("") || `<div class="loading-spinner">No issues found.</div>`;

  // wire rows + checkboxes
  document.querySelectorAll("#officialGrid .ticket").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.classList.contains("ticket-check")) return;
      setActiveTicket(el.dataset.id);
    });
  });
  document.querySelectorAll("#officialGrid .ticket-check").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.checked ? selectedTickets.add(cb.dataset.id) : selectedTickets.delete(cb.dataset.id);
      updateBulkBar();
    });
  });
  const selectAll = document.getElementById("cmdSelectAll");
  if (selectAll) selectAll.checked = issues.length>0 && issues.every(i => selectedTickets.has(i.id));

  updateBulkBar();
  if (activeOfficialId && currentIssues.some(i => i.id === activeOfficialId)) renderOfficialDetail(activeOfficialId);
}

window.setActiveTicket = function(id) {
  activeOfficialId = id;
  document.querySelectorAll("#officialGrid .ticket").forEach(el =>
    el.classList.toggle("active", el.dataset.id === id));
  renderOfficialDetail(id);
};

function renderOfficialDetail(id) {
  const issue = currentIssues.find(i => i.id === id);
  if (!issue) return;
  const detail = document.getElementById("cmdDetail");
  const hasLoc = typeof issue.lat === "number" && typeof issue.lng === "number";
  const sv = hasLoc ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${issue.lat},${issue.lng}` : "";
  const gm = hasLoc ? `https://www.google.com/maps/search/?api=1&query=${issue.lat},${issue.lng}` : "";

  detail.innerHTML = `
    <div class="cmd-detail-scroll">
      ${issue.imageUrl ? `<img class="cmd-detail-img" src="${issue.imageUrl}" />` : ""}
      <div class="cmd-detail-head">
        <h3>${escapeHtml(issue.title)} ${isEscalated(issue)?"🚨":""}</h3>
        <div class="cmd-detail-tags">
          <span class="status-badge ${issue.status}">${statusLabel(issue.status)}</span>
          <span class="issue-category-tag">${issue.category}</span>
          <span class="sev-dot sev-${issue.severity}">${issue.severity}</span>
        </div>
      </div>
      <div class="cmd-detail-desc">${escapeHtml(issue.description || "No description provided.")}</div>
      ${issue.aiAnalysis ? `<div class="detail-ai-box"><h4>AI-extracted insight</h4><p>${escapeHtml(issue.aiAnalysis)}</p></div>` : ""}
      ${(issue.estimatedCost || issue.materials || issue.jurisdiction) ? `<div class="detail-estimate">
        <h4>AI Works Estimate</h4>
        ${issue.estimatedCost ? `<div class="de-row"><span>💰 Estimated cost</span><strong>${escapeHtml(issue.estimatedCost)}</strong></div>`:""}
        ${issue.materials ? `<div class="de-row"><span>🧰 Materials</span><strong>${escapeHtml(issue.materials)}</strong></div>`:""}
        ${issue.jurisdiction ? `<div class="de-row"><span>⚖️ Jurisdiction</span><strong>${escapeHtml(issue.jurisdiction)}</strong></div>`:""}
      </div>`:""}
      <div class="cmd-detail-meta">📍 ${escapeHtml(issue.location||"Unknown")} · ✅ ${issue.votes||0} verifications · ${formatDate(issue.createdAt)}</div>
      ${hasLoc ? `<div class="cmd-map" id="cmdMiniMap"></div>
        <div class="cmd-map-links">
          <a class="btn-secondary btn-sm" href="${sv}" target="_blank" rel="noopener">🛰 Street View</a>
          <a class="btn-secondary btn-sm" href="${gm}" target="_blank" rel="noopener">🗺 Open in Google Maps</a>
        </div>` : `<div class="cmd-detail-meta">No GPS coordinates attached.</div>`}
    </div>`;

  if (hasLoc) setTimeout(() => initCmdMiniMap(issue.lat, issue.lng), 60);
  renderOfficialAction(issue);
}

function initCmdMiniMap(lat, lng) {
  const el = document.getElementById("cmdMiniMap");
  if (!el || !window.L) return;
  if (cmdMiniMap) { cmdMiniMap.remove(); cmdMiniMap = null; }
  cmdMiniMap = L.map(el, { zoomControl: true, attributionControl: false }).setView([lat, lng], 16);
  L.tileLayer(tileURL(), { maxZoom: 19 }).addTo(cmdMiniMap);
  L.marker([lat, lng]).addTo(cmdMiniMap);
  setTimeout(() => cmdMiniMap && cmdMiniMap.invalidateSize(), 80);
}

function renderOfficialAction(issue) {
  const panel = document.getElementById("cmdActionPanel");
  panel.innerHTML = `
    <div class="cap-title">Action panel</div>
    <label class="cap-label">Status</label>
    <select class="status-select" id="capStatus">${statusOptionsHtml(issue.status)}</select>

    <label class="cap-label">Assign crew / department</label>
    <div class="cap-crew">
      <input id="capCrew" placeholder="e.g. Road Crew Team B" value="${escapeHtml(issue.assignedCrew||issue.department||"")}" autocomplete="off" />
      <button class="btn-primary btn-sm" id="capAssign">Assign</button>
    </div>
    <div class="cap-quick">
      ${["Road Crew A","Road Crew B","Water Dept","Sanitation","Electrical"].map(c=>`<button class="cap-chip" data-crew="${c}">${c}</button>`).join("")}
    </div>

    <div class="cap-divider"></div>
    <button class="btn-secondary cap-full" id="capLetter">📨 Generate complaint letter</button>
    <div class="resolved-upload cap-full" id="capResolveArea" style="margin-top:10px">
      📸 Upload before/after resolution photo
      <input type="file" id="capResolveInput" accept="image/*" hidden />
    </div>`;

  document.getElementById("capStatus").addEventListener("change", e => updateStatus(issue.id, e.target.value));
  document.getElementById("capAssign").addEventListener("click", () => assignCrew(issue.id, document.getElementById("capCrew").value));
  panel.querySelectorAll(".cap-chip").forEach(b => b.addEventListener("click", () => {
    document.getElementById("capCrew").value = b.dataset.crew;
  }));
  document.getElementById("capLetter").addEventListener("click", () => {
    currentDetailIssue = issue; openComplaintLetter();
  });
  const area = document.getElementById("capResolveArea");
  const input = document.getElementById("capResolveInput");
  area.addEventListener("click", () => input.click());
  input.addEventListener("change", e => uploadResolvedPhoto(issue.id, e.target.files[0]));
}

window.assignCrew = async function(id, crew) {
  crew = (crew||"").trim();
  if (!crew) { showToast("Enter a crew or department name", "error"); return; }
  const issue = currentIssues.find(i => i.id === id);
  const now = new Date().toISOString();
  const patch = { assignedCrew: crew, department: crew };
  if (!issue || issue.status === "open") { patch.status = "in_progress"; patch["history.in_progress"] = now; patch.statusUpdatedAt = now; }
  await updateDoc(doc(db, "issues", id), patch);
  showToast(`Assigned to ${crew}`, "success");
};

// ── Bulk actions ──────────────────────────────────────────────────────────────
function updateBulkBar() {
  const bar = document.getElementById("bulkBar");
  const n = selectedTickets.size;
  document.getElementById("bulkCount").textContent = `${n} selected`;
  bar.classList.toggle("hidden", n === 0);
}

async function applyBulk() {
  const status = document.getElementById("bulkStatus").value;
  const crew = document.getElementById("bulkCrew").value.trim();
  if (!status && !crew) { showToast("Pick a status or enter a crew", "error"); return; }
  if (!selectedTickets.size) return;
  const now = new Date().toISOString();
  showToast(`Updating ${selectedTickets.size} tickets…`);
  const ids = [...selectedTickets];
  await Promise.all(ids.map(id => {
    const patch = {};
    if (status) { patch.status = status; patch.statusUpdatedAt = now; patch[`history.${status}`] = now; if (status==="resolved") patch.resolvedAt = now; }
    if (crew)   { patch.assignedCrew = crew; patch.department = crew; }
    return updateDoc(doc(db, "issues", id), patch);
  }));
  selectedTickets.clear();
  document.getElementById("bulkStatus").value = "";
  document.getElementById("bulkCrew").value = "";
  showToast(`Updated ${ids.length} tickets`, "success");
}

document.getElementById("cmdSort")?.addEventListener("change", e => { officialSort = e.target.value; renderOfficialPortal(); });
document.getElementById("cmdSelectAll")?.addEventListener("change", e => {
  const issues = getOfficialIssues();
  if (e.target.checked) issues.forEach(i => selectedTickets.add(i.id));
  else selectedTickets.clear();
  renderOfficialPortal();
});
document.getElementById("bulkApply")?.addEventListener("click", applyBulk);
document.getElementById("bulkClear")?.addEventListener("click", () => { selectedTickets.clear(); renderOfficialPortal(); });

window.setOfficialFilter = function(dept) {
  officialFilter = dept;
  renderOfficialPortal();
};

// ── Officials' Data Chat (conversational analytics) ───────────────────────────
function buildIssuesDigest() {
  return JSON.stringify(currentIssues.slice(0, 100).map(i => ({
    title: i.title, category: i.category, severity: i.severity, status: i.status,
    location: i.location || "unknown", votes: i.votes || 0,
    jurisdiction: i.jurisdiction || "", estimatedCost: i.estimatedCost || "",
    daysOld: Math.floor((Date.now() - new Date(i.createdAt).getTime()) / 86400000),
  })));
}

async function askDataChat(question) {
  const q = (question || "").trim();
  if (!q) return;
  const ansEl = document.getElementById("dataChatAnswer");
  ansEl.classList.remove("hidden");
  ansEl.classList.add("thinking");
  ansEl.textContent = "Analyzing your city data…";

  if (!currentIssues.length) {
    ansEl.classList.remove("thinking");
    ansEl.textContent = "No issue data available yet to analyze.";
    return;
  }

  const prompt = `You are a civic data analyst assisting a city official. Answer the official's question using ONLY the issue dataset below. Be specific and cite real numbers (counts, locations, categories). Keep it under 130 words. If the data can't answer it, say so honestly.

ISSUE DATASET (JSON, ${currentIssues.length} total issues):
${buildIssuesDigest()}

OFFICIAL'S QUESTION: ${q}`;

  try {
    const reply = await callGemini(prompt, 0.3);
    ansEl.classList.remove("thinking");
    ansEl.textContent = reply || "No answer returned. Try rephrasing.";
  } catch (e) {
    ansEl.classList.remove("thinking");
    ansEl.textContent = e.message?.includes("RESOURCE_EXHAUSTED") || e.message?.includes("429")
      ? "AI is busy (free-tier limit). Wait a few seconds and try again."
      : "Couldn't analyze right now. Please try again.";
  }
}

document.getElementById("dataChatBtn")?.addEventListener("click", () => {
  askDataChat(document.getElementById("dataChatInput").value);
});
document.getElementById("dataChatInput")?.addEventListener("keydown", e => {
  if (e.key === "Enter") askDataChat(e.target.value);
});
document.getElementById("dataChatSuggest")?.addEventListener("click", e => {
  const btn = e.target.closest("button[data-q]");
  if (!btn) return;
  document.getElementById("dataChatInput").value = btn.dataset.q;
  askDataChat(btn.dataset.q);
});

// ── Admin Master Control (live) ───────────────────────────────────────────────
const ACTION_ICONS = {
  opened: "👋", reported: "📸", verified: "✅", feedback: "💭", default: "•",
};
let adminListening = false;
let adminData = { sessions: [], activity: [], feedback: [] };

function openAdminView() {
  maybeShowAdminNav();
  const locked = document.getElementById("adminLocked");
  const panel  = document.getElementById("adminPanel");
  if (!isAdmin()) {
    locked.style.display = "flex";
    panel.style.display  = "none";
    document.getElementById("adminLockMsg").textContent = currentUser && !currentUser.isAnonymous
      ? `Signed in as ${currentUser.email}. This account is not the admin.`
      : "Sign in with the admin Google account to access the control panel.";
    return;
  }
  locked.style.display = "none";
  panel.style.display  = "block";
  attachAdminListeners();
}

function attachAdminListeners() {
  if (adminListening || !isAdmin()) { renderAdmin(); return; }
  adminListening = true;
  // Live streams — update instantly as visitors arrive and act
  onSnapshot(query(collection(db, "sessions"), orderBy("lastSeen", "desc")), snap => {
    adminData.sessions = snap.docs.map(d => d.data()); renderAdmin();
  }, () => {});
  onSnapshot(query(collection(db, "activity"), orderBy("createdAt", "desc"), limit(100)), snap => {
    adminData.activity = snap.docs.map(d => d.data()); renderAdmin();
  }, () => {});
  onSnapshot(query(collection(db, "feedback"), orderBy("createdAt", "desc")), snap => {
    adminData.feedback = snap.docs.map(d => d.data()); renderAdmin();
  }, () => {});
}

function renderAdmin() {
  if (!isAdmin()) return;
  const { sessions, activity, feedback } = adminData;

  document.getElementById("am-visitors").textContent = sessions.length;
  document.getElementById("am-google").textContent   = sessions.filter(s => s.loginMethod === "google").length;
  document.getElementById("am-guest").textContent    = sessions.filter(s => s.loginMethod === "guest").length;
  document.getElementById("am-reports").textContent  = currentIssues.length;
  document.getElementById("am-votes").textContent    = currentIssues.reduce((a, i) => a + (i.votes || 0), 0);
  document.getElementById("am-feedback").textContent = feedback.length;

  document.getElementById("adminVisitors").innerHTML = sessions.length ? sessions.map(s => `
    <div class="admin-row">
      <div class="admin-avatar ${s.loginMethod}">${s.loginMethod === "google" ? "👤" : "🕶️"}</div>
      <div class="admin-row-info">
        <div class="admin-row-name">${escapeHtml(s.name || "Unknown")}</div>
        <div class="admin-row-meta">${s.email ? escapeHtml(s.email) + " · " : ""}${s.visits || 1} visit(s) · ${timeAgo(s.lastSeen)}</div>
      </div>
      <span class="admin-tag ${s.loginMethod}">${s.loginMethod}</span>
    </div>`).join("") : `<div class="loading-spinner">No visitors yet.</div>`;

  document.getElementById("adminActivity").innerHTML = activity.length ? activity.map(a => `
    <div class="activity-row">
      <span class="activity-icon">${ACTION_ICONS[a.action] || ACTION_ICONS.default}</span>
      <span class="activity-text"><b>${escapeHtml(a.name || "Someone")}</b> ${escapeHtml(a.detail || a.action)}</span>
      <span class="activity-time">${timeAgo(a.createdAt)}</span>
    </div>`).join("") : `<div class="loading-spinner">No activity yet.</div>`;

  const stars = n => "★".repeat(n || 0) + "☆".repeat(5 - (n || 0));
  document.getElementById("adminFeedback").innerHTML = feedback.length ? feedback.map(f => `
    <div class="feedback-row">
      <div class="fb-head">
        ${f.rating ? `<span class="fb-rating" style="color:#d29922">${stars(f.rating)}</span>` : ""}
        <span class="fb-name">${escapeHtml(f.name || "Anonymous")}</span>
        <span class="fb-cat">${escapeHtml(f.category || "general")}</span>
      </div>
      ${f.text ? `<div class="fb-text">${escapeHtml(f.text)}</div>` : ""}
      <div class="fb-time">${timeAgo(f.createdAt)}</div>
    </div>`).join("") : `<div class="loading-spinner">No feedback yet.</div>`;
}

document.getElementById("adminLoginBtn").addEventListener("click", async () => {
  try { await signInWithPopup(auth, googleProvider); openAdminView(); } catch {}
});
document.getElementById("adminRefreshBtn").addEventListener("click", renderAdmin);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function timeAgo(iso) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ── Chat Assistant ────────────────────────────────────────────────────────────
document.getElementById("chatFab").addEventListener("click", () => {
  chatOpen = !chatOpen;
  document.getElementById("chatPanel").classList.toggle("open", chatOpen);
  if (chatOpen) document.getElementById("chatInput").focus();
});
document.getElementById("chatClose").addEventListener("click", () => {
  chatOpen = false;
  document.getElementById("chatPanel").classList.remove("open");
});

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = "";
  addChatBubble(msg, "user");
  const typingEl = addChatBubble("Thinking…", "bot typing");
  const context = buildChatContext();
  try {
    const reply = await callGeminiChat(msg, context);
    typingEl.remove();
    addChatBubble(reply, "bot");
  } catch {
    typingEl.remove();
    addChatBubble("Sorry, I couldn't connect right now.", "bot");
  }
}

function addChatBubble(text, cls) {
  const div = document.createElement("div");
  div.className = `chat-bubble ${cls}`;
  div.textContent = text;
  const messages = document.getElementById("chatMessages");
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function buildChatContext() {
  const total = currentIssues.length;
  const cats  = {};
  currentIssues.forEach(i => { cats[i.category] = (cats[i.category]||0)+1; });
  const top = Object.entries(cats).sort(([,a],[,b])=>b-a)[0];
  return `The community has ${total} reported issues. Top category: ${top?top[0]+` (${top[1]})`:"none"}. ${currentIssues.filter(i=>i.status==="resolved").length} resolved.`;
}

async function callGeminiChat(userMsg, context) {
  chatHistory.push({ role: "user", parts: [{ text: userMsg }] });
  const sysPrompt = `You are CivicPulse AI, a helpful assistant for a civic issue reporting platform.
Context: ${context}
Help citizens report issues, understand the platform, or ask about community problems. 
Respond in 2-3 sentences maximum. Be friendly and concise.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": window.CONFIG.GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sysPrompt }] },
        contents: chatHistory,
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      })
    }
  );
  const json  = await res.json();
  const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || "I'm having trouble right now.";
  chatHistory.push({ role: "model", parts: [{ text: reply }] });
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  return reply;
}

document.getElementById("chatSend").addEventListener("click", sendChatMessage);
document.getElementById("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChatMessage(); });

// ── Onboarding ────────────────────────────────────────────────────────────────
let obStep = 1;

function checkOnboarding() {
  if (!localStorage.getItem("civicpulse_onboarded")) {
    document.getElementById("onboardingOverlay").classList.add("show");
  }
}

function showObStep(n) {
  obStep = n;
  document.querySelectorAll(".ob-slide").forEach((s, i) => s.classList.toggle("active", i + 1 === n));
  document.querySelectorAll(".ob-step").forEach((s, i) => s.classList.toggle("active", i + 1 === n));
  document.getElementById("obNextBtn").textContent = n === 3 ? "Let's Go! 🚀" : "Next →";
}

document.getElementById("obNextBtn").addEventListener("click", () => {
  if (obStep < 3) { showObStep(obStep + 1); }
  else {
    localStorage.setItem("civicpulse_onboarded", "1");
    document.getElementById("onboardingOverlay").classList.remove("show");
  }
});

document.getElementById("obSkipBtn").addEventListener("click", () => {
  localStorage.setItem("civicpulse_onboarded", "1");
  document.getElementById("onboardingOverlay").classList.remove("show");
});

// ── Share App ─────────────────────────────────────────────────────────────────
document.getElementById("shareAppBtn").addEventListener("click", async () => {
  const url   = "https://community-hero-2778b.web.app";
  const title = "CivicPulse — Community Hero";
  const text  = "Report and track community issues (potholes, broken streetlights, water leaks) in our area with AI. Join me on CivicPulse!";
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(url);
      showToast("App link copied — share it anywhere!", "success");
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`, "_blank");
    }
  }
});

// ── Feedback ──────────────────────────────────────────────────────────────────
let selectedRating = 0;

document.getElementById("feedbackBtn").addEventListener("click", () => {
  selectedRating = 0;
  document.querySelectorAll(".rating-emoji").forEach(e => e.classList.remove("selected"));
  document.getElementById("feedbackText").value = "";
  document.getElementById("feedbackName").value = "";
  document.getElementById("feedbackCategory").value = "general";
  document.getElementById("feedbackModal").classList.add("open");
});

document.getElementById("closeFeedbackBtn").addEventListener("click", () => {
  document.getElementById("feedbackModal").classList.remove("open");
});

document.querySelectorAll(".rating-emoji").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedRating = parseInt(btn.dataset.rating);
    document.querySelectorAll(".rating-emoji").forEach(e => e.classList.remove("selected"));
    btn.classList.add("selected");
  });
});

document.getElementById("submitFeedbackBtn").addEventListener("click", async () => {
  const text     = document.getElementById("feedbackText").value.trim();
  const category = document.getElementById("feedbackCategory").value;
  const name     = document.getElementById("feedbackName").value.trim();
  if (!selectedRating && !text) { showToast("Add a rating or a comment", "error"); return; }

  const btn = document.getElementById("submitFeedbackBtn");
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    await addDoc(collection(db, "feedback"), {
      rating:    selectedRating || null,
      category,
      text,
      name:      name || "Anonymous",
      userId:    currentUser?.uid || "anonymous",
      createdAt: new Date().toISOString(),
    });
    logActivity("feedback", `Sent ${category} feedback${selectedRating ? ` (${selectedRating}★)` : ""}`);
    document.getElementById("feedbackModal").classList.remove("open");
    showToast("Thank you for your feedback! 🙌", "success");
  } catch (e) {
    showToast("Could not send feedback. Try again.", "error");
  }
  btn.disabled = false; btn.textContent = "Send Feedback";
});

// ── Gemini Helper ─────────────────────────────────────────────────────────────
async function callGemini(prompt, temperature = 0.3, jsonMode = false) {
  const generationConfig = { temperature };
  if (jsonMode) generationConfig.responseMimeType = "application/json";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": window.CONFIG.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      })
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Gemini HTTP ${res.status}`);
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Robustly extract a JSON array/object from a model response
function parseJSONLoose(text) {
  let t = String(text).replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  try { return JSON.parse(t); } catch {}
  const firstArr = t.indexOf("["), lastArr = t.lastIndexOf("]");
  if (firstArr !== -1 && lastArr > firstArr) {
    try { return JSON.parse(t.slice(firstArr, lastArr + 1)); } catch {}
  }
  const firstObj = t.indexOf("{"), lastObj = t.lastIndexOf("}");
  if (firstObj !== -1 && lastObj > firstObj) {
    try { return JSON.parse(t.slice(firstObj, lastObj + 1)); } catch {}
  }
  throw new Error("Could not parse JSON from model response");
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function formatDate(iso) {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Start ─────────────────────────────────────────────────────────────────────
checkOnboarding();
