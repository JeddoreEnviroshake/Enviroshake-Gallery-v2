import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";

function LogoutButton() {
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      style={{
        position: "absolute",
        top: "20px",
        right: "20px",
        padding: "8px 12px",
        cursor: "pointer"
      }}
    >
      Logout
    </button>
  );
}

export default LogoutButton;
