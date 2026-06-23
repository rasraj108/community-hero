// ── API Keys ──────────────────────────────────────────────────────────
// Copy this file to config.local.js and fill in your own keys.
// The deployed version at https://community-hero-2778b.web.app uses live keys.
window.CONFIG = {
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY",   // Get from https://aistudio.google.com/app/apikey
  MAPS_API_KEY:   "YOUR_GOOGLE_MAPS_KEY",  // Get from https://console.cloud.google.com
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
