const admin = require("firebase-admin");
const path = require("path");

// Adjust the path below ONLY if the JSON is in /secrets/. Otherwise use direct filename.
const serviceAccount = require(path.resolve(__dirname, "enviroshake-service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
