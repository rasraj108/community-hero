// Firebase imports
import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc,
         getDocs, doc, updateDoc, onSnapshot,
         query, orderBy, getDoc, increment }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes,
         getDownloadURL }                        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAuth, signInAnonymously }            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Init
const app     = initializeApp(CONFIG.FIREBASE);
const db      = getFirestore(app);
const storage = getStorage(app);
const auth    = getAuth(app);

let currentUser  = null;
let userData     = { points: 0, reports: 0, votes: 0 };
let map, markers = [];
let currentIssues = [];
let selectedLat = null, selectedLng = null;
let uploadedImageFile = null;
let uploadedImageB64  = null;
let currentFilter = "all";

const GEMINI_MODEL = "gemini-2.5-flash";

// Auth
signInAnonymously(auth).then(({ user }) => {
  currentUser = user;
  loadUserData();
});

async function loadUserData() {
  if (!currentUser) return;
  const snap = await getDoc(doc(db, "users", currentUser.uid)).catch(() => null);
  if (snap?.exists()) { userData = snap.data(); refreshUserHUD(); }
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
    const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(uref, {
      uid: currentUser.uid,
      name: `Hero_${currentUser.uid.slice(0,6)}`,
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
}

function getBadge(pts) {
  if (pts >= 1000) return "Champion";
  if (pts >= 500)  return "Activist";
  if (pts >= 200)  return "Reporter";
  if (pts >= 50)   return "Citizen";
  return "Newcomer";
}

// Navigation
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    if (view === "dashboard")   renderDashboard();
    if (view === "leaderboard") renderLeaderboard();
    if (view === "map" && map)  { map.invalidateSize(); }
  });
});

// Map
const CATEGORY_COLORS = {
  pothole: "#f85149", streetlight: "#d29922", water: "#58a6ff",
  waste: "#3fb950", road: "#e3853a", drainage: "#8957e5", other: "#bc8cff",
};
const CATEGORY_ICONS = {
  pothole: "Pothole", streetlight: "Streetlight", water: "Water Leak",
  waste: "Waste", road: "Road Damage", drainage: "Drainage", other: "Other",
};
const STATUS_LABELS = { open: "Open", in_progress: "In Progress", resolved: "Resolved" };

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([19.076, 72.8777], 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; CARTO', maxZoom: 19,
  }).addTo(map);
  loadIssuesRealtime();
}
initMap();

function addMapMarker(issue) {
  if (!map || !issue.lat) return;
  const color = CATEGORY_COLORS[issue.category] || "#bc8cff";
  const size  = issue.severity === "critical" ? 14 : issue.severity === "high" ? 11 : 9;
  const icon  = L.divIcon({
    className: "",
    html: `<div style="width:${size*2}px;height:${size*2}px;background:${color};border:2px solid #fff;border-radius:50%;opacity:${issue.status==="resolved"?0.4:0.9};box-shadow:0 0 6px ${color}"></div>`,
    iconSize: [size*2, size*2], iconAnchor: [size, size],
  });
  const marker = L.marker([issue.lat, issue.lng], { icon }).addTo(map)
    .bindPopup(`<div style="background:#161b22;color:#e6edf3;padding:12px;border-radius:8px;min-width:180px;font-family:sans-serif;border:1px solid #30363d">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${issue.title}</div>
      <div style="font-size:12px;color:#8b949e;margin-bottom:8px">${issue.location || "Unknown location"}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.1)">${issue.category}</span>
        <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.1)">${issue.status}</span>
      </div></div>`, { maxWidth: 250 });
  markers.push(marker);
}

function loadIssuesRealtime() {
  const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    currentIssues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    currentIssues.forEach(issue => addMapMarker(issue));
    renderFeed();
    updateMapStats();
  });
}

function updateMapStats() {
  const total    = currentIssues.length;
  const resolved = currentIssues.filter(i => i.status === "resolved").length;
  const pending  = currentIssues.filter(i => i.status !== "resolved").length;
  document.getElementById("totalIssues").textContent    = total;
  document.getElementById("resolvedIssues").textContent = resolved;
  document.getElementById("pendingIssues").textContent  = pending;
}

// Feed
function severityEmoji(s) {
  return { low: "Low", medium: "Medium", high: "High", critical: "Critical" }[s] || s;
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
        : `<div class="issue-card-img no-img" style="background:#21262d;display:flex;align-items:center;justify-content:center;font-size:36px">&#128205;</div>`}
      <div class="issue-card-body">
        <div class="issue-meta">
          <span class="issue-category-tag">${issue.category || "other"}</span>
          <span class="issue-severity" style="font-size:12px;color:#8b949e">${severityEmoji(issue.severity)}</span>
        </div>
        <div class="issue-title">${issue.title}</div>
        <div class="issue-location">&#128205; ${issue.location || "Unknown location"}</div>
        <div class="issue-footer">
          <span class="status-badge ${issue.status}">${STATUS_LABELS[issue.status] || issue.status}</span>
          <div class="vote-row">
            <button class="vote-btn ${issue.votedBy?.includes(currentUser?.uid) ? "voted" : ""}"
                    onclick="voteIssue(event,'${issue.id}')">+1 Verify</button>
            <span class="vote-count">${issue.votes || 0}</span>
          </div>
        </div>
      </div>
    </div>`).join("");
  grid.querySelectorAll(".issue-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.classList.contains("vote-btn")) return;
      openDetail(card.dataset.id);
    });
  });
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderFeed();
  });
});

// Vote
window.voteIssue = async function (e, issueId) {
  e.stopPropagation();
  if (!currentUser) return;
  const issue = currentIssues.find(i => i.id === issueId);
  if (!issue) return;
  if (issue.votedBy?.includes(currentUser.uid)) { showToast("Already voted!", "error"); return; }
  await updateDoc(doc(db, "issues", issueId), {
    votes: increment(1),
    votedBy: [...(issue.votedBy || []), currentUser.uid],
  });
  await updateUserStats({ points: 5, votes: 1 });
  showToast("+5 points for verifying!", "success");
};

// Detail modal
async function openDetail(id) {
  const issue = currentIssues.find(i => i.id === id);
  if (!issue) return;
  document.getElementById("detailTitle").textContent = issue.title;
  document.getElementById("detailBody").innerHTML = `
    ${issue.imageUrl ? `<img class="detail-img" src="${issue.imageUrl}" />` : ""}
    <div class="detail-meta">
      <span class="status-badge ${issue.status}">${STATUS_LABELS[issue.status]}</span>
      <span class="issue-category-tag">${issue.category}</span>
      <span style="font-size:12px;color:#8b949e">${severityEmoji(issue.severity)}</span>
    </div>
    <div class="detail-desc">${issue.description || "No description provided."}</div>
    ${issue.aiAnalysis ? `<div class="detail-ai-box"><h4>AI Analysis</h4><p>${issue.aiAnalysis}</p></div>` : ""}
    <div style="font-size:13px;color:#8b949e;margin-bottom:16px">
      &#128205; ${issue.location || "Unknown"} &nbsp;|&nbsp;
      +1 ${issue.votes || 0} verifications &nbsp;|&nbsp;
      ${formatDate(issue.createdAt)}
    </div>
    <div class="detail-actions">
      <button class="vote-btn" onclick="voteIssue(event,'${issue.id}')">+1 Verify (${issue.votes || 0})</button>
      <select class="status-select" onchange="updateStatus('${issue.id}', this.value)">
        <option value="open"        ${issue.status==="open"        ? "selected":""}>Open</option>
        <option value="in_progress" ${issue.status==="in_progress" ? "selected":""}>In Progress</option>
        <option value="resolved"    ${issue.status==="resolved"    ? "selected":""}>Resolved</option>
      </select>
    </div>`;
  document.getElementById("detailModal").classList.add("open");
}

window.updateStatus = async function (id, status) {
  await updateDoc(doc(db, "issues", id), { status });
  showToast("Status updated!", "success");
};

document.getElementById("closeDetailBtn").addEventListener("click", () => {
  document.getElementById("detailModal").classList.remove("open");
});

// Report modal
document.getElementById("openReportBtn").addEventListener("click", openReportModal);

function openReportModal() {
  resetReportModal();
  document.getElementById("reportModal").classList.add("open");
}

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
  document.getElementById("aiResultCard").innerHTML = `
    <div class="ai-analyzing"><div class="spinner"></div><p>Gemini is analyzing your photo...</p></div>`;
}

document.getElementById("closeModalBtn").addEventListener("click", () => {
  document.getElementById("reportModal").classList.remove("open");
});

function showStep(n) {
  document.querySelectorAll(".step").forEach((s, i) => {
    s.classList.toggle("active", i + 1 === n);
  });
}

// Photo upload
const uploadArea = document.getElementById("uploadArea");
const photoInput = document.getElementById("photoInput");
const previewImg = document.getElementById("previewImg");
const analyzeBtn = document.getElementById("analyzeBtn");

uploadArea.addEventListener("click", () => photoInput.click());
uploadArea.addEventListener("dragover",  e => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => {
  e.preventDefault(); uploadArea.classList.remove("drag-over");
  handlePhotoFile(e.dataTransfer.files[0]);
});
photoInput.addEventListener("change", e => handlePhotoFile(e.target.files[0]));
document.getElementById("changePhotoBtn").addEventListener("click", () => photoInput.click());

function handlePhotoFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  uploadedImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src          = e.target.result;
    uploadedImageB64        = e.target.result.split(",")[1];
    document.getElementById("photoPreview").classList.remove("hidden");
    uploadArea.classList.add("hidden");
    analyzeBtn.disabled = false;
  };
  reader.readAsDataURL(file);
}

// Gemini analysis
analyzeBtn.addEventListener("click", async () => {
  if (!uploadedImageB64) return;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";
  showStep(2);
  const result = await analyzeWithGemini(uploadedImageB64);
  populateFromAI(result);
  autoLocate();
  analyzeBtn.textContent = "Analyze with Gemini AI";
});

async function analyzeWithGemini(b64) {
  const prompt = `You are analyzing a photo of a civic infrastructure issue.
Respond ONLY with valid JSON in this exact format, no markdown:
{
  "title": "short issue title (max 8 words)",
  "category": "pothole|streetlight|water|waste|road|drainage|other",
  "severity": "low|medium|high|critical",
  "description": "2-3 sentence description of the visible issue",
  "department": "which government department should handle this",
  "estimatedResolution": "estimated days as a number",
  "aiInsight": "one actionable recommendation"
}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": CONFIG.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: b64 } }
          ]}],
          generationConfig: { temperature: 0.1 },
        })
      }
    );
    const json = await res.json();
    if (!res.ok) { console.error("Gemini error:", json.error?.message); return {}; }
    const text    = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleaned = text.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Gemini parse error:", err);
    return {};
  }
}

function populateFromAI(result) {
  const title    = result.title       || "";
  const desc     = result.description || "";
  const category = result.category    || "";
  const severity = result.severity    || "";
  const dept     = result.department  || "";
  const eta      = result.estimatedResolution || "";
  const insight  = result.aiInsight   || "";
  const hasData  = title || desc || category;

  document.getElementById("aiResultCard").innerHTML = hasData ? `
    <div class="ai-result">
      <div class="ai-result-header"><span class="ai-badge">Gemini AI Analysis</span></div>
      <div class="ai-result-title">${title}</div>
      ${desc ? `<div class="ai-result-desc">${desc}</div>` : ""}
      <div class="ai-chips">
        ${category ? `<span class="ai-chip">${category}</span>` : ""}
        ${severity ? `<span class="ai-chip">${severity}</span>` : ""}
        ${eta      ? `<span class="ai-chip">~${eta} days</span>` : ""}
        ${dept     ? `<span class="ai-chip dept">${dept}</span>` : ""}
      </div>
      ${insight ? `<div style="font-size:12px;color:#58a6ff;margin-top:6px">Tip: ${insight}</div>` : ""}
    </div>` : `<div style="color:#8b949e;font-size:13px;padding:8px">AI analysis unavailable — fill in details below manually.</div>`;

  if (title)    document.getElementById("issueTitle").value = title;
  if (desc)     document.getElementById("issueDesc").value  = desc;
  const catSel = document.getElementById("issueCategory");
  if (category && [...catSel.options].some(o => o.value === category)) catSel.value = category;
  const sevSel = document.getElementById("issueSeverity");
  if (severity && [...sevSel.options].some(o => o.value === severity)) sevSel.value = severity;
  document.getElementById("aiResultCard").dataset.analysis   = insight;
  document.getElementById("aiResultCard").dataset.department = dept;
}

// Location
function autoLocate() {
  document.getElementById("locationStatus").textContent = "Detecting location...";
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async pos => {
    selectedLat = pos.coords.latitude;
    selectedLng = pos.coords.longitude;
    try {
      const r    = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${selectedLat},${selectedLng}&key=${CONFIG.MAPS_API_KEY}`);
      const data = await r.json();
      const addr = data.results?.[0]?.formatted_address || `${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`;
      document.getElementById("issueLocation").value = addr;
      document.getElementById("locationStatus").textContent = "Location detected";
    } catch {
      document.getElementById("issueLocation").value = `${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`;
      document.getElementById("locationStatus").textContent = "Location set";
    }
  }, () => {
    document.getElementById("locationStatus").textContent = "Could not detect — type manually.";
  });
}

document.getElementById("locateBtn").addEventListener("click", autoLocate);

// Submit
function compressImage(file, maxWidth = 1024, quality = 0.7) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale  = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, "image/jpeg", quality);
    };
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
      btn.textContent = "Compressing image...";
      const compressed = await compressImage(uploadedImageFile);
      btn.textContent = "Uploading photo...";
      const sRef = ref(storage, `issues/${Date.now()}.jpg`);
      await uploadBytes(sRef, compressed);
      imageUrl = await getDownloadURL(sRef);
    }
    btn.textContent = "Saving...";
    await addDoc(collection(db, "issues"), {
      title, category, severity, description: desc, location,
      imageUrl, lat: selectedLat, lng: selectedLng,
      status: "open", votes: 0, votedBy: [],
      reportedBy: currentUser?.uid || "anonymous",
      aiAnalysis: aiCard.dataset.analysis   || "",
      department: aiCard.dataset.department || "",
      createdAt:  new Date().toISOString(),
    });
    await updateUserStats({ points: 50, reports: 1 });
    document.getElementById("pointsEarned").textContent = "+50 points earned!";
    showStep(3);
  } catch (e) {
    showToast("Error: " + e.message, "error");
    console.error(e);
    btn.disabled = false; btn.textContent = "Submit Report";
  }
}

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("reportModal").classList.remove("open");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelector("[data-view='map']").classList.add("active");
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-map").classList.add("active");
  if (map) map.invalidateSize();
});

// Dashboard
async function renderDashboard() {
  const issues     = currentIssues;
  const total      = issues.length;
  const resolved   = issues.filter(i => i.status === "resolved").length;
  const open       = issues.filter(i => i.status === "open").length;
  const inProgress = issues.filter(i => i.status === "in_progress").length;

  document.getElementById("d-total").textContent    = total;
  document.getElementById("d-resolved").textContent = resolved;
  document.getElementById("d-open").textContent     = open;
  document.getElementById("d-progress").textContent = inProgress;

  const cats = {};
  issues.forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1; });
  const maxCat = Math.max(...Object.values(cats), 1);
  document.getElementById("categoryBars").innerHTML = Object.entries(cats)
    .sort(([,a],[,b]) => b-a)
    .map(([k,v]) => `
      <div class="cat-bar-item">
        <span class="cat-bar-label">${k}</span>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(v/maxCat)*100}%"></div></div>
        <span class="cat-bar-count">${v}</span>
      </div>`).join("") || "<div style='color:#8b949e;font-size:13px'>No data yet</div>";

  const sevs = { low:0, medium:0, high:0, critical:0 };
  issues.forEach(i => { if (sevs[i.severity]!==undefined) sevs[i.severity]++; });
  const maxSev = Math.max(...Object.values(sevs), 1);
  document.getElementById("severityChart").innerHTML = Object.entries(sevs).map(([k,v]) => `
    <div class="sev-item">
      <span class="sev-label">${k}</span>
      <div class="sev-bar-track"><div class="sev-bar-fill ${k}" style="width:${(v/maxSev)*100}%"></div></div>
      <span class="sev-count">${v}</span>
    </div>`).join("");

  if (total > 0) generateAIInsights(issues);
}

async function generateAIInsights(issues) {
  const el = document.getElementById("aiInsights");
  el.innerHTML = `<div class="insight-loading">Generating AI insights...</div>`;
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
  const prompt = `Community issue data: ${JSON.stringify(summary)}
Provide exactly 3 short actionable insights for the community.
Respond ONLY with a JSON array, no markdown: [{"type":"Trend|Alert|Recommendation","insight":"..."},...]`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": CONFIG.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } })
      }
    );
    const json    = await res.json();
    const text    = json.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const cleaned = text.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
    const insights = JSON.parse(cleaned);
    el.innerHTML = insights.map(ins => `
      <div class="insight-card">
        <div class="insight-type">${ins.type}</div>
        <p>${ins.insight}</p>
      </div>`).join("");
  } catch {
    el.innerHTML = `<div class="insight-card"><div class="insight-type">Tip</div><p>Submit more issues to generate AI-powered community insights.</p></div>`;
  }
}

// Leaderboard
async function renderLeaderboard() {
  const snap  = await getDocs(collection(db, "users")).catch(() => null);
  if (!snap) return;
  const users = snap.docs.map(d => d.data()).sort((a,b) => (b.points||0) - (a.points||0));
  const medals  = ["1st","2nd","3rd"];
  const topCls  = ["top1","top2","top3"];
  document.getElementById("leaderboardList").innerHTML = users.slice(0,10).map((u,i) => `
    <div class="leader-row ${topCls[i]||""}">
      <div class="leader-rank">${medals[i]||i+1}</div>
      <div class="leader-info">
        <div class="leader-name">${u.name||"Anonymous Hero"}</div>
        <div class="leader-badges">${getBadge(u.points||0)} &middot; ${u.reports||0} reports &middot; ${u.votes||0} verifications</div>
      </div>
      <div class="leader-points">${u.points||0} pts</div>
    </div>`).join("") || `<div class="loading-spinner">No heroes yet. Be the first!</div>`;
  refreshUserHUD();
}

// Utils
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function formatDate(iso) {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}
