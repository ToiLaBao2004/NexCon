import { useFriendStore } from "@/stores/useFriendStore";
import { Users, UserX, MessageSquare, UserPlus } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import FriendsTab from "@/components/people/FriendsTab";
import RequestsTab from "@/components/people/RequestsTab";
import GroupsTab from "@/components/people/GroupsTab";
import BlockedTab from "@/components/people/BlockedTab";
import UserSearch from "@/components/shared/UserSearch";

const PeoplePage = () => {
	const {
		friends,
		incomingRequests,
		sentRequests,
		fetchIncomingRequests,
		fetchSentRequests,
		fetchFriends,
		acceptFriendRequest,
		rejectFriendRequest,
		cancelFriendRequest,
		unfriendUser,
	} = useFriendStore();

	const { onlineUsers } = useSocketStore();
	const { conversations, fetchConversations, setActiveConversation, fetchMessages } = useChatStore();
	const [processingId, setProcessingId] = useState<string | null>(null);
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const initialTab = searchParams.get("tab") as 'friends' | 'requests' | 'groups' | 'blocked' || 'friends';
	const [tab, setTab] = useState<'friends' | 'requests' | 'groups' | 'blocked'>(initialTab);

	useEffect(() => {
		fetchFriends();
		fetchIncomingRequests();
		fetchSentRequests();
	}, []);

	useEffect(() => {
		const urlTab = searchParams.get("tab") as any;
		if (urlTab && ['friends', 'requests', 'groups', 'blocked'].includes(urlTab)) {
			setTab(urlTab);
		}
	}, [searchParams]);

	const handleTabChange = (newTab: 'friends' | 'requests' | 'groups' | 'blocked') => {
		setTab(newTab);
		setSearchParams({ tab: newTab });
	};

	const handleOpenChat = async (friend: any) => {
		try {
			const existing = conversations.find((c: any) => c.type === 'direct' && c.participants.some((p: any) => p.userId?._id === friend.friendId));
			if (existing) {
				setActiveConversation(existing._id);
				if (fetchMessages) {
					try { await fetchMessages(existing._id); } catch (e) { /* ignore */ }
				}
				navigate('/chat');
				return;
			}
			const res = await chatService.createConversation('direct', [friend.friendId]);
			const conv = res.conversation || res;
			await fetchConversations();
			if (conv && conv._id) {
				setActiveConversation(conv._id);
				try { await fetchMessages(conv._id); } catch (e) { /* ignore */ }
			}
			navigate('/chat');
		} catch (error) {
			console.error('Open chat error', error);
		}
	};

	return (
		<div className="flex-1 h-full flex flex-col bg-card/20 rounded-2xl shadow-soft border border-border/40 overflow-hidden">
			<div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm">
				<div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
					<Users className="h-5 w-5 text-primary" />
				</div>
				<div>
					<h1 className="text-lg font-bold text-foreground">Bạn bè</h1>
					<p className="text-xs text-muted-foreground">
						{friends.length > 0 ? `${friends.length} bạn bè` : 'Chưa có bạn bè nào'}
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-hidden flex">
				<aside className="w-64 border-r border-border/40 bg-card/10 p-4">
					<div className="space-y-2">
						<button onClick={() => handleTabChange('friends')} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 ${tab === 'friends' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/30'}`}>
							<Users className="h-4 w-4" />
							Danh sách bạn bè
						</button>
						<button onClick={() => handleTabChange('requests')} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 ${tab === 'requests' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/30'}`}>
							<UserPlus className="h-4 w-4" />
							<span className="flex-1">Lời mời kết bạn</span>
							{incomingRequests.length > 0 && (
								<span className="ml-auto text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{incomingRequests.length}</span>
							)}
						</button>
						<button onClick={() => handleTabChange('groups')} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 ${tab === 'groups' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/30'}`}>
							<MessageSquare className="h-4 w-4" />
							Quản lý nhóm
						</button>
						<button onClick={() => handleTabChange('blocked')} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 ${tab === 'blocked' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/30'}`}>
							<UserX className="h-4 w-4" />
							Danh sách bị chặn
						</button>
					</div>
				</aside>

				<main className="flex-1 overflow-y-auto">
					<UserSearch className="p-4" />

					<div className="p-4">
						{tab === 'friends' && (
							<FriendsTab
								friends={friends}
								onlineUsers={onlineUsers}
								onOpenChat={handleOpenChat}
								onUnfriend={unfriendUser}
							/>
						)}

						{tab === 'requests' && (
							<RequestsTab
								sentRequests={sentRequests}
								incomingRequests={incomingRequests}
								processingId={processingId}
								onCancel={async (id: string) => { try { setProcessingId(id); await cancelFriendRequest(id); } catch { } finally { setProcessingId(null); } }}
								onAccept={async (id: string) => { try { setProcessingId(id); await acceptFriendRequest(id); } catch { } finally { setProcessingId(null); } }}
								onReject={async (id: string) => { try { setProcessingId(id); await rejectFriendRequest(id); } catch { } finally { setProcessingId(null); } }}
							/>
						)}

						{tab === 'groups' && <GroupsTab />}

						{tab === 'blocked' && <BlockedTab />}
					</div>
				</main>
			</div>
		</div>
	);
};

export default PeoplePage;