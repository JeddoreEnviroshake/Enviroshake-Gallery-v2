require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const { db } = require("./firebaseAdmin"); // ✅ Use shared connection
const downloadGroupRoute = require("./routesDownloadGroup");
const downloadMultipleGroupsRoute = require("./downloadMultipleGroups");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Check Firebase connection
db.collection("test-connection")
  .get()
  .then(snapshot => {
    console.log(`✅ Firebase connected. Found ${snapshot.size} docs in test-connection`);
  })
  .catch(err => {
    console.error("❌ Firebase connection failed:", err);
  });

// ✅ Check required ENV variables
["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_S3_BUCKET"].forEach(name => {
  if (!process.env[name]) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

// ✅ Generate S3 upload URL
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
    const uploadURL = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    res.send({ uploadURL, key });
  } catch (err) {
    console.error("❌ Failed to generate upload URL:", err);
    res.status(500).json({ error: "Upload URL error" });
  }
});

// ✅ Delete image
app.delete("/delete-image", async (req, res) => {
  const { s3Key, docId } = req.body;

  if (!s3Key || !docId) {
    return res.status(400).json({ error: "Missing s3Key or docId" });
  }

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    await db.collection("images").doc(docId).delete();
    res.status(200).json({ message: "Image deleted" });
  } catch (err) {
    console.error("❌ Failed to delete image:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ✅ Routes
app.use("/download-group", downloadGroupRoute);
app.use("/download-multiple-groups", downloadMultipleGroupsRoute);

// ✅ Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
