// Backend/routesDownloadGroup.js
const express = require("express");
const archiver = require("archiver");
const { PassThrough } = require("stream");
const { GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const { db } = require("./firebaseAdmin");            // Firestore
const { s3, bucketName } = require("./aws/s3Client"); // S3 v3 client

const router = express.Router();

// Optional: set in .env (defaults to "uploads/"), e.g. S3_UPLOAD_PREFIX=images/
const RAW_PREFIX = process.env.S3_UPLOAD_PREFIX || "uploads/";
const UPLOAD_PREFIX = RAW_PREFIX.endsWith("/") ? RAW_PREFIX : `${RAW_PREFIX}/`;

// Accept both our historical prefixes ("uploads/" and "images/")
const ACCEPT_PREFIXES = Array.from(new Set([UPLOAD_PREFIX, "images/"]));

// --- helpers ---------------------------------------------------------------

// Basic filename sanitization for zip entries
function safeName(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}

// Derive file extension from an S3 key, fallback to jpg
function extFromKey(key) {
  const last = key.split("/").pop() || "";
  const idx = last.lastIndexOf(".");
  if (idx > -1 && idx < last.length - 1) {
    const ext = last.slice(idx + 1).toLowerCase();
    // Guard against absurdly long "extensions"
    if (ext.length <= 10) return ext;
  }
  return "jpg";
}

function s3KeyEligible(k) {
  return (
    typeof k === "string" &&
    !/^https?:\/\//i.test(k) &&               // exclude absolute external URLs
    ACCEPT_PREFIXES.some((p) => k.startsWith(p))
  );
}

// Generate candidate group identifiers from raw input
function makeCandidates(raw) {
  const base = String(raw || "").trim();
  return Array.from(
    new Set([
      base,
      base.replace(/_/g, " "),
      base.replace(/\s+/g, "_"),
      base.replace(/[\s_]+/g, ""),
    ])
  ).filter(Boolean);
}

// Normalize S3 key by stripping protocol/domain and leading slashes
function normalizeS3Key(k) {
  if (typeof k !== "string") return null;
  let key = k.trim();
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) {
    try {
      key = new URL(key).pathname || "";
    } catch (_) {
      /* noop */
    }
  }
  key = key.replace(/^\/+/, "");
  return key || null;
}

// Dedupe Firestore docs by normalized S3 key or path
function dedupeByNormalizedKey(docs) {
  const seen = new Map();
  for (const d of docs) {
    const data = d.data() || {};
    const key = normalizeS3Key(data.s3Key);
    const mapKey = key || d.ref.path;
    if (!seen.has(mapKey)) {
      seen.set(mapKey, d);
    }
  }
  return Array.from(seen.values());
}

// Query images for multiple candidate identifiers across common fields
async function unionDocsForCandidates(candidates) {
  const IMAGE_FIELDS = ["groupId", "groupID", "group", "groupName", "name"];
  const docs = [];
  for (const cid of candidates) {
    for (const f of IMAGE_FIELDS) {
      const snap = await db.collection("images").where(f, "==", cid).get();
      docs.push(...snap.docs);
    }
  }
  return docs;
}

// ---------------------------------------------------------------------------
// DEBUG ROUTE: Inspect how Firestore matches your group identifier.
// GET /download-group/debug/:groupId
router.get("/debug/:groupId", async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.groupId || "");
    const candidates = Array.from(
      new Set([
        raw,
        raw.replace(/_/g, " "),
        raw.replace(/\s+/g, "_"),
        raw.replace(/[\s_]+/g, ""), // collapsed
      ])
    );

    const IMAGE_FIELDS = ["groupId", "groupID", "group", "groupName", "name"];

    const imageFieldCounts = [];
    for (const cid of candidates) {
      const row = { candidate: cid, counts: {} };
      for (const f of IMAGE_FIELDS) {
        const snap = await db.collection("images").where(f, "==", cid).get();
        row.counts[f] = snap.size;
      }
      imageFieldCounts.push(row);
    }

    const imageGroupsMatches = [];
    for (const cid of candidates) {
      let g = await db
        .collection("imageGroups")
        .where("groupId", "==", cid)
        .limit(1)
        .get();
      if (g.empty) {
        g = await db
          .collection("imageGroups")
          .where("groupName", "==", cid)
          .limit(1)
          .get();
      }
      if (!g.empty) {
        const d = g.docs[0].data() || {};
        imageGroupsMatches.push({
          matchedOn: cid,
          groupId: d.groupId ?? g.docs[0].id,
          groupName: d.groupName,
        });
      }
    }

    res.json({ candidates, imageFieldCounts, imageGroupsMatches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// CHECK ROUTE: Verify group image availability and S3 keys
// GET /download-group/check/:groupId
router.get("/check/:groupId", async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.groupId || "").trim();
    const candidates = makeCandidates(raw);

    let docs = await unionDocsForCandidates(candidates);
    const before = docs.length;

    // Deduplicate by normalized key or path
    docs = dedupeByNormalizedKey(docs);

    if (docs.length === 0) {
      return res.json({ ok: false, reason: "no images matched" });
    }

    const results = [];
    for (const d of docs) {
      const data = d.data() || {};
      const rawKey = data.s3Key ?? null;
      const key = normalizeS3Key(rawKey);
      const eligible = s3KeyEligible(rawKey); // NEW: would ZIP include this?

      let exists = false, contentLength = null, err = null;

      if (key && eligible) {
        try {
          const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          exists = true;
          contentLength = head.ContentLength ?? null;
        } catch (e) {
          err = e?.name || e?.message || String(e);
        }
      } else {
        // Explain why it would be skipped
        err = key ? "ineligible key (filtered by prefix or non-s3)" : "invalid/empty/non-S3 key";
      }

      results.push({
        path: d.ref.path,
        groupId: data.groupId ?? data.groupID ?? data.group ?? null,
        groupName: data.groupName ?? null,
        s3Key: rawKey,
        normalizedKey: key,
        eligible,        // NEW
        exists,
        contentLength,
        err,
      });
    }

    res.json({
      ok: true,
      bucket: bucketName,
      foundBeforeDedupe: before,
      count: results.length,
      results,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------------------
// MAIN ROUTE: Build and stream a ZIP of all images in a group.
// GET /download-group/:groupId
router.get("/:groupId", async (req, res) => {
  const raw = decodeURIComponent(req.params.groupId || "");
  const candidates = Array.from(
    new Set([raw, raw.replace(/_/g, " "), raw.replace(/\s+/g, "_")])
  );
  const IMAGE_FIELDS = ["groupId", "groupID", "group", "groupName", "name"];

  try {
    console.log("🔍 Group download requested:", raw);

    let imagesSnap = null;
    let matched = null;
    let resolvedId = null;

    // (a) Try direct image queries across multiple fields/candidates
    outer: for (const cid of candidates) {
      for (const field of IMAGE_FIELDS) {
        const snap = await db
          .collection("images")
          .where(field, "==", cid)
          .get(); // ← removed .orderBy("timestamp", "asc")
        if (!snap.empty) {
          imagesSnap = snap;
          matched = { field, value: cid };
          break outer;
        }
      }
    }

    // (b) Fallback via imageGroups to resolve a canonical groupId, then re-query images
    if (!imagesSnap) {
      for (const cid of candidates) {
        let grpSnap = await db
          .collection("imageGroups")
          .where("groupId", "==", cid)
          .limit(1)
          .get();
        if (grpSnap.empty) {
          grpSnap = await db
            .collection("imageGroups")
            .where("groupName", "==", cid)
            .limit(1)
            .get();
        }
        if (!grpSnap.empty) {
          resolvedId = grpSnap.docs[0].data().groupId || grpSnap.docs[0].id;
          for (const field of IMAGE_FIELDS) {
            const snap = await db
              .collection("images")
              .where(field, "==", resolvedId)
              .get(); // ← removed .orderBy("timestamp", "asc")
            if (!snap.empty) {
              imagesSnap = snap;
              matched = { field, value: resolvedId };
              break;
            }
          }
          if (imagesSnap) break;
        }
      }
    }

    if (!imagesSnap) {
      return res
        .status(404)
        .json({ message: "No images found for this group." });
    }

    console.log("download-group matched:", matched);

    // 2) Filter to S3-backed images (allow "uploads/" and "images/")
    const imageDocs = imagesSnap.docs.filter((d) => {
      const { s3Key } = d.data() || {};
      return s3KeyEligible(s3Key);
    });

    if (imageDocs.length === 0) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    // 3) Resolve groupName (prefer imageGroups/<groupId>, fallback to image doc or groupId)
    const firstData = imagesSnap.docs[0]?.data() || {};
    const finalId =
      resolvedId || firstData.groupId || firstData.groupID || firstData.group || matched.value;
    let groupName = finalId;
    try {
      const grpDoc = await db.collection("imageGroups").doc(finalId).get();
      if (grpDoc.exists && grpDoc.data()?.groupName) {
        groupName = grpDoc.data().groupName;
      } else if (imagesSnap.docs[0].data()?.groupName) {
        groupName = imagesSnap.docs[0].data().groupName;
      }
    } catch (e) {
      // Non-fatal — continue with fallback name
      console.warn("⚠️ Could not read imageGroups doc; using fallback name.", e?.message);
      if (imagesSnap.docs[0].data()?.groupName) {
        groupName = imagesSnap.docs[0].data().groupName;
      }
    }
    groupName = safeName(groupName);

    // 4) Ensure bucket configured
    if (!bucketName) {
      return res.status(500).json({ message: "AWS_S3_BUCKET is not defined in .env" });
    }

    // 5) Prefetch check: ensure at least one S3 object exists before sending headers
    let hasAtLeastOneObject = false;
    for (const doc of imageDocs) {
      const { s3Key } = doc.data();
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: s3Key }));
        hasAtLeastOneObject = true;
        break;
      } catch {
        // Keep scanning; object might have been deleted
      }
    }

    if (!hasAtLeastOneObject) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    // 6) Prepare ZIP response (send headers AFTER preflight success)
    res.setHeader("Content-Type", "application/zip");
    // Add RFC 5987 filename* to better support special characters
    const filename = `${groupName}.zip`;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });

    // Clean abort if client disconnects
    req.on("aborted", () => {
      console.warn("⚠️ Client aborted download; aborting archive.");
      archive.abort();
    });

    archive.on("error", (err) => {
      console.error("❌ Archiver error:", err);
      if (!res.headersSent) res.status(500).send("Archive error.");
      try { res.end(); } catch (_) {}
    });

    archive.on("finish", () => console.log("✅ Archive stream finished."));
    archive.pipe(res);

    // 7) Stream each S3 object into the ZIP
    let fileIndex = 0;
    for (const doc of imageDocs) {
      const { s3Key } = doc.data();

      // Skip keys that no longer match expectations
      if (!s3KeyEligible(s3Key)) {
        console.warn("⚠️ Skipping non-S3 or unexpected key:", s3Key);
        continue;
      }

      const ext = extFromKey(s3Key);
      const padded = String(++fileIndex).padStart(3, "0");
      const nameInZip = `${groupName}/${groupName}_${padded}.${ext}`;

      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));
        if (!obj.Body) {
          console.warn("⚠️ Empty S3 body for key:", s3Key);
          continue;
        }

        // Stream S3 object into the zip
        const passthrough = new PassThrough();
        obj.Body.pipe(passthrough);
        archive.append(passthrough, { name: nameInZip });

        console.log("✅ Added to archive:", s3Key, "→", nameInZip);
      } catch (err) {
        console.error(`❌ S3 fetch failed for key: ${s3Key}`, err?.message || err);
        // Continue with the rest
      }
    }

    if (fileIndex === 0) {
      console.warn("⚠️ No files were successfully added to the archive.");
      archive.abort();
      try { res.end(); } catch (_) {}
      return;
    }

    // 8) Finalize ZIP
    await archive.finalize();
    console.log("✅ Archive finalized and sent.");
  } catch (err) {
    console.error("❌ Error in download group route:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download group ZIP." });
    } else {
      try { res.end(); } catch (_) {}
    }
  }
});

module.exports = router;
