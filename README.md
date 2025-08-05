# Enviroshake-Gallery

A web-based internal image gallery built for the Enviroshake team to upload, manage, group, and filter roofing product photos. Supports image tagging, group-based organization, and secure file storage using AWS S3 and Firebase.

---

## 🚀 Features

- 🖼️ Upload and group multiple images at once
- 🏷️ Tag images with product line, colors, roof styles, and project types
- 🔍 Filter gallery by tag, group name, or uploader
- 🧾 Group-level notes and metadata
- 📦 Download individual images or entire groups as ZIP
- 🔐 Authenticated uploads via Firebase
- ☁️ Image storage with AWS S3
- 📄 Metadata stored in Firestore (`imageGroups`, `images`)

---

## 📦 Tech Stack

| Frontend | Backend     | Storage/Auth       |
|----------|-------------|--------------------|
| React + Vite | Node.js + Express | Firebase Auth & Firestore |
| Swiper.js (gallery) | AWS SDK v3 | AWS S3 |

---

## ⚙️ Setup Instructions

### 🔧 Backend

```bash
cd Backend
npm install
