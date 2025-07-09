const express = require("express");
const AWS = require("aws-sdk");
const archiver = require("archiver");
const path = require("path");

const admin = require("firebase-admin");

const db = admin.firestore();

const router = express.Router();

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

router.get("/:groupId", async (req, res) => {
  const { groupId } = req.params;

  try {
    const snapshot = await db
      .collection("images")
      .where("groupId", "==", groupId)
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "No images found." });
    }

    const groupName = snapshot.docs[0].data().groupName || groupId;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${groupName}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    const folderName = `${groupName}/`;
    let index = 1;

    for (const doc of snapshot.docs) {
      const { s3Key } = doc.data();
      const s3Stream = s3
        .getObject({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key })
        .createReadStream();

      const ext = path.extname(s3Key);
      const idxStr = index.toString().padStart(3, "0");
      const fileName = `${groupName}_${idxStr}${ext}`;

      archive.append(s3Stream, { name: `${folderName}${fileName}` });
      index += 1;
    }

    await archive.finalize();
  } catch (err) {
    console.error("ZIP download error:", err);
    res.status(500).json({ message: "Failed to download ZIP." });
  }
});

module.exports = router;
