const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.resolve(__dirname, "secrets/firebase-service-account.json"));

// Initialize Firebase Admin SDK with explicit credentials and project ID
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

module.exports = { admin, db };
