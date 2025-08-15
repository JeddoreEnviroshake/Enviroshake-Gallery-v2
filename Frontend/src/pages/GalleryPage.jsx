import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  getDocs,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Select from "react-select";
import { COLOR_OPTIONS } from "../Constants/colorOptions";
import { Modal } from "react-responsive-modal";
import "react-responsive-modal/styles.css";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import { FaTrashAlt, FaLock, FaDownload } from "react-icons/fa";
import { StickyNote } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import {
  generateUploadUrl,
  downloadMultipleGroups,
  imageUrlFromKey,
  uploadFileWithProgress,
} from "../services/api";
import { getFileExt } from "../utils/fileHelpers";

const OPTIONS = {
  productLines: ["Enviroshake", "Enviroshingle", "EnviroSlate"],
  roofTags: [
    "Gable",
    "Gambrel",
    "Hip",
    "Mansard",
    "Siding",
    "Dormer",
    "Eyebrow",
    "Flared Rake",
    "Rake Metal",
    "Skylight",
    "Snow Guards",
    "Solar Panels",
    "Staggered Coursing",
    "Steeple",
    "Straight Coursing",
    "Turret",
    "valleys",
  ],
  projectTypes: [
    "Barn",
    "Clubhouse",
    "Commercial",
    "Education",
    "Gazebo",
    "Historic",
    "HOA",
    "Hospitality",
    "Multifamily",
    "National Monument",
    "National Register of Historic Sites",
    "Religious",
    "Residential",
    "Retail",
  ],
  countries: ["Canada", "USA", "Caribbean", "Other"],
};

const makeOptions = (arr) => arr.map((item) => ({ label: item, value: item }));

const formatImageName = (groupName, index) =>
  `${groupName}_${String(index + 1).padStart(3, "0")}`;

function srcFromImage(img) {
  if (!img) return "";
  const key =
    img.thumbKey ||
    img.thumbnailKey ||
    img.thumbnailS3Key ||
    img.s3Key ||
    "";
  return key ? imageUrlFromKey(key) : "";
}

// Triggers a browser download using a temporary anchor element
const downloadImage = (url, filename) => {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "image.jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// Determines the download URL from image data and triggers the download
const handleDownload = (activeImg) => {
  if (!activeImg) return;
  const url = srcFromImage(activeImg);
  if (!url) return;
  downloadImage(url, activeImg.imageName || "image.jpg");
};

async function uploadFileWithProgress(file, uploadURL, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadURL);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && typeof onProgress === "function") {
        onProgress((e.loaded / e.total) * 100);
      }
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    xhr.send(file);
  });
}


export default function GalleryPage() {
  const [images, setImages] = useState([]);
  const [groups, setGroups] = useState({});
  const [userEmail, setUserEmail] = useState("");
  const [productLineFilter, setProductLineFilter] = useState([]);
  const [colorFilter, setColorFilter] = useState([]);
  const [roofTagFilter, setRoofTagFilter] = useState([]);
  const [projectTypeFilter, setProjectTypeFilter] = useState([]);
  const [countryFilter, setCountryFilter] = useState([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [modalIndex, setModalIndex] = useState(0);
  const [mainSwiper, setMainSwiper] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const [editDraft, setEditDraft] = useState({
    name: "",
    productLine: "",
    colors: [],
    roofTags: [],
    projectTags: [],
    countryTags: [],
  });
  const [editSaving, setEditSaving] = useState(false);

  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Notes popup state
  const [showNotesPopup, setShowNotesPopup] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesEditMode, setNotesEditMode] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  const addInputRef = useRef(null);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  const pageSize = 20;
  // eslint-disable-next-line no-unused-vars

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user?.email) setUserEmail(user.email.toLowerCase());
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, "images"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const imageData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setImages(imageData);
      const groupIds = [
        ...new Set(imageData.map((img) => img.groupId).filter(Boolean)),
      ];
      const groupDocs = await getDocs(collection(db, "imageGroups"));
      const groupMap = {};
      groupDocs.forEach((doc) => {
        const data = doc.data();
        if (groupIds.includes(data.groupId)) {
          groupMap[data.groupId] = { ...data, docId: doc.id };
        }
      });
      setGroups(groupMap);
    });
    return () => unsubscribe();
  }, [userEmail]);

  useEffect(() => {
    setShowNotesPopup(false);
    setNotesEditMode(false);
    setNotesSaving(false);
  }, [modalOpen, modalImage, modalIndex]);

  useEffect(() => {
    if (!modalOpen && addInputRef.current) {
      addInputRef.current.value = "";
    }
  }, [modalOpen]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const handleOpenNotesPopup = () => {
    let img =
      modalImage.groupImages && modalImage.groupImages.length
        ? modalImage.groupImages[modalIndex]
        : modalImage;
    setNotesDraft(img.notes || "");
    setNotesEditMode(false);
    setShowNotesPopup(true);
  };

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    let img =
      modalImage.groupImages && modalImage.groupImages.length
        ? modalImage.groupImages[modalIndex]
        : modalImage;
    try {
      await updateDoc(doc(db, "images", img.id), {
        notes: notesDraft,
      });
      img.notes = notesDraft;
      setNotesEditMode(false);
    } catch (e) {
      alert("Failed to save notes. " + e.message);
    }
    setNotesSaving(false);
  };

  const openAddPhotoDialog = () => {
    if (addingPhotos) return;
    if (addInputRef.current) {
      addInputRef.current.value = "";
      addInputRef.current.click();
    }
  };

  const addPhotosToGroup = async (files) => {
    if (!modalImage?.groupImages?.length) return;

    const first = modalImage.groupImages[0];
    const groupId = first.groupId;
    if (!groupId) {
      alert("Cannot add photos to an ungrouped image.");
      return;
    }

    const groupMeta = modalImage.groupMeta || {};

    setAddingPhotos(true);
    setShowProgress(true);
    setUploadProgress(0);

    try {
      // Determine the next numeric index based on existing names like ..._001
      let lastIdx = 0;
      modalImage.groupImages.forEach((img) => {
        const m = img.imageName && img.imageName.match(/_(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > lastIdx) lastIdx = n;
        }
      });

      for (let i = 0; i < files.length; ++i) {
        const file = files[i];
        const extension = getFileExt(file.name);
        const imgNum = String(lastIdx + i + 1).padStart(3, "0");
        const baseName = groupMeta.groupName || groupId;
        const generatedName = `${baseName}_${imgNum}`;

        // NEW: unique imageId for the backend contract
        const imageId = uuidv4();

        // NEW: call the backend with the new payload shape
        const { uploadURL, key } = await generateUploadUrl({
          groupId,
          imageId,
          fileType: file.type || "image/jpeg",
          fileName: `${generatedName}${extension}`,
          isThumbnail: false,
        });

        // Upload to the signed URL, keeping the existing progress UI
        await uploadFileWithProgress(file, uploadURL, (p) => {
          setUploadProgress(Math.round(((i + p / 100) / files.length) * 100));
        });

        // Save the Firestore image document as before
        await addDoc(collection(db, "images"), {
          groupId,
          groupName: groupMeta.groupName || groupId,
          colors: groupMeta.colors || [],
          productLine: groupMeta.productLine || "",
          roofTags: groupMeta.roofTags || [],
          projectTags: groupMeta.projectTags || [],
          countryTags: groupMeta.countryTags || [],
          notes: groupMeta.notes || "",
          projectName: groupId.split("_").slice(2).join("_") || "",
          imageName: generatedName,
          internalOnly: groupMeta.internalOnly || false,
          s3Key: key,
          uploadedBy: userEmail,
          timestamp: serverTimestamp(),
        });
      }

      // Bump group imageCount
      if (groupMeta.docId) {
        await updateDoc(doc(db, "imageGroups", groupMeta.docId), {
          imageCount:
            (groupMeta.imageCount || modalImage.groupImages.length) +
            files.length,
        });
      }
    } catch (e) {
      console.error(e);
      alert("Failed to upload image(s).");
    }

    setShowProgress(false);
    setAddingPhotos(false);
    setUploadProgress(0);
  };

  const handleAddPhotoChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addPhotosToGroup(files);
  };

  const clearAllFilters = () => {
    setProductLineFilter([]);
    setColorFilter([]);
    setRoofTagFilter([]);
    setProjectTypeFilter([]);
    setCountryFilter([]);
    setGroupFilter("");
    setSearchTerm("");
  };

  const matchesFilters = (img) => {
    const matchGroup = !groupFilter || img.groupId === groupFilter;
    const matchProductLine =
      productLineFilter.length === 0 ||
      productLineFilter.some((f) => f.value === img.productLine);
    const matchColors =
      colorFilter.length === 0 ||
      colorFilter.some((f) => img.colors?.includes(f.value));
    const matchRoof =
      roofTagFilter.length === 0 ||
      roofTagFilter.some((f) => img.roofTags?.includes(f.value));
    const matchProject =
      projectTypeFilter.length === 0 ||
      projectTypeFilter.some((f) => img.projectTags?.includes(f.value));
    const matchCountry =
      countryFilter.length === 0 ||
      countryFilter.some((f) => img.countryTags?.includes(f.value));
    let matchSearch = true;
    if (searchTerm && img.groupId) {
      const groupMeta = groups[img.groupId];
      const name = groupMeta?.groupName || img.groupId || "";
      matchSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
    } else if (searchTerm && !img.groupId) {
      matchSearch = `ungrouped-${img.id}`.includes(searchTerm.toLowerCase());
    }
    return (
      matchGroup &&
      matchProductLine &&
      matchColors &&
      matchRoof &&
      matchProject &&
      matchCountry &&
      matchSearch
    );
  };

  const filteredImages = images.filter(matchesFilters);
  const grouped = filteredImages.reduce((acc, img) => {
    const key = img.groupId || `ungrouped-${img.id}`;
    acc[key] = acc[key] || [];
    acc[key].push(img);
    return acc;
  }, {});
  const allGroupIds = Object.keys(grouped);
  const totalPages = Math.ceil(allGroupIds.length / pageSize);
  const paginatedGroupIds = allGroupIds.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Is Internal Only (supports internalOnly or doNotUse on group or image)
  const isInternalOnly = (groupMeta, firstImage) =>
    !!(
      groupMeta?.internalOnly ||
      groupMeta?.doNotUse ||
      firstImage?.internalOnly ||
      firstImage?.doNotUse
    );

  // Download handlers

  const handleDownloadGroup = async (groupId) => {
    if (!groupId) {
      alert("No group selected for download");
      return;
    }
    try {
      const res = await fetch(
        `/download-group/${encodeURIComponent(groupId)}`
      );
      if (!res.ok) throw new Error("Request failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${groupId}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download ZIP");
    }
  };

  const downloadSelected = async () => {
    if (!selectedCardIds.length || isDownloading) return;
    setIsDownloading(true);
    try {
      const blob = await downloadMultipleGroups(selectedCardIds);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Selected_Groups.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert("Failed to download ZIP");
    }
    setIsDownloading(false);
  };

  async function deleteGroupAndAllPhotos(groupId) {
    const imgs = images.filter((img) => img.groupId === groupId);
    for (let img of imgs) {
      await deleteDoc(doc(db, "images", img.id));
    }
    const groupDocId = groups[groupId]?.docId;
    if (groupDocId) await deleteDoc(doc(db, "imageGroups", groupDocId));
  }

  async function deleteSinglePhoto(photoId) {
    const img = images.find((i) => i.id === photoId);
    if (!img) return;
    await deleteDoc(doc(db, "images", img.id));
  }

  function handleDeleteGroup(groupId, count, name) {
    setDeleteTarget({ type: "group", groupId, groupName: name, count });
    setDeleteModalOpen(true);
  }
  function handleDeletePhoto(photo) {
    const groupMeta = groups[photo.groupId];
    const groupName = groupMeta?.groupName || photo.groupId || "";
    let idx = 0;
    if (photo.imageName) {
      const m = photo.imageName.match(/_(\d+)$/);
      if (m) idx = parseInt(m[1], 10) - 1;
    }
    const name = formatImageName(groupName, idx);
    setDeleteTarget({ type: "photo", photoId: photo.id, photoName: name });
    setDeleteModalOpen(true);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "group") {
      await deleteGroupAndAllPhotos(deleteTarget.groupId);
    } else if (deleteTarget.type === "photo") {
      await deleteSinglePhoto(deleteTarget.photoId);
    }
    setDeleteModalOpen(false);
    setDeleteTarget(null);
    setModalOpen(false);
  }

  const handleImageClick = (groupId, index = 0) => {
    const groupImages = grouped[groupId] || [];
    const activeImg = groupImages[index] || {};
    let activeGroupId = groupId;
    let groupMeta = groups[groupId];

    // When the folder contains only a single image and there is no
    // entry in the groups map, fall back to the image data so the
    // modal can display the group name correctly.
    if (!groupMeta && groupImages.length === 1 && activeImg.groupId) {
      activeGroupId = activeImg.groupId;
      groupMeta = { groupName: activeImg.groupName };
    }

    const modalData = { groupId: activeGroupId, groupImages, groupMeta };
    console.log("modalImage", modalData);
    setModalImage({
      ...modalData,
      groupId: activeImg.groupId,
      groupMeta: { groupName: activeImg.groupName || "" },
    });
    setModalIndex(index);
    setModalOpen(true);
  };

  const handleImageDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFullscreen(true);
  };

  const renderFullscreen = () => {
    if (!isFullscreen || !modalImage) return null;
    const isGroup =
      modalImage.groupImages && modalImage.groupImages.length > 1;
    const activeImg = isGroup
      ? modalImage.groupImages[modalIndex]
      : modalImage;
    const src = srcFromImage(activeImg);
    const overlay = (
      <div className="fullscreen-overlay">
        <img
          src={src}
          alt=""
          className="fullscreen-active"
          onDoubleClick={() => setIsFullscreen(false)}
        />
        <button
          onClick={() => setIsFullscreen(false)}
          style={{
            position: "fixed",
            top: "20px",
            right: "30px",
            fontSize: "2rem",
            background: "none",
            border: "none",
            color: "white",
            zIndex: 10000,
            cursor: "pointer",
          }}
        >
          ×
        </button>
        {isGroup && (
          <>
            <button
              onClick={() => {
                const nextIndex =
                  (modalIndex + 1) % modalImage.groupImages.length;
                setModalIndex(nextIndex);
                if (mainSwiper) mainSwiper.slideTo(nextIndex);
              }}
              style={{
                position: "fixed",
                top: "50%",
                right: "20px",
                fontSize: "2rem",
                background: "none",
                border: "none",
                color: "white",
                zIndex: 10000,
                cursor: "pointer",
                transform: "translateY(-50%)",
              }}
            >
              ›
            </button>
            <button
              onClick={() => {
                const prevIndex =
                  (modalIndex - 1 + modalImage.groupImages.length) %
                  modalImage.groupImages.length;
                setModalIndex(prevIndex);
                if (mainSwiper) mainSwiper.slideTo(prevIndex);
              }}
              style={{
                position: "fixed",
                top: "50%",
                left: "20px",
                fontSize: "2rem",
                background: "none",
                border: "none",
                color: "white",
                zIndex: 10000,
                cursor: "pointer",
                transform: "translateY(-50%)",
              }}
            >
              ‹
          </button>
        </>
      )}
      </div>
    );
    return createPortal(overlay, document.body);
  };

  // EDIT MODAL
  const openEditModal = ({ groupId, isGroup, groupMeta, firstImage }) => {
    let source = isGroup ? groupMeta : firstImage;
    setEditTarget({
      groupId,
      isGroup,
      docId: isGroup ? groupMeta.docId : firstImage.id,
    });
    setEditDraft({
      name: isGroup
        ? groupMeta.groupName || groupId
        : firstImage.imageName || "",
      productLine: source.productLine || "",
      colors: source.colors || [],
      roofTags: source.roofTags || [],
      projectTags: source.projectTags || [],
      countryTags: source.countryTags || [],
    });
    setEditModalOpen(true);
  };
  const saveEdit = async () => {
    setEditSaving(true);
    try {
      if (!editTarget) return;
      if (editTarget.isGroup) {
        await updateDoc(doc(db, "imageGroups", editTarget.docId), {
          groupName: editDraft.name,
          productLine: editDraft.productLine,
          colors: editDraft.colors,
          roofTags: editDraft.roofTags,
          projectTags: editDraft.projectTags,
          countryTags: editDraft.countryTags,
        });
      } else {
        await updateDoc(doc(db, "images", editTarget.docId), {
          imageName: editDraft.name,
          productLine: editDraft.productLine,
          colors: editDraft.colors,
          roofTags: editDraft.roofTags,
          projectTags: editDraft.projectTags,
          countryTags: editDraft.countryTags,
        });
      }
      setEditModalOpen(false);
    } catch (e) {
      alert("Failed to save. " + e.message);
    }
    setEditSaving(false);
  };

  // SELECTION
  const toggleSelectCard = (cardId) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId],
    );
  };

  const unifiedModalStyles = {
    modal: {
      padding: 0,
      background: "white",
      borderRadius: "10px",
      maxWidth: "950px",
      width: "950px"
    },
    overlay: {
      background: "rgba(0,0,0,0.5)"
    }
  };

  // ==== RENDER ====
  return (
    <>
      <style>{`
        .delete-icon {
          position: absolute;
          bottom: 10px;
          right: 14px;
          opacity: 0.25;
          transition: opacity 0.18s;
          font-size: 1.24rem;
          background: #fff;
          border-radius: 50%;
          padding: 4px;
          cursor: pointer;
          z-index: 4;
          box-shadow: 0 1px 4px #0002;
        }
        .delete-icon:hover, .card:hover .delete-icon {
          opacity: 1;
        }
        .upload-progress {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.75);
          color: white;
          padding: 8px 14px;
          border-radius: 8px;
          z-index: 2000;
          font-weight: bold;
        }
        .fullscreen-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.95);
          z-index: 9998;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .fullscreen-active {
          max-width: 100vw;
          max-height: 100vh;
          object-fit: contain;
          z-index: 9999;
          display: block;
        }
        .fullscreen-swiper .swiper-button-next,
        .fullscreen-swiper .swiper-button-prev {
          display: none !important;
        }
      `}</style>
      <input
        type="file"
        accept="image/*"
        multiple
        ref={addInputRef}
        onChange={handleAddPhotoChange}
        style={{ display: "none" }}
      />
      {showProgress && (
        <div className="upload-progress">Uploading {uploadProgress}%</div>
      )}

      {/* ====== NAV BAR ====== */}
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
          Photo Gallery
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

      {/* ====== FILTERS & SEARCH ====== */}
      <div className="filter-container">
        <div className="search-row">
          <button
            onClick={clearAllFilters}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              fontWeight: "bold",
              border: "none",
              backgroundColor: "#f3f3f3",
            }}
          >
            Clear Filters
          </button>
          <input
            type="text"
            placeholder="Search Group Name or ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="search-input"
          />
          <button
            onClick={downloadSelected}
            className={`download-btn ${
              selectedCardIds.length && !isDownloading ? "" : "disabled"
            }`}
            disabled={selectedCardIds.length === 0 || isDownloading}
          >
            {isDownloading ? "Downloading..." : "Download All"}
          </button>
        </div>

        <div className="filter-row">
          <Select
            isMulti
            placeholder="Filter by Product Line"
            options={makeOptions(OPTIONS.productLines)}
            value={productLineFilter}
            onChange={setProductLineFilter}
          />
          <Select
            isMulti
            placeholder="Filter by Colors"
            options={makeOptions(COLOR_OPTIONS)}
            value={colorFilter}
            onChange={setColorFilter}
          />
          <Select
            isMulti
            placeholder="Filter by Roof Tags"
            options={makeOptions(OPTIONS.roofTags)}
            value={roofTagFilter}
            onChange={setRoofTagFilter}
          />
        </div>
        <div className="filter-row">
          <Select
            isMulti
            placeholder="Filter by Project Type"
            options={makeOptions(OPTIONS.projectTypes)}
            value={projectTypeFilter}
            onChange={setProjectTypeFilter}
          />
          <Select
            isMulti
            placeholder="Filter by Country"
            options={makeOptions(OPTIONS.countries)}
            value={countryFilter}
            onChange={setCountryFilter}
          />
        </div>

        {/* ====== GALLERY CARDS ====== */}
        <div
          style={{
            marginTop: "2rem",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gridAutoRows: "300px",
            columnGap: "1.2rem",
            rowGap: "1.6rem",
          }}
        >
          {paginatedGroupIds.map((groupId) => {
            const groupImages = grouped[groupId];
            const firstImage = groupImages[0];
            const groupMeta = groups[groupId];
            const isGroup = groupImages.length > 1 || groupMeta;
            const internalOnly = isInternalOnly(groupMeta, firstImage);
            const groupName =
              groupMeta?.groupName ||
              (isGroup ? groupId : groupId.replace("ungrouped-", ""));
            const displayName = formatImageName(groupName, 0);
            const thumbSrc =
              srcFromImage(firstImage) ||
              `${import.meta.env.BASE_URL}Enviroshake_logo/logo-enviroshake-square.jpg`;
            return (
              <div
                key={groupId}
                className="card gallery-card fixed-height"
              >
                {/* --- Card Header: Checkbox, Download Center, Pencil Right --- */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    minHeight: 32,
                    marginBottom: 6,
                    width: "100%",
                  }}
                >
                  {/* Checkbox Left */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{
                        width: 22,
                        height: 22,
                        accentColor: "#09713c",
                        cursor: "pointer",
                      }}
                      checked={selectedCardIds.includes(groupId)}
                      onChange={() => toggleSelectCard(groupId)}
                      disabled={internalOnly}
                    />
                  </div>

                  {/* Download Center */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={() => handleDownloadGroup(groupId)}
                      className={`download-btn ${
                        internalOnly ? "disabled" : ""
                      }`}
                      style={{
                        fontSize: "0.98rem",
                        minWidth: 86,
                        maxWidth: 90,
                        padding: "0.15rem 0.7rem",
                        marginLeft: "auto",
                        marginRight: "auto",
                      }}
                    >
                      {internalOnly && (
                        <FaLock style={{ marginRight: 4, color: "#888" }} />
                      )}
                      Download
                    </button>
                  </div>

                  {/* Pencil Right */}
                  <button
                    title="Edit Name and Tags"
                    onClick={() =>
                      openEditModal({ groupId, isGroup, groupMeta, firstImage })
                    }
                    className="edit-pencil-btn"
                    style={{ justifySelf: "end" }}
                  >
                    ✏️
                  </button>
                </div>

                {/* Internal Only Row */}
                <div
                  className={`internal-banner ${
                    internalOnly ? "" : "hidden"
                  }`}
                >
                  Internal Use Only – Not for Marketing
                </div>

                {/* Main image */}
                <div className="image-wrapper">
                  <img
                    src={thumbSrc}
                    alt="Group Thumbnail"
                    className="gallery-thumbnail"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleImageClick(groupId, 0)}
                  />
                  {isGroup && groupImages.length > 1 && (
                    <span
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 14,
                        background: "#09713c",
                        color: "white",
                        fontSize: "0.82rem",
                        fontWeight: "bold",
                        borderRadius: "12px",
                        padding: "2px 10px",
                        zIndex: 2,
                      }}
                    >
                      {groupImages.length} photos
                    </span>
                  )}
                  <span
                    className="delete-icon"
                    title={isGroup ? "Delete group" : "Delete photo"}
                    onClick={() =>
                      isGroup && groupImages.length > 1
                        ? handleDeleteGroup(
                            groupId,
                            groupImages.length,
                            displayName,
                          )
                        : handleDeletePhoto(firstImage)
                    }
                  >
                    <FaTrashAlt />
                  </span>
                </div>

                {/* Name/footer */}
                <div className="gallery-name">{displayName}</div>
              </div>
            );
          })}
        </div>

        {/* ====== PAGINATION ====== */}
        <div style={{ marginTop: "2rem", textAlign: "center" }}>
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            {"<< Prev"}
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              style={{
                margin: "0 5px",
                fontWeight: page === currentPage ? "bold" : "normal",
              }}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() =>
              setCurrentPage(Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage === totalPages}
          >
            {"Next >>"}
          </button>
        </div>
      </div>

      {/* ====== MODALS ====== */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setIsFullscreen(false);
          setModalOpen(false);
        }}
        center
        classNames={{ modal: "photo-modal" }}
        styles={unifiedModalStyles}
      >
        {isFullscreen
          ? renderFullscreen()
          : modalImage &&
            modalImage.groupImages &&
            modalImage.groupImages.length ? (
          <div
            style={{
              textAlign: "center",
              padding: "1.5rem 1.5rem 0 1.5rem",
              maxWidth: 880,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.2rem" }}>
                {formatImageName(
                  modalImage?.groupMeta?.groupName || modalImage?.groupId || "",
                  modalIndex,
                )}
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "#666",
                  marginTop: 4,
                  marginBottom: 8,
                }}
              >
                {modalIndex + 1} of {modalImage.groupImages.length}
              </div>
            </div>
            <Swiper
              modules={[Navigation]}
              navigation={modalImage.groupImages.length > 1}
              onSwiper={setMainSwiper}
              initialSlide={modalIndex}
              onSlideChange={(swiper) => setModalIndex(swiper.activeIndex)}
              style={{ width: "100%", height: "380px", marginBottom: 16 }}
            >
              {modalImage.groupImages.map((img) => {
                const src = srcFromImage(img);
                return (
                  <SwiperSlide key={img.id}>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                      }}
                    >
                      <img
                        src={src}
                        alt=""
                        className="modal-main-image"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "70vh",
                          objectFit: "contain",
                          display: "block",
                          borderRadius: "10px",
                          margin: "0 auto",
                          cursor: "zoom-in",
                        }}
                        onDoubleClick={handleImageDoubleClick}
                      />
                      <span
                        className="delete-icon"
                        title="Delete photo"
                        style={{ right: 28, bottom: 20, zIndex: 100 }}
                        onClick={() => handleDeletePhoto(img)}
                      >
                        <FaTrashAlt />
                      </span>
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
            <div className="thumbnail-row">
              {modalImage.groupImages.map((img, idx) => {
                const src = srcFromImage(img);
                return (
                  <img
                    key={img.id}
                    src={src}
                    alt=""
                    className={`thumbnail${modalIndex === idx ? " selected" : ""}`}
                    onClick={() => {
                      setModalIndex(idx);
                      if (mainSwiper) mainSwiper.slideTo(idx);
                    }}
                  />
                );
              })}
              {modalImage.groupImages.length === 1 && (
                <img
                  src={`${import.meta.env.BASE_URL}Enviroshake_logo/logo-enviroshake-square.jpg`}
                  alt="Enviroshake Logo"
                  className="thumbnail"
                  style={{ cursor: "default" }}
                />
              )}
              <div
                className="thumbnail add-thumb"
                title="Add Photo"
                onClick={openAddPhotoDialog}
                style={{
                  opacity: addingPhotos ? 0.6 : 1,
                  pointerEvents: addingPhotos ? "none" : "auto",
                }}
              >
                +
              </div>
            </div>
            <div className="modal-action-row">
              <button
                onClick={openAddPhotoDialog}
                className="modal-upload-more-btn"
                title="Add Photo"
                style={{
                  opacity: addingPhotos ? 0.6 : 1,
                  pointerEvents: addingPhotos ? "none" : "auto",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>+</span> Add More Photos
              </button>
              <button
                onClick={() =>
                  modalImage.groupId
                    ? handleDownloadGroup(modalImage.groupId)
                    : handleDownload(
                        modalImage.groupImages?.[modalIndex] ?? modalImage,
                      )
                }
                disabled={
                  modalImage.groupId
                    ? false
                    : !(
                        (modalImage.groupImages?.[modalIndex]?.s3Key ||
                          modalImage.groupImages?.[modalIndex]?.s3Url ||
                          modalImage.s3Key ||
                          modalImage.s3Url)
                      )
                }
                className="modal-download-btn"
              >
                <FaDownload />
                <span>Download Image</span>
              </button>
              {/* NOTES POPUP BUTTON */}
              <button
                onClick={handleOpenNotesPopup}
                className="modal-notes-btn"
                style={{ background: showNotesPopup ? "#e8f7e4" : undefined }}
                title="View/Edit Notes"
              >
                <StickyNote size={21} />
                <span>Notes</span>
              </button>
            </div>
          </div>
        ) : modalImage ? (
          <div className="single-image-wrapper">
            {console.log("🟡 modalImage debug", modalImage)}
            <div style={{ background: "#fff", paddingTop: "1rem" }}>
              <div
                className="modal-title"
                style={{
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "1.2rem",
                  color: "#000",
                  marginBottom: "1rem",
                }}
              >
                {modalImage?.groupMeta?.groupName ||
                  modalImage?.groupId ||
                  "Untitled Group"}
              </div>
            </div>
            <div className="single-image-container">
              <img
                src={srcFromImage(
                  modalImage.groupImages?.[modalIndex] ?? modalImage,
                )}
                alt=""
                className="modal-main-image"
                style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
                onDoubleClick={handleImageDoubleClick}
              />
              <span
                className="delete-icon"
                title="Delete photo"
                style={{ right: 28, bottom: 20, zIndex: 100 }}
                onClick={() =>
                  handleDeletePhoto(
                    modalImage.groupImages ? modalImage.groupImages[modalIndex] : modalImage,
                  )
                }
              >
                <FaTrashAlt />
              </span>
            </div>

            <div className="thumbnail-row placeholder" />

            {/* Consolidated action row */}
            <div className="modal-action-row single-image-actions">
                <button
                  onClick={openAddPhotoDialog}
                  className="modal-upload-more-btn"
                  title="Add Photo"
                  style={{
                    border: "1px solid #09713c",
                    color: "#09713c",
                    background: "white",
                    padding: "0.5rem 1.2rem",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    opacity: addingPhotos ? 0.6 : 1,
                    pointerEvents: addingPhotos ? "none" : "auto",
                  }}
                >
                  <span style={{ fontSize: "1.2rem" }}>+</span> Add More Photos
                </button>
                <button
                  onClick={() =>
                    modalImage.groupId
                      ? handleDownloadGroup(modalImage.groupId)
                      : handleDownload(
                          modalImage.groupImages?.[modalIndex] ?? modalImage,
                        )
                  }
                  disabled={
                    modalImage.groupId
                      ? false
                      : !(
                          modalImage.groupImages?.[modalIndex]?.s3Key ||
                          modalImage.groupImages?.[modalIndex]?.s3Url ||
                          modalImage.s3Key ||
                          modalImage.s3Url
                        )
                  }
                  className="modal-download-btn"
                >
                  <FaDownload />
                  <span>Download Image</span>
                </button>
                <button
                  onClick={handleOpenNotesPopup}
                  className="modal-notes-btn"
                  style={{ background: showNotesPopup ? "#e8f7e4" : undefined }}
                  title="View/Edit Notes"
                >
                  <StickyNote size={21} />
                  <span>Notes</span>
                </button>
            </div>
          </div>
        ) : null}

        </Modal>

      {/* --- NOTES POPUP MODAL --- */}
      <Modal
        open={showNotesPopup}
        onClose={() => setShowNotesPopup(false)}
        center
        styles={{
          modal: {
            padding: "1.5rem 1.5rem 1rem",
            minWidth: 350,
            maxWidth: 480,
            borderRadius: 10,
          },
        }}
      >
        <div>
          <h3
            style={{
              marginTop: 0,
              marginBottom: 18,
              textAlign: "center",
              fontWeight: 700,
              fontSize: "1.1em",
            }}
          >
            Image Notes
          </h3>
          {!notesEditMode ? (
            <>
              <div
                style={{
                  background: "#f7f7f7",
                  border: "1px solid #e2e2e2",
                  borderRadius: 6,
                  padding: "12px 14px",
                  fontSize: "1.07em",
                  color: "#2e2e2e",
                  minHeight: 60,
                  marginBottom: 18,
                  whiteSpace: "pre-line",
                }}
              >
                {notesDraft ? (
                  notesDraft
                ) : (
                  <span style={{ color: "#aaa" }}>No notes yet.</span>
                )}
              </div>
              <div style={{ textAlign: "center" }}>
                <button
                  onClick={() => setNotesEditMode(true)}
                  style={{
                    fontSize: "1em",
                    background: "#fff",
                    border: "1px solid #bbb",
                    color: "#09713c",
                    borderRadius: 6,
                    padding: "7px 26px",
                    cursor: "pointer",
                    fontWeight: 600,
                    marginRight: 10,
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowNotesPopup(false)}
                  style={{
                    fontSize: "1em",
                    background: "#eee",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 26px",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={5}
                style={{
                  width: "100%",
                  border: "1.2px solid #bbb",
                  borderRadius: 6,
                  fontSize: "1rem",
                  padding: "9px",
                  minHeight: 90,
                  background: "#fff",
                  marginBottom: 13,
                }}
                placeholder="Add notes about this image..."
                autoFocus
              />
              <div style={{ textAlign: "center" }}>
                <button
                  onClick={handleSaveNotes}
                  disabled={notesSaving}
                  style={{
                    background: "#09713c",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 26px",
                    fontWeight: 700,
                    fontSize: "1em",
                    cursor: "pointer",
                    marginRight: 10,
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => setNotesEditMode(false)}
                  disabled={notesSaving}
                  style={{
                    background: "#eee",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 26px",
                    fontWeight: 500,
                    fontSize: "1em",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} center>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          {deleteTarget?.type === "group" ? (
            <>
              <div style={{ fontWeight: 400, marginBottom: 8, fontSize: "1.2rem" }}>
                Delete group <span style={{ color: "#be3131" }}>{deleteTarget.groupName}</span>?
              </div>
              <div style={{ color: "#be3131", fontWeight: 500, marginBottom: 20 }}>
                This will delete <b>all {deleteTarget.count} photos</b> in this group.
                <br />
                <b>This action cannot be undone.</b>
              </div>
              <button
                onClick={confirmDelete}
                style={{
                  background: "#be3131",
                  color: "#fff",
                  borderRadius: 6,
                  fontWeight: 700,
                  padding: "0.5rem 2rem",
                  border: "none",
                  marginRight: 12,
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteModalOpen(false)}
                style={{
                  background: "#eee",
                  borderRadius: 6,
                  fontWeight: 500,
                  padding: "0.5rem 2rem",
                  border: "none",
                }}
              >
                Cancel
              </button>
            </>
          ) : deleteTarget?.type === "photo" ? (
            <>
              <div style={{ fontWeight: 400, marginBottom: 8 }}>
                Delete photo <span style={{ color: "#be3131" }}>{deleteTarget.photoName}</span>?
              </div>
              <div style={{ color: "#be3131", fontWeight: 500, marginBottom: 20 }}>
                This cannot be undone.
              </div>
              <button
                onClick={confirmDelete}
                style={{
                  background: "#be3131",
                  color: "#fff",
                  borderRadius: 6,
                  fontWeight: 700,
                  padding: "0.5rem 2rem",
                  border: "none",
                  marginRight: 12,
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteModalOpen(false)}
                style={{
                  background: "#eee",
                  borderRadius: 6,
                  fontWeight: 500,
                  padding: "0.5rem 2rem",
                  border: "none",
                }}
              >
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        center
        styles={{
          modal: {
            padding: "2rem",
            minWidth: 350,
            maxWidth: 480,
            borderRadius: 10,
          },
        }}
      >
        <div>
          <h3
            style={{
              marginTop: 0,
              marginBottom: 18,
              textAlign: "center",
              fontWeight: 700,
              fontSize: "1.18em",
            }}
          >
            Edit Name & Tags
          </h3>
          <div style={{ marginBottom: 13 }}>
            <label style={{ fontWeight: 600 }}>Name:</label>
            <input
              type="text"
              value={editDraft.name}
              onChange={(e) =>
                setEditDraft((d) => ({ ...d, name: e.target.value }))
              }
              style={{
                marginLeft: 6,
                border: "1px solid #bbb",
                borderRadius: 4,
                fontSize: "1rem",
                padding: "3px 7px",
                width: "85%",
                marginTop: 4,
              }}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 11 }}>
            <label style={{ fontWeight: 600 }}>Product Line:</label>
            <Select
              placeholder="Product Line"
              options={makeOptions(OPTIONS.productLines)}
              value={
                editDraft.productLine
                  ? {
                      label: editDraft.productLine,
                      value: editDraft.productLine,
                    }
                  : null
              }
              onChange={(opt) =>
                setEditDraft((d) => ({
                  ...d,
                  productLine: opt ? opt.value : "",
                }))
              }
              isClearable
              styles={{ container: (base) => ({ ...base, minWidth: 190 }) }}
            />
          </div>
          <div style={{ marginBottom: 11 }}>
            <label style={{ fontWeight: 600 }}>Colors:</label>
            <Select
              isMulti
              placeholder="Colors"
              options={makeOptions(COLOR_OPTIONS)}
              value={(editDraft.colors || []).map((val) => ({
                label: val,
                value: val,
              }))}
              onChange={(opts) =>
                setEditDraft((d) => ({
                  ...d,
                  colors: opts ? opts.map((o) => o.value) : [],
                }))
              }
              styles={{ container: (base) => ({ ...base, minWidth: 190 }) }}
            />
          </div>
          <div style={{ marginBottom: 11 }}>
            <label style={{ fontWeight: 600 }}>Roof Tags:</label>
            <Select
              isMulti
              placeholder="Roof Tags"
              options={makeOptions(OPTIONS.roofTags)}
              value={(editDraft.roofTags || []).map((val) => ({
                label: val,
                value: val,
              }))}
              onChange={(opts) =>
                setEditDraft((d) => ({
                  ...d,
                  roofTags: opts ? opts.map((o) => o.value) : [],
                }))
              }
              styles={{ container: (base) => ({ ...base, minWidth: 190 }) }}
            />
          </div>
          <div style={{ marginBottom: 11 }}>
            <label style={{ fontWeight: 600 }}>Project Types:</label>
            <Select
              isMulti
              placeholder="Project Types"
              options={makeOptions(OPTIONS.projectTypes)}
              value={(editDraft.projectTags || []).map((val) => ({
                label: val,
                value: val,
              }))}
              onChange={(opts) =>
                setEditDraft((d) => ({
                  ...d,
                  projectTags: opts ? opts.map((o) => o.value) : [],
                }))
              }
              styles={{ container: (base) => ({ ...base, minWidth: 190 }) }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontWeight: 600 }}>Country:</label>
            <Select
              placeholder="Country"
              options={makeOptions(OPTIONS.countries)}
              value={
                editDraft.countryTags && editDraft.countryTags[0]
                  ? {
                      label: editDraft.countryTags[0],
                      value: editDraft.countryTags[0],
                    }
                  : null
              }
              onChange={(opt) =>
                setEditDraft((d) => ({
                  ...d,
                  countryTags: opt ? [opt.value] : [],
                }))
              }
              isClearable
              styles={{ container: (base) => ({ ...base, minWidth: 190 }) }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
            <button
              disabled={editSaving}
              onClick={saveEdit}
              style={{
                background: "#09713c",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "7px 24px",
                fontWeight: 600,
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              disabled={editSaving}
              onClick={() => setEditModalOpen(false)}
              style={{
                background: "#ddd",
                border: "none",
                borderRadius: 6,
                padding: "7px 24px",
                fontWeight: 500,
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
