const admin = require("firebase-admin");
require("dotenv").config();

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  token_uri: "https://oauth2.googleapis.com/token",
};

// Debug log
console.log("✅ Loaded service account email:", serviceAccount.client_email);

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin initialized.");
  } catch (err) {
    console.error("❌ Firebase initialization failed:", err);
    process.exit(1);
  }
}

const db = admin.firestore();

// Optional: verify Firestore access
(async () => {
  try {
    await db.listCollections();
    console.log("✅ Firestore connection verified.");
  } catch (err) {
    console.error("❌ Firebase connection failed:", err);
  }
})();

module.exports = { admin, db };
