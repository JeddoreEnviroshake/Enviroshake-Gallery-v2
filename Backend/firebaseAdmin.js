const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Path to the service account JSON file
const serviceAccountPath = path.resolve(__dirname, "secrets", "firebase-service-account.json");

// Check if service account file exists
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ Service account file not found at:", serviceAccountPath);
  process.exit(1);
}

// Load the service account credentials
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
  console.log("✅ Loaded Firebase service account:", serviceAccount.client_email);
} catch (err) {
  console.error("❌ Failed to load service account JSON:", err);
  process.exit(1);
}

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: "enviroshake-gallery-app.appspot.com", // <-- Add your bucket here
    });
    console.log("✅ Firebase Admin initialized.");
  }
} catch (err) {
  console.error("❌ Failed to initialize Firebase Admin:", err);
  process.exit(1);
}

// Get Firestore and Storage instances
const db = admin.firestore();
const bucket = admin.storage().bucket(); // <-- This enables file access for ZIP downloads

// Optional: test Firestore connection
(async () => {
  try {
    await db.listCollections();
    console.log("✅ Firestore connection verified.");
  } catch (err) {
    console.error("❌ Firestore connection failed:", err);
  }
})();

module.exports = { admin, db, bucket };
