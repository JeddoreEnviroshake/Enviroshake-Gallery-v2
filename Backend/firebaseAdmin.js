// Backend/firebaseAdmin.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Path to the service account JSON file (you placed it here)
const serviceAccountPath = path.resolve(__dirname, "secrets", "serviceAccountKey.json");

// Bail early if the key file is missing
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ Service account file not found at:", serviceAccountPath);
  process.exit(1);
}

// Load the service account JSON
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
  console.log("✅ Loaded Firebase service account:", serviceAccount.client_email);
} catch (err) {
  console.error("❌ Failed to load service account JSON:", err);
  process.exit(1);
}

// Initialize Firebase Admin (company project)
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Company Firebase Storage bucket
      storageBucket: "enviroshake-gallery.appspot.com",
    });
    console.log("✅ Firebase Admin initialized (enviroshake-gallery).");
  }
} catch (err) {
  console.error("❌ Failed to initialize Firebase Admin:", err);
  process.exit(1);
}

// Export handles
const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { admin, db, bucket };
