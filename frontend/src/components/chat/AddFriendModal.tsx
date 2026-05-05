import { useChatStore } from "@/stores/useChatStore";
import UserSearch from "../shared/UserSearch";

const AddFriendModal = () => {
  const openChat = useChatStore((s) => s.openChat);

  const handleOpenChat = async (friend: any) => {
    const friendId = friend.friendId || friend._id;
    await openChat({ userId: friendId });
  };

  return (
    <UserSearch className="shrink-0 px-2 py-3" onOpenChat={handleOpenChat} />
  );
};

export default AddFriendModal;
