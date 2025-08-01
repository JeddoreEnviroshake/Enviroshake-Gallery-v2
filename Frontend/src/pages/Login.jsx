import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [bgIndex, setBgIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const navigate = useNavigate();
  const fadeTimeout = useRef(null);

  const backgroundImages = [
    `${import.meta.env.BASE_URL}backgrounds/bg1.webp`,
    `${import.meta.env.BASE_URL}backgrounds/bg2.jpg`,
    `${import.meta.env.BASE_URL}backgrounds/bg3.webp`,
    `${import.meta.env.BASE_URL}backgrounds/bg4.webp`,
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      fadeTimeout.current = setTimeout(() => {
        setBgIndex((prevIndex) => (prevIndex + 1) % backgroundImages.length);
        setFade(true);
      }, 500); // matches transition
    }, 5000); // change every 5s

    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimeout.current);
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Logged in successfully!");
      setError("");
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.background,
          backgroundImage: `url(${backgroundImages[bgIndex]})`,
          opacity: fade ? 1 : 0,
          transition: "opacity 0.5s ease-in-out",
        }}
      />
      <div style={styles.overlay}>
        <div style={styles.box}>
          <img
            src={`${import.meta.env.BASE_URL}enviroshake-logo.png`}
            alt="Enviroshake Logo"
            style={styles.logo}
          />
          <h2 style={styles.heading}>Employee Login</h2>
          <form onSubmit={handleLogin} style={styles.form}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" style={styles.button}>
              Log In
            </button>
          </form>
          {error && <p style={styles.error}>{error}</p>}
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
  box: {
    backgroundColor: "#ffffff",
    padding: "2rem",
    borderRadius: "10px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    maxWidth: "400px",
    width: "100%",
    textAlign: "center",
  },
  logo: {
    width: "250px",
    marginBottom: "20px",
  },
  heading: {
    marginBottom: "20px",
    fontSize: "1.5rem",
    fontWeight: "bold",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  input: {
    padding: "0.5rem",
    fontSize: "16px",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
  button: {
    padding: "0.5rem",
    fontSize: "16px",
    backgroundColor: "#006400",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  error: {
    color: "red",
    marginTop: "1rem",
  },
};
