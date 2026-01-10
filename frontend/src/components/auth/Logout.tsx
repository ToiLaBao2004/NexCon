import { Button } from "../ui/button";
import { useAuthStore } from "@/stores/useAuthStore"
import { useNavigate } from "react-router";

const Logout = () => {
	const { signOut } = useAuthStore();
	const navigate = useNavigate();
	const handleLogout = async () => {
		try {
			await signOut();
			navigate("/signin")
		} catch (error: any) {
			console.error("Log out failed:", error);
		}
	}
  return (
		<div>
			<Button onClick={handleLogout}>
				Logout
			</Button>
		</div>
  );
}

export default Logout;