const express = require("express");
const AWS = require("aws-sdk");
const archiver = require("archiver");
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

    res.type("zip");
    res.attachment(`${groupName}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ message: "Archive generation failed." });
      }
    });
    archive.pipe(res);

    res.on("error", () => {});

    const folderName = `${groupName}/`;
    const streamPromises = snapshot.docs.map((doc, index) => {
      const { s3Key } = doc.data();
      if (!s3Key || s3Key.includes("firebasestorage.googleapis.com")) {
        return Promise.resolve();
      }

      const idxStr = String(index + 1).padStart(3, "0");
      const fileName = `${groupName}_${idxStr}.jpg`;

      return new Promise((resolve, reject) => {
        const s3Stream = s3
          .getObject({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key })
          .createReadStream();

        s3Stream.on("error", reject);
        archive.append(s3Stream, { name: `${folderName}${fileName}` });
        s3Stream.on("end", resolve);
      });
    });

    Promise.all(streamPromises)
      .then(() => archive.finalize())
      .catch(() => {
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to stream images." });
        } else {
          res.end();
        }
      });
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download ZIP." });
    }
  }
});

module.exports = router;
