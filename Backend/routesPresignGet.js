// Backend/routesPresignGet.js
const express = require("express");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { s3, bucketName } = require("./aws/s3Client");

const router = express.Router();

// GET /presign-get?key=uploads/xxx.jpg&expiresIn=60
router.get("/presign-get", async (req, res) => {
  try {
    const { key, expiresIn } = req.query;
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "Missing key" });
    }
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const url = await getSignedUrl(s3, command, {
      expiresIn: Number(expiresIn) || 60,
    });
    res.json({ url });
  } catch (err) {
    console.error("❌ presign-get error:", err);
    res.status(500).json({ error: "Failed to presign GET" });
  }
});

module.exports = router;
