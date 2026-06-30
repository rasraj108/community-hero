// ── API Keys (template) ───────────────────────────────────────────────
// 1. Copy this file to `config.js` (which is git-ignored).
// 2. Fill in your own keys.
// The live deployment at https://community-hero-2778b.web.app uses real keys.
window.CONFIG = {
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY",   // https://aistudio.google.com/app/apikey
  MAPS_API_KEY:   "YOUR_GOOGLE_MAPS_KEY",  // https://console.cloud.google.com
  ADMIN_EMAIL:    "you@example.com",        // Google account that can open the Master Control panel
  OFFICIAL_EMAILS: [],                      // (optional) emails auto-granted the Official portal
  OFFICIAL_PASSCODE: "change-me",           // access code for the Official Command Center
  FIREBASE: {
    apiKey:            "YOUR_FIREBASE_API_KEY",
    authDomain:        "YOUR_PROJECT.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID",
    measurementId:     "YOUR_MEASUREMENT_ID",
  }
};
