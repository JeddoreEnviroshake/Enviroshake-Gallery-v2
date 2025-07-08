// src/components/ImageUpload.jsx

import { useState, useEffect } from "react";
import { collection, addDoc, Timestamp, doc, setDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import Select from "react-select";
import makeAnimated from "react-select/animated";
import CreatableSelect from "react-select/creatable";

const animatedComponents = makeAnimated();

const TAG_OPTIONS = {
  roofStyles: ["Gable", "Gambrel", "Hip", "Mansard", "Siding"],
  roofDetails: [
    "Dormer", "Eyebrow", "Flared Rake", "Mansard", "Rake Metal", "Skylight",
    "Snow Guards", "Solar Panels", "Staggered Coursing", "Steeple",
    "Straight Coursing", "Turret", "valleys"
  ],
  projectTypes: [
    "Barn", "Clubhouse", "Commercial", "Education", "Gazebo", "Historic", "HOA",
    "Hospitality", "Multifamily", "National Monument",
    "National Register of Historic Sites", "Religious", "Residential", "Retail"
  ],
  countries: ["Canada", "USA", "Caribbean", "Other"]
};

const COLORS = {
  Enviroshake: {
    Standard: ["Silvered Cedar", "Aged Cedar", "Tropical Silver", "Multi-Tone", "Silvered Cedar Staggered", "Aged Cedar Staggered"],
    Custom: ["Ruby Red", "Terra Cotta", "Onyx Black", "Wonderland Brown", "Disney Brown", "Philippine Brown", "Bermuda White", "Weathered Teak"]
  },
  Enviroshingle: {
    Standard: ["Charcoal Grey", "Stone Grey", "Onyx Black", "Plum Purple", "Sage Green", "Tropical Cool", "Multi-Tone CS", "Multi-Tone CSO", "Multi-Tone SCPG", "Multi-Tone SPG", "Multi-Tone SP", "Silvered Cedar", "Aged Cedar", "Tropical Silver"],
    Custom: ["Bermuda White", "Terra Cotta"]
  },
  EnviroSlate: {
    Standard: ["Charcoal Grey", "Stone Grey", "Onyx Black", "Plum Purple", "Sage Green", "Tropical Cool", "Multi-Tone CS", "Multi-Tone CSO", "Multi-Tone SCPG", "Multi-Tone SPG", "Multi-Tone SP"],
    Custom: ["Bermuda White", "Terra Cotta"]
  }
};

export default function ImageUpload() {
  const [imageFiles, setImageFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [productLine, setProductLine] = useState("Enviroshake");
  const [selectedColors, setSelectedColors] = useState([]);
  const [roofTags, setRoofTags] = useState([]);
  const [projectTags, setProjectTags] = useState([]);
  const [countryTags, setCountryTags] = useState([]);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const urls = imageFiles.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [imageFiles]);

  const getColorOptions = () => {
    const options = [];
    Object.entries(COLORS[productLine]).forEach(([type, names]) => {
      names.forEach(name => {
        options.push({ label: `${name} (${type})`, value: name });
      });
    });
    return options;
  };

  const handleUpload = async () => {
    if (imageFiles.length === 0) return alert("Please select at least one image");

    const isGrouped = groupName.trim() !== "";
    const groupId = isGrouped ? groupName.trim() : null;

    try {
      setUploading(true);
      const uploader = (auth.currentUser?.email || "unknown").toLowerCase();
      const timestamp = Timestamp.now();

      // Save group metadata if groupName was provided
      if (isGrouped) {
        await setDoc(doc(db, "imageGroups", groupId), {
          groupId,
          groupName,
          productLine,
          colors: selectedColors.map(c => c.value),
          roofTags: roofTags.map(t => t.value),
          projectTags: projectTags.map(t => t.value),
          countryTags: countryTags.map(t => t.value),
          notes,
          uploadedBy: uploader,
          timestamp
        });
      }

      for (let file of imageFiles) {
        const res = await fetch("http://localhost:4000/generate-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType: file.type })
        });

        const { uploadURL, key } = await res.json();

        await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file
        });

        // Save image metadata
        await addDoc(collection(db, "images"), {
          s3Key: key,
          groupId: isGrouped ? groupId : null,
          uploadedBy: uploader,
          timestamp,
          ...(isGrouped
            ? {} // skip repeating metadata
            : {
                productLine,
                colors: selectedColors.map(c => c.value),
                roofTags: roofTags.map(t => t.value),
                projectTags: projectTags.map(t => t.value),
                countryTags: countryTags.map(t => t.value),
                notes
              })
        });
      }

      alert("Upload successful!");
      setImageFiles([]);
      setGroupName("");
      setSelectedColors([]);
      setRoofTags([]);
      setProjectTags([]);
      setCountryTags([]);
      setNotes("");
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Upload Images</h2>

      <input
        type="file"
        accept="image/*"
        multiple
        onChange={e => setImageFiles([...e.target.files])}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem" }}>
        {previews.map((url, i) => (
          <img key={i} src={url} alt={`Preview ${i}`} style={{ width: "150px" }} />
        ))}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Group Name (optional – leave blank for single image upload):</label>
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g. Jobsite - May 2025"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Product Line:</label>
        <select value={productLine} onChange={e => setProductLine(e.target.value)}>
          <option value="Enviroshake">Enviroshake</option>
          <option value="Enviroshingle">Enviroshingle</option>
          <option value="EnviroSlate">EnviroSlate</option>
        </select>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Colors:</label>
        <Select
          isMulti
          options={getColorOptions()}
          components={animatedComponents}
          value={selectedColors}
          onChange={setSelectedColors}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Roof Tags:</label>
        <CreatableSelect
          isMulti
          options={TAG_OPTIONS.roofStyles.concat(TAG_OPTIONS.roofDetails).map(t => ({ label: t, value: t }))}
          components={animatedComponents}
          value={roofTags}
          onChange={setRoofTags}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Project Type:</label>
        <CreatableSelect
          isMulti
          options={TAG_OPTIONS.projectTypes.map(t => ({ label: t, value: t }))}
          components={animatedComponents}
          value={projectTags}
          onChange={setProjectTags}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Country:</label>
        <Select
          isMulti
          options={TAG_OPTIONS.countries.map(c => ({ label: c, value: c }))}
          components={animatedComponents}
          value={countryTags}
          onChange={setCountryTags}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label>Notes:</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading}
        style={{ marginTop: "1rem", padding: "0.75rem 1.5rem" }}
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>
    </div>
  );
}
