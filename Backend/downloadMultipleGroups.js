// Download multiple image groups as a single ZIP

const express = require("express");
const archiver = require("archiver");
const admin = require("firebase-admin");
const AWS = require("aws-sdk");

const router = express.Router();
const s3 = new AWS.S3();
const bucket = process.env.AWS_S3_BUCKET;

router.post("/", async (req, res) => {
  const { groupIds } = req.body;
  if (!groupIds || !Array.isArray(groupIds)) {
    return res.status(400).json({ error: "Invalid groupIds" });
  }

  res.attachment(`enviroshake_selected_groups.zip`);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => res.status(500).send({ error: err.message }));
  archive.pipe(res);

  try {
    for (const groupId of groupIds) {
      const imageDocs = await admin
        .firestore()
        .collection("images")
        .where("groupId", "==", groupId)
        .get();

      const groupMeta = await admin
        .firestore()
        .collection("imageGroups")
        .doc(groupId)
        .get();

      const groupName = groupMeta.exists ? groupMeta.data().groupName : groupId;
      const safeName = groupName.replace(/[^a-zA-Z0-9_-]/g, "_");

      let i = 1;
      for (const doc of imageDocs.docs) {
        const { s3Key } = doc.data();

        if (!s3Key) {
          continue;
        }

        const extension = s3Key.endsWith(".png") ? ".png" : ".jpg";
        const fileName = `${safeName}_${String(i).padStart(3, "0")}${extension}`;
        const s3Stream = s3
          .getObject({ Bucket: bucket, Key: s3Key })
          .createReadStream();
        archive.append(s3Stream, { name: fileName });
        i++;
      }
    }

    await archive.finalize();
  } catch {
    res.status(500).send("Error generating ZIP");
  }
});

module.exports = router;
