// ✅ Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const AWS = require("aws-sdk");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const cors = require("cors");
const { admin, db } = require("./firebaseAdmin");
const downloadGroupRoute = require("./routesDownloadGroup");
const downloadMultipleGroupsRoute = require("./downloadMultipleGroups");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Test Firestore connection
db.collection("test-connection")
  .get()
  .then(snapshot => {
    console.log(`✅ Firebase connected. Found ${snapshot.size} documents in 'test-connection' collection.`);
  })
  .catch(error => {
    console.error("❌ Firebase connection failed:", error);
  });

// ✅ Validate required ENV variables
const REQUIRED_ENV_VARS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_S3_BUCKET"
];
REQUIRED_ENV_VARS.forEach(name => {
  if (!process.env[name]) {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
});

// ✅ AWS SDK v2 – for deletions and downloads
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  signatureVersion: "v4",
});

// ✅ AWS SDK v3 – for uploads
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

// ✅ Generate pre-signed upload URL
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
  });

  try {
    const uploadURL = await getSignedUrl(s3Client, command, {
      expiresIn: 60,
    });

    res.send({ uploadURL, key });
  } catch (error) {
    console.error("❌ Failed to generate presigned URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ✅ Delete image from S3 + Firestore
app.delete("/delete-image", async (req, res) => {
  const { s3Key, docId } = req.body;

  if (!s3Key || !docId) {
    return res.status(400).json({ error: "Missing s3Key or docId" });
  }

  try {
    await s3.deleteObject({ Bucket: BUCKET, Key: s3Key }).promise();
    await db.collection("images").doc(docId).delete();
    res.status(200).json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error("❌ Failed to delete:", err);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// ✅ ZIP download routes
app.use("/download-group", downloadGroupRoute);
app.use("/download-multiple-groups", downloadMultipleGroupsRoute);

// ✅ Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
