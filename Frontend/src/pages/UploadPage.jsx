import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { COLOR_OPTIONS } from "../Constants/colorOptions";
import { auth } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { generateUploadUrl } from "../services/api";

const OPTIONS = {
  productLines: ["Enviroshake", "Enviroshingle", "EnviroSlate"],
  roofTags: [
    "Gable", "Gambrel", "Hip", "Mansard", "Siding", "Dormer", "Eyebrow", "Flared Rake",
    "Rake Metal", "Skylight", "Snow Guards", "Solar Panels", "Staggered Coursing",
    "Steeple", "Straight Coursing", "Turret", "valleys"
  ],
  projectTypes: [
    "Barn", "Clubhouse", "Commercial", "Education", "Gazebo", "Historic", "HOA",
    "Hospitality", "Multifamily", "National Monument", "National Register of Historic Sites",
    "Religious", "Residential", "Retail"
  ],
  countries: ["Canada", "USA", "Caribbean", "Other"],
};

export default function UploadPage() {
  const [selectedColors, setSelectedColors] = useState([]);
  const [productLine, setProductLine] = useState(null);
  const [roofTags, setRoofTags] = useState([]);
  const [projectTags, setProjectTags] = useState([]);
  const [countryTags, setCountryTags] = useState([]);
  const [notes, setNotes] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [internalOnly, setInternalOnly] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.email) {
        setUserEmail(user.email.toLowerCase());
      }
    });
    return () => unsubscribe();
  }, []);

  const handleFileChange = (e) => {
    setSelectedFiles(Array.from(e.target.files));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  function toSafeGroupId(name) {
    if (!name || typeof name !== "string") return "";
    const base = name
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return base ? `${base}_001` : "";
  }

  const groupId = [
    productLine?.value || "—",
    selectedColors[0]?.value || "—",
    toSafeGroupId(projectName) || "—",
  ].join("_");

  const namePreview = groupId;

  const handleUpload = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setMessage("");
    setUploading(true);
    try {
      const { files } = e?.target || {};
      const filesArr = Array.from(selectedFiles || files || []);
      if (!filesArr.length) {
        alert("Please choose at least one image.");
        return;
      }

      if (!userEmail) {
        alert("You must be logged in to upload.");
        return;
      }

      let effectiveGroupId = groupId;
      if (!effectiveGroupId || !effectiveGroupId.trim()) {
        effectiveGroupId = toSafeGroupId(projectName || "");
      }
      if (!effectiveGroupId) {
        alert("Project Name / Group ID is required.");
        return;
      }

      for (const file of filesArr) {
        console.log("DEBUG upload payload:", {
          groupId: effectiveGroupId,
          filename: file.name,
          contentType: file.type,
        });

        let presign;
        try {
          presign = await generateUploadUrl({
            groupId: effectiveGroupId,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
          });
          console.log("DEBUG presign response:", presign);
        } catch (err) {
          console.error("UPLOAD ERROR (presign):", err);
          alert(`Upload failed (presign): ${err?.message || err}`);
          return;
        }

        try {
          const putRes = await fetch(presign.url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!putRes.ok) {
            const txt = await putRes.text().catch(() => "");
            throw new Error(`S3 PUT failed: HTTP ${putRes.status} ${txt || ""}`);
          }
          console.log("DEBUG S3 PUT success:", file.name);
        } catch (err) {
          console.error("UPLOAD ERROR (S3 PUT):", err);
          alert(`Upload failed (S3): ${err?.message || err}`);
          return;
        }
      }

      console.log("DEBUG metadata save step for group:", effectiveGroupId);
      alert("Upload complete.");
      setMessage("Upload complete.");
    } catch (err) {
      console.error("UPLOAD ERROR (outer):", err);
      alert(`Upload failed: ${err?.message || err}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div
        style={{
          width: "100vw",
          backgroundColor: "#09713c",
          color: "white",
          height: "64px",
          display: "flex",
          alignItems: "center",
          position: "relative",
          zIndex: 1000,
          justifyContent: "space-between",
          padding: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            minWidth: 0,
            paddingLeft: "2rem",
            height: "300%",
          }}
        >
          <Link
            to="/dashboard"
            style={{ display: "flex", alignItems: "center", height: "100%" }}
          >
            <img
              src={`${import.meta.env.BASE_URL}Enviroshake_logo/Enviroshake_white_logo.png`}
              alt="Enviroshake Logo"
              style={{
                maxHeight: "100%",
                height: "100%",
                width: "auto",
                display: "block",
              }}
            />
          </Link>
        </div>

        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontWeight: "bold",
            fontSize: "1.45rem",
            letterSpacing: ".01em",
            whiteSpace: "nowrap",
          }}
        >
          Upload Images
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: "2rem",
            height: "100%",
          }}
        >
          <button
            onClick={() => auth.signOut()}
            style={{
              background: "white",
              color: "#09713c",
              border: "none",
              padding: "0.33rem 1rem",
              borderRadius: "8px",
              fontWeight: "bold",
              fontSize: "1.01rem",
              boxShadow: "none",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: "20px",
          padding: "2rem 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minHeight: "80vh",
          background: "#fafcfa",
        }}
      >
        <form
          onSubmit={handleUpload}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            width: "100%",
            maxWidth: "480px",
            background: dragOver ? "#f4faf5" : "#fff",
            border: dragOver ? "2px dashed #09713c" : "1px solid #e3e3e3",
            borderRadius: "12px",
            padding: "2.3rem 2rem 2rem 2rem",
            boxShadow: "0 4px 20px 0 rgba(30,36,56,0.15)",
          }}
        >
          <h3
            style={{
              textAlign: "center",
              marginBottom: "2rem",
              color: "#09713c",
              fontWeight: "bold",
            }}
          >
            Upload a New Image
          </h3>
          <div style={{ marginBottom: "1.0rem" }}>
            <label style={{ fontWeight: 600, display: "block" }}>
              Choose image(s):<span style={{ color: "#e42" }}>*</span>
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: "inline-block", marginTop: 7 }}
              required
            />
            {/* Internal Only Checkbox */}
            <div
              style={{ marginTop: 8, display: "flex", alignItems: "center" }}
            >
              <input
                type="checkbox"
                id="internalOnly"
                checked={internalOnly}
                onChange={(e) => setInternalOnly(e.target.checked)}
                style={{ marginRight: 8, width: 16, height: 16 }}
              />
              <label
                htmlFor="internalOnly"
                style={{ fontSize: "1em", color: "#973c3c" }}
              >
                Internal Use Only – Not for Marketing
              </label>
            </div>
          </div>

          {/* Project Name */}
          <div style={{ marginBottom: "1.15rem" }}>
            <div className="floating-label">
              <input
                id="projectName"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder=" "
                required
              />
              <label htmlFor="projectName" style={{ fontWeight: 600 }}>
                Project Name:
                <span style={{ color: "#e42" }}>*</span>
              </label>
            </div>
          </div>

          {/* Name Preview */}
          <div
            style={{
              marginBottom: "1.5rem",
              fontWeight: 500,
              fontSize: "1.07rem",
              background: "#f4faf5",
              borderRadius: 6,
              border: "1px solid #e0e0e0",
              padding: "0.6rem 1rem",
              color: "#09713c",
            }}
          >
            Name Preview:&nbsp;
            <span style={{ letterSpacing: "0.01em" }}>{namePreview}</span>
            {selectedFiles.length > 1 && (
              <span
                style={{
                  color: "#555",
                  fontSize: "0.95em",
                  marginLeft: "10px",
                }}
              >
                ({selectedFiles.length} images will be named ..._001, ..._002,
                ...)
              </span>
            )}
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ fontWeight: 600 }}>
              Product Line:<span style={{ color: "#e42" }}>*</span>
            </label>
            <Select
              placeholder="Choose product line..."
              options={OPTIONS.productLines.map((p) => ({
                label: p,
                value: p,
              }))}
              value={productLine}
              onChange={setProductLine}
              isClearable={false}
            />
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ fontWeight: 600 }}>
              Color Tags:<span style={{ color: "#e42" }}>*</span>
            </label>
            <CreatableSelect
              isMulti
              placeholder="Choose colors..."
              options={COLOR_OPTIONS.map((color) => ({
                label: color,
                value: color,
              }))}
              value={selectedColors}
              onChange={setSelectedColors}
              isClearable={false}
            />
          </div>

          <div style={{ marginBottom: "1.1rem" }}>
            <label style={{ fontWeight: 600 }}>
              Roof Tags:{" "}
              <span style={{ color: "#999", fontWeight: 400 }}>(optional)</span>
            </label>
            <CreatableSelect
              isMulti
              placeholder="Select roof features..."
              options={OPTIONS.roofTags.map((t) => ({ label: t, value: t }))}
              value={roofTags}
              onChange={setRoofTags}
            />
          </div>

          <div style={{ marginBottom: "1.1rem" }}>
            <label style={{ fontWeight: 600 }}>
              Project Tags:{" "}
              <span style={{ color: "#999", fontWeight: 400 }}>(optional)</span>
            </label>
            <CreatableSelect
              isMulti
              placeholder="Select project types..."
              options={OPTIONS.projectTypes.map((t) => ({
                label: t,
                value: t,
              }))}
              value={projectTags}
              onChange={setProjectTags}
            />
          </div>

          <div style={{ marginBottom: "1.1rem" }}>
            <label style={{ fontWeight: 600 }}>
              Country Tags:{" "}
              <span style={{ color: "#999", fontWeight: 400 }}>(optional)</span>
            </label>
            <CreatableSelect
              isMulti
              placeholder="Select countries..."
              options={OPTIONS.countries.map((c) => ({ label: c, value: c }))}
              value={countryTags}
              onChange={setCountryTags}
            />
          </div>

          <div style={{ marginBottom: "1.2rem" }}>
            <div className="floating-label">
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder=" "
              />
              <label htmlFor="notes" style={{ fontWeight: 600 }}>
                Notes{" "}
                <span style={{ color: "#999", fontWeight: 400 }}>
                  (optional):
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading}
            style={{
              width: "100%",
              padding: "0.65rem",
              backgroundColor: uploading ? "#ccc" : "#09713c",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              fontSize: "1.11rem",
              cursor: uploading ? "not-allowed" : "pointer",
              boxShadow: uploading ? "none" : "0 2px 7px 0 rgba(30,36,56,0.09)",
              marginTop: "0.5rem",
            }}
          >
            {uploading ? "Uploading..." : "Upload Image"}
          </button>

          {message && (
            <div
              style={{
                marginTop: "1.25rem",
                color: "#09713c",
                textAlign: "center",
                fontWeight: 500,
              }}
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </>
  );
}
