const admin = require("firebase-admin");
const path = require("path");

// Load the service account from the /secrets/ folder
const serviceAccountPath = path.resolve(__dirname, "secrets", "firebase-service-account.json");
const serviceAccount = require(serviceAccountPath);

// Debug log — shows which service account is being loaded
console.log("Loaded service account email:", serviceAccount.client_email);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
