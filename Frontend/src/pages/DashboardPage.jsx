import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../services/firebase";
import { signOut } from "firebase/auth";

export default function Dashboard() {
  const [bgIndex, setBgIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [user, setUser] = useState(null);
  const fadeTimeout = useRef(null);
  const navigate = useNavigate();

  const backgroundImages = [
    `${import.meta.env.BASE_URL}publicdashboard-backgrounds/bg1.webp`,
    `${import.meta.env.BASE_URL}publicdashboard-backgrounds/bg2.jpg`,
    `${import.meta.env.BASE_URL}publicdashboard-backgrounds/bg3.webp`,
    `${import.meta.env.BASE_URL}publicdashboard-backgrounds/bg4.webp`,
  ];

  useEffect(() => {
    setUser(auth.currentUser);

    const interval = setInterval(() => {
      setFade(false);
      fadeTimeout.current = setTimeout(() => {
        setBgIndex((prev) => (prev + 1) % backgroundImages.length);
        setFade(true);
      }, 500);
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimeout.current);
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const getFormattedName = () => {
    if (!user?.email) return "User";
    const [fullName] = user.email.split("@");
    const [first, last] = fullName.split(".");
    return `${capitalize(first)} ${capitalize(last)}`;
  };

  const capitalize = (str) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";

  return (
    <div style={styles.container}>
      {/* Background Slideshow */}
      <div
        style={{
          ...styles.background,
          backgroundImage: `url(${backgroundImages[bgIndex]})`,
          opacity: fade ? 1 : 0,
          transition: "opacity 0.5s ease-in-out",
        }}
      />

      {/* Top Navigation */}
      <div style={styles.topNav}>
        <img
          src={`${import.meta.env.BASE_URL}enviroshake-logo.png`}
          alt="Enviroshake Logo"
          style={styles.logo}
        />
        <button style={styles.logoutButton} onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div style={styles.overlay}>
        <div style={styles.content}>
          <h1 style={styles.heading}>Enviroshake Gallery</h1>
          <p style={styles.subheading}>
            {user ? `Welcome back, ${getFormattedName()}` : "Welcome"}
          </p>
          <div style={styles.buttonContainer}>
            <button
              style={styles.button}
              onClick={() => navigate("/gallery")}
              title="View your uploaded image groups"
            >
              <img
                src={`${import.meta.env.BASE_URL}icons/icon-camera.png`}
                alt="Camera"
                style={styles.icon}
              />
              Photo Gallery
            </button>
            <button
              style={styles.button}
              onClick={() => navigate("/upload")}
              title="Upload new images to your gallery"
            >
              <img
                src={`${import.meta.env.BASE_URL}icons/icon-upload.png`}
                alt="Upload"
                style={styles.icon}
              />
              Upload Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    fontFamily: "Segoe UI, sans-serif",
  },
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundSize: "cover",
    backgroundPosition: "center",
    zIndex: 0,
  },
  overlay: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    backdropFilter: "blur(4px)",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
  },
  content: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    padding: "3rem",
    borderRadius: "14px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
    textAlign: "center",
    minWidth: "300px",
    maxWidth: "500px",
  },
  heading: {
    fontSize: "2.5rem",
    fontWeight: "700",
    color: "#1a2e3b",
    marginBottom: "0.5rem",
  },
  subheading: {
    fontSize: "1rem",
    color: "#444",
    marginBottom: "2rem",
  },
  buttonContainer: {
    display: "flex",
    gap: "1rem",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  button: {
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    backgroundColor: "#09713c",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    transition: "background-color 0.3s ease",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  icon: {
    width: "20px",
    height: "20px",
  },
  logoutButton: {
    backgroundColor: "#fff",
    border: "1px solid #ccc",
    borderRadius: "6px",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontWeight: "bold",
  },
  topNav: {
    position: "absolute",
    top: "20px",
    left: "20px",
    right: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 2,
  },
  logo: {
    height: "50px",
    width: "auto",
    display: "block",
  },
};
