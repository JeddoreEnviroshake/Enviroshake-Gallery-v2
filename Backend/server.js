const express = require("express");
const AWS = require("aws-sdk");
const cors = require("cors");
const dotenv = require("dotenv");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("./firebaseAdmin");
const downloadGroupRoute = require("./routesDownloadGroup");
const downloadMultipleGroupsRoute = require("./downloadMultipleGroups"); // ✅ NEW

dotenv.config(); // ✅ Load environment variables first

// ✅ Sanity check: print AWS config (you can remove this after debugging)
console.log("Loaded AWS credentials:", {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_S3_BUCKET,
});

// ✅ Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// ✅ Firestore initialization
const db = getFirestore();

// ✅ AWS S3 setup
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

// ✅ Validate bucket env var
const BUCKET = process.env.AWS_S3_BUCKET;
if (!BUCKET) {
  console.error("❌ AWS_S3_BUCKET is not defined in .env");
  process.exit(1);
}

// ✅ Generate pre-signed URL
app.post("/generate-upload-url", async (req, res) => {
  const { fileName, fileType } = req.body;
  if (!fileName || !fileType) {
    return res.status(400).json({ error: "Missing fileName or fileType" });
  }

  const key = `uploads/${Date.now()}_${fileName}`;
  const params = {
    Bucket: BUCKET,
    Key: key,
    Expires: 60,
    ContentType: fileType,
  };

  try {
    const uploadURL = await s3.getSignedUrlPromise("putObject", params);
    res.send({ uploadURL, key });
  } catch (err) {
    console.error("❌ S3 pre-sign error:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ✅ Delete from S3 and Firestore
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
    console.error("❌ Delete error:", err);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// ✅ ZIP download endpoints
app.use("/download-group", downloadGroupRoute);
app.use("/download-multiple-groups", downloadMultipleGroupsRoute); // ✅ NEW

// ✅ Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
