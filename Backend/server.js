const express = require("express");
const AWS = require("aws-sdk");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("./firebaseAdmin");
const downloadGroupRoute = require("./routesDownloadGroup");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const db = admin.firestore();

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

const BUCKET = process.env.AWS_S3_BUCKET;
if (!BUCKET) {
  console.error("AWS_S3_BUCKET is not defined in .env");
  process.exit(1);
}

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
    console.error("S3 error:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

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
    console.error("Error deleting image:", err);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

app.use("/download-group", downloadGroupRoute);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
