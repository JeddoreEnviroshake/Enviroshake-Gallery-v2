const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Path to the service account JSON file
const serviceAccountPath = path.join(__dirname, "secrets", "firebase-service-account.json");

// Safety check: does the file exist?
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ Service account file not found at:", serviceAccountPath);
  process.exit(1);
}

// Load the service account JSON
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
  console.log("✅ Loaded service account email:", serviceAccount.client_email);
} catch (err) {
  console.error("❌ Failed to parse service account JSON:", err);
  process.exit(1);
}

// Initialize Firebase Admin
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

// Access Firestore
const db = admin.firestore();

// Optional: verify Firestore connection
(async () => {
  try {
    await db.listCollections();
    console.log("✅ Firestore connection verified.");
  } catch (err) {
    console.error("❌ Firebase connection failed:", err);
  }
})();

module.exports = { admin, db };
