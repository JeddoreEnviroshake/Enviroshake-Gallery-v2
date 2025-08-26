// Backend/routesDownloadGroup.js
const express = require("express");
const archiver = require("archiver");
const { PassThrough } = require("stream");
const { GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const { db } = require("./firebaseAdmin");
const { s3, bucketName } = require("./aws/s3Client");

const router = express.Router();

// Optional: S3_UPLOAD_PREFIX=images/ (defaults to uploads/)
const RAW_PREFIX = process.env.S3_UPLOAD_PREFIX || "uploads/";
const UPLOAD_PREFIX = RAW_PREFIX.endsWith("/") ? RAW_PREFIX : `${RAW_PREFIX}/`;
const ACCEPT_PREFIXES = Array.from(new Set([UPLOAD_PREFIX, "images/"]));

const IMAGE_FIELDS = ["groupId", "groupID", "group", "groupName", "name"];

// ---------- helpers ----------
function safeName(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}

function extFromKey(key) {
  const last = (key || "").split("/").pop() || "";
  const i = last.lastIndexOf(".");
  if (i > -1 && i < last.length - 1) {
    const ext = last.slice(i + 1).toLowerCase();
    if (ext.length <= 10) return ext;
  }
  return "jpg";
}

// Accept raw keys and full S3 URLs; return a normalized key
function normalizeS3Key(k) {
  if (!k || typeof k !== "string") return null;
  k = k.trim(); // removes stray \n, spaces, etc.

  if (/^https?:\/\//i.test(k)) {
    try {
      const u = new URL(k);
      const host = (u.host || "").toLowerCase();
      const isAmazon =
        host.includes(".s3.") ||
        host === "s3.amazonaws.com" ||
        host.startsWith("s3.");
      if (!isAmazon) return null; // not our S3

      let path = (u.pathname || "/").trim();
      path = path.startsWith("/") ? path.slice(1) : path;
      const parts = path.split("/");
      if (
        parts[0] &&
        bucketName &&
        parts[0].toLowerCase() === bucketName.toLowerCase()
      ) {
        parts.shift(); // strip "<bucket>/"
      }
      return parts.join("/");
    } catch {
      return null;
    }
  }
  return k;
}

function s3KeyEligible(k) {
  const key = normalizeS3Key(k);
  if (!key) return false;
  const wasUrl = /^https?:\/\//i.test(String(k));
  return wasUrl ? true : ACCEPT_PREFIXES.some((p) => key.startsWith(p));
}

function makeCandidates(raw) {
  return Array.from(
    new Set([
      raw,
      raw.replace(/_/g, " "),
      raw.replace(/\s+/g, "_"),
      raw.replace(/[\s_]+/g, ""),
    ])
  );
}

// fetch docs where a field == value from both top-level images and any subcollection named "images"
async function queryImagesByFieldAndValue(field, value) {
  const out = [];
  try {
    const snap = await db.collection("images").where(field, "==", value).get();
    out.push(...snap.docs);
  } catch {}
  try {
    const cg = await db.collectionGroup("images").where(field, "==", value).get();
    out.push(...cg.docs);
  } catch {}
  return out;
}

async function unionDocsForValue(value) {
  const map = new Map(); // key: doc.ref.path
  for (const f of IMAGE_FIELDS) {
    const docs = await queryImagesByFieldAndValue(f, value);
    for (const d of docs) {
      const key = d.ref?.path || d.id;
      if (!map.has(key)) map.set(key, d);
    }
  }
  return Array.from(map.values());
}

async function unionDocsForCandidates(cands) {
  const map = new Map();
  for (const c of cands) {
    const docs = await unionDocsForValue(c);
    for (const d of docs) {
      const key = d.ref?.path || d.id;
      if (!map.has(key)) map.set(key, d);
    }
  }
  return Array.from(map.values());
}

function sortImageDocs(docs) {
  return docs.slice().sort((a, b) => {
    const da = a.data() || {};
    const dbb = b.data() || {};
    const ta = da.timestamp?.seconds ?? da.timestamp?._seconds ?? 0;
    const tb = dbb.timestamp?.seconds ?? dbb.timestamp?._seconds ?? 0;
    if (ta !== tb) return ta - tb;
    const ka = (da.s3Key || "").toString();
    const kb = (dbb.s3Key || "").toString();
    if (ka !== kb) return ka.localeCompare(kb);
    return (a.ref?.path || a.id).localeCompare(b.ref?.path || b.id);
  });
}

// ---------- diagnostics (keep; super useful) ----------
router.get("/check/:groupId", async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.groupId || "").trim();
    const candidates = makeCandidates(raw);
    let docs = await unionDocsForCandidates(candidates);

    // Also try imageGroups matches to pull subcollection docs (even if they lack groupId fields)
    const canonicalIds = new Set();
    for (const cid of candidates) {
      try {
        let g = await db.collection("imageGroups").where("groupId", "==", cid).limit(1).get();
        if (g.empty) {
          g = await db.collection("imageGroups").where("groupName", "==", cid).limit(1).get();
        }
        if (!g.empty) canonicalIds.add(g.docs[0].data()?.groupId || g.docs[0].id);
      } catch {}
    }
    for (const gid of canonicalIds) {
      try {
        const sub = await db.collection("imageGroups").doc(gid).collection("images").get();
        for (const d of sub.docs) {
          const key = d.ref?.path || d.id;
          if (!docs.find(x => (x.ref?.path || x.id) === key)) docs.push(d);
        }
      } catch {}
    }

    if (docs.length === 0) return res.json({ ok: false, reason: "no images matched" });

    const results = [];
    for (const d of docs) {
      const data = d.data() || {};
      const rawKey = data.s3Key ?? null;
      const key = normalizeS3Key(rawKey);
      let exists = false, contentLength = null, err = null;
      if (key) {
        try {
          const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          exists = true;
          contentLength = head.ContentLength ?? null;
        } catch (e) {
          err = e?.name || e?.message || String(e);
        }
      } else {
        err = "invalid/empty/non-S3 key";
      }
      results.push({
        path: d.ref?.path || d.id,
        groupId: data.groupId ?? data.groupID ?? data.group ?? null,
        groupName: data.groupName ?? null,
        s3Key: rawKey,
        normalizedKey: key,
        exists,
        contentLength,
        err,
      });
    }
    res.json({ ok: true, bucket: bucketName, count: results.length, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- main ZIP route ----------
router.get("/:groupId", async (req, res) => {
  const raw0 = decodeURIComponent(req.params.groupId || "");
  const raw = raw0.trim();
  const candidates = makeCandidates(raw);

  try {
    console.log("🔍 Group download requested:", raw);

    // 1) Gather matching docs by fields across top-level & subcollections
    let imageDocs = await unionDocsForCandidates(candidates);

    // 2) Resolve possible canonical groupId via imageGroups, and also load its subcollection images
    const canonicalIds = new Set();
    for (const cid of candidates) {
      try {
        let g = await db.collection("imageGroups").where("groupId", "==", cid).limit(1).get();
        if (g.empty) {
          g = await db.collection("imageGroups").where("groupName", "==", cid).limit(1).get();
        }
        if (!g.empty) canonicalIds.add(g.docs[0].data()?.groupId || g.docs[0].id);
      } catch {}
    }
    for (const gid of canonicalIds) {
      try {
        const sub = await db.collection("imageGroups").doc(gid).collection("images").get();
        for (const d of sub.docs) {
          const key = d.ref?.path || d.id;
          if (!imageDocs.find(x => (x.ref?.path || x.id) === key)) imageDocs.push(d);
        }
      } catch {}
    }

    if (imageDocs.length === 0) {
      return res.status(404).json({ message: "No images found for this group." });
    }

    // 3) Keep only S3-backed docs
    imageDocs = imageDocs.filter((d) => s3KeyEligible((d.data() || {}).s3Key));
    if (imageDocs.length === 0) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    // 4) Deterministic ordering
    imageDocs = sortImageDocs(imageDocs);

    // 5) Derive a friendly group name
    const first = imageDocs[0].data() || {};
    const groupIdCandidate = first.groupId ?? first.groupID ?? first.group ?? [...canonicalIds][0] ?? raw;
    let groupName = first.groupName || groupIdCandidate;
    try {
      const grpDoc = await db.collection("imageGroups").doc(groupIdCandidate).get();
      if (grpDoc.exists && grpDoc.data()?.groupName) groupName = grpDoc.data().groupName;
    } catch {}
    groupName = safeName(groupName);

    // 6) Ensure bucket and preflight at least one object
    if (!bucketName) {
      return res.status(500).json({ message: "AWS_S3_BUCKET is not defined in .env" });
    }
    let ok = false;
    for (const d of imageDocs) {
      const key = normalizeS3Key((d.data() || {}).s3Key);
      if (!key) continue;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        ok = true; break;
      } catch {}
    }
    if (!ok) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    // 7) ZIP headers
    const filename = `${groupName}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    req.on("aborted", () => { console.warn("⚠️ Client aborted download."); archive.abort(); });
    archive.on("error", (err) => {
      console.error("❌ Archiver error:", err);
      if (!res.headersSent) res.status(500).send("Archive error.");
      try { res.end(); } catch {}
    });
    archive.on("finish", () => console.log("✅ Archive stream finished."));
    archive.pipe(res);

    // 8) Stream each S3 object
    let fileIndex = 0;
    for (const d of imageDocs) {
      const data = d.data() || {};
      const key = normalizeS3Key(data.s3Key);
      if (!key) { console.warn("⚠️ Skipping invalid/non-S3 key:", data.s3Key); continue; }

      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
        if (!obj.Body) { console.warn("⚠️ Empty S3 body for:", key); continue; }

        const nameInZip = `${groupName}/${groupName}_${String(++fileIndex).padStart(3, "0")}.${extFromKey(key)}`;
        const passthrough = new PassThrough();
        obj.Body.pipe(passthrough);
        archive.append(passthrough, { name: nameInZip });
        console.log("🧩 Added to archive:", key, "→", nameInZip);
      } catch (err) {
        console.error("❌ S3 fetch failed:", key, err?.message || err);
      }
    }

    if (fileIndex === 0) {
      console.warn("⚠️ Nothing was added to the archive.");
      archive.abort();
      try { res.end(); } catch {}
      return;
    }

    await archive.finalize();
    console.log("✅ Archive finalized and sent.");
  } catch (err) {
    console.error("❌ Error in download group route:", err);
    if (!res.headersSent) res.status(500).json({ message: "Failed to download group ZIP." });
    else try { res.end(); } catch {}
  }
});

module.exports = router;
