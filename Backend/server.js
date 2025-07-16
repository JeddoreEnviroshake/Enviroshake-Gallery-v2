const express = require("express");
const AWS = require("aws-sdk");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const cors = require("cors");
const dotenv = require("dotenv");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("./firebaseAdmin");
const downloadGroupRoute = require("./routesDownloadGroup");
const downloadMultipleGroupsRoute = require("./downloadMultipleGroups");
dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Firestore initialization
const db = getFirestore();

// AWS S3 setup for downloads and deletes (AWS SDK v2)
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

// AWS S3 client for presigned uploads (AWS SDK v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Validate bucket env var
const BUCKET = process.env.AWS_S3_BUCKET;
if (!BUCKET) {
  process.exit(1);
}

// Generate pre-signed URL
app.post("/generate-upload-url", async (req, res) => {
  const { fileName, fileType } = req.body;
  if (!fileName || !fileType) {
    return res.status(400).json({ error: "Missing fileName or fileType" });
  }

  const key = `uploads/${Date.now()}_${fileName}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: fileType,
    ContentDisposition: "attachment",
    CacheControl: "public, max-age=31536000", // improves caching and avoids broken image behavior
  });

  try {
    const uploadURL = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    res.send({ uploadURL, key });
  } catch {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Delete from S3 and Firestore
app.delete("/delete-image", async (req, res) => {
  const { s3Key, docId } = req.body;

  if (!s3Key || !docId) {
    return res.status(400).json({ error: "Missing s3Key or docId" });
  }

  try {
    await s3.deleteObject({ Bucket: BUCKET, Key: s3Key }).promise();
    await db.collection("images").doc(docId).delete();
    res.status(200).json({ message: "Image deleted successfully" });
  } catch {
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// ZIP download endpoints
app.use("/download-group", downloadGroupRoute);
app.use("/download-multiple-groups", downloadMultipleGroupsRoute);

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT);
