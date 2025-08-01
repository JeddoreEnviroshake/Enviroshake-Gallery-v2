const admin = require("firebase-admin");
const path = require("path");

// Load the service account from the /secrets/ folder
const serviceAccountPath = path.resolve(__dirname, "secrets", "firebase-service-account.json");

let serviceAccount;

try {
  serviceAccount = require(serviceAccountPath);
} catch (error) {
  console.error("❌ Failed to load Firebase service account key:", error);
  process.exit(1);
}

// Debug log — shows which service account is being loaded
console.log("✅ Loaded service account email:", serviceAccount.client_email);

// Initialize Firebase Admin SDK
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

// Connect to Firestore
const db = admin.firestore();

// Test Firestore connection (optional but helpful for debugging)
(async () => {
  try {
    await db.listCollections();
    console.log("✅ Firestore connection verified.");
  } catch (err) {
    console.error("❌ Firebase connection failed:", err);
  }
})();

module.exports = { admin, db };
