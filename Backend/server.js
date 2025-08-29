// Backend/server.js
require("dotenv").config({ override: true }); // ensure .env wins

const express = require("express");
const cors = require("cors");
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const admin = require("firebase-admin");            // for debug: show backend project id
const { db } = require("./firebaseAdmin");          // Firebase (company project)
const { s3, bucketName } = require("./aws/s3Client"); // Shared S3 v3 client
const downloadGroupRoute = require("./routesDownloadGroup");
const downloadMultipleGroupsRoute = require("./downloadMultipleGroups");
const presignGetRoute = require("./routesPresignGet"); // GET /presign-get

const app = express();

// Basic middleware
app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// --- quick sanity log (safe) ---
console.log(
  "AWS key (first 6):",
  (process.env.AWS_ACCESS_KEY_ID || "").slice(0, 6),
  "| bucket:",
  bucketName,
  "| region:",
  process.env.AWS_REGION
);

// ---- Sanity checks ----
const required = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_S3_BUCKET",
];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
}
if (!bucketName) {
  console.error("❌ AWS_S3_BUCKET not set.");
  process.exit(1);
}

// Optional: where uploads go inside the bucket (default 'uploads/')
const RAW_PREFIX = process.env.S3_UPLOAD_PREFIX || "uploads/";
const UPLOAD_PREFIX = RAW_PREFIX.endsWith("/") ? RAW_PREFIX : `${RAW_PREFIX}/`;

// ---- Firebase quick connectivity check (optional) ----
db.collection("test-connection")
  .get()
  .then((snapshot) => {
    console.log(
      `✅ Firebase connected. Found ${snapshot.size} docs in test-connection`
    );
  })
  .catch((err) => {
    console.error("❌ Firebase connection failed:", err);
  });

// ---- Health check ----
app.get('/health', (_req, res) => res.type('text').send('ok'));

/**
 * ---------------------------------------------------------------------------
 * DEBUG ROUTES
 * ---------------------------------------------------------------------------
 * These help us confirm the backend Firebase project and see sample image docs.
 */

// Which Firebase project is the backend using?
app.get("/debug/firebase", (_req, res) => {
  try {
    const opts = admin.app().options || {};
    res.json({
      adminProjectId: opts.projectId || process.env.FIREBASE_PROJECT_ID || "(unknown)",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Peek at a couple of docs in the `images` collection
app.get("/debug/images", async (_req, res) => {
  try {
    const snap = await db.collection("images").limit(5).get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * ---------------------------------------------------------------------------
 * APP ROUTES
 * ---------------------------------------------------------------------------
 */

// ---- Generate presigned S3 upload URL ----
app.post("/generate-upload-url", async (req, res) => {
  try {
    const { fileName, fileType } = req.body || {};
    if (!fileName || !fileType) {
      return res.status(400).json({ error: "Missing fileName or fileType" });
    }

    const key = `${UPLOAD_PREFIX}${Date.now()}_${fileName}`;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: fileType,
    });

    const uploadURL = await getSignedUrl(s3, command, { expiresIn: 60 });
    res.json({
      uploadURL,
      key,
      bucket: bucketName,
      region: process.env.AWS_REGION,
    });
  } catch (err) {
    console.error("❌ Failed to generate upload URL:", err);
    res.status(500).json({ error: "Upload URL error" });
  }
});

// ---- Delete image from S3 + Firestore doc ----
app.delete("/delete-image", async (req, res) => {
  try {
    const { s3Key, docId } = req.body || {};
    if (!s3Key || !docId) {
      return res.status(400).json({ error: "Missing s3Key or docId" });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: s3Key }));
    await db.collection("images").doc(docId).delete();
    res.json({ message: "Image deleted" });
  } catch (err) {
    console.error("❌ Failed to delete image:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ---- Routes ----
app.use("/download-group", downloadGroupRoute);
app.use("/download-multiple-groups", downloadMultipleGroupsRoute);
app.use(presignGetRoute); // provides GET /presign-get

// ---- Start server ----
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
