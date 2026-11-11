// ===== إعدادات الموقع =====
// بعد ما تعمل مشروع Firebase (الخطوات في README_AR.md) الصق القيم هنا.
window.APP_CONFIG = {
  firebase: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    appId: "PASTE_APP_ID"
  },
  // اسم الـ Username بيتحول داخليا لـ username@userDomain (مش لازم إيميل حقيقي)
  userDomain: "energya-dashboard.app",
  // لو Firebase لسه متظبطش، الموقع بيشتغل Demo على ملف data.json المحلي
  demo: { username: "demo", password: "demo123" }
};
