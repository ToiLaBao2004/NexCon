import Logout from "@/components/auth/Logout";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";

const ChatAppPage = () => {
  const user = useAuthStore(s => s.user);
  const handleOnclick = async () => {
    try {
      const response = await api.get('/users/test', { withCredentials: true });
      toast.success(`API Test Successful: ${response.status}`);
    } catch (error) {
      console.error('Error during API test:', error);
      toast.error('API Test Failed');
    }
  };
  return (
    <div>
      {user?.displayName}
      <Logout />
      <Button onClick={handleOnclick}>Test API</Button>
    </div>
  );
}

export default ChatAppPage;