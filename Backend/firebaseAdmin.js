const admin = require("firebase-admin");
const path = require("path");

// Load the new service account from /secrets/
const serviceAccount = require(path.resolve(__dirname, "secrets/firebase-service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
