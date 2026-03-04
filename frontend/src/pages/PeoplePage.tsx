import { useFriendStore } from "@/stores/useFriendStore";
import { Users, UserX, MessageSquare, UserPlus } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useState, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router";
import { useChatStore } from "@/stores/useChatStore";
import FriendsTab from "@/components/people/FriendsTab";
import RequestsTab from "@/components/people/RequestsTab";
import GroupsTab from "@/components/people/GroupsTab";
import BlockedTab from "@/components/people/BlockedTab";
import UserSearch from "@/components/shared/UserSearch";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";

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
	const { openChat, activeConversationId, setActiveConversation } = useChatStore();
	const [processingId, setProcessingId] = useState<string | null>(null);
	const [searchParams, setSearchParams] = useSearchParams();
	const initialTab = searchParams.get("tab") as 'friends' | 'requests' | 'groups' | 'blocked' || 'friends';
	const [tab, setTab] = useState<'friends' | 'requests' | 'groups' | 'blocked'>(initialTab);
	const [showChat, setShowChat] = useState(false);
	const location = useLocation();

	useEffect(() => {
		fetchFriends();
		fetchIncomingRequests();
		fetchSentRequests();
	}, []);

	useEffect(() => {
		setActiveConversation(null);
	}, [location.key, setActiveConversation]);

	useEffect(() => {
		if (activeConversationId) {
			setShowChat(true);
		} else {
			setShowChat(false);
		}
	}, [activeConversationId]);

	useEffect(() => {
		const urlTab = searchParams.get("tab") as any;
		if (urlTab && ['friends', 'requests', 'groups', 'blocked'].includes(urlTab)) {
			setTab(urlTab);
		}
	}, [searchParams]);

	const handleTabChange = (newTab: 'friends' | 'requests' | 'groups' | 'blocked') => {
		setTab(newTab);
		setActiveConversation(null);
		setSearchParams({ tab: newTab });
	};

	const handleOpenChat = async (friend: any) => {
		const friendId = friend.friendId || friend._id;
		await openChat({ userId: friendId });
	};

	const getHeaderContent = () => {
		const config = {
			friends: {
				title: "Bạn bè",
				icon: <Users className="h-5 w-5 text-primary" />,
				desc: friends.length > 0 ? `${friends.length} bạn bè` : 'Chưa có bạn bè nào'
			},
			requests: {
				title: "Lời mời kết bạn",
				icon: <UserPlus className="h-5 w-5 text-primary" />,
				desc: (incomingRequests.length + sentRequests.length) > 0
					? `${incomingRequests.length} lời mời đã nhận, ${sentRequests.length} đã gửi`
					: 'Không có lời mời nào'
			},
			groups: {
				title: "Quản lý nhóm",
				icon: <MessageSquare className="h-5 w-5 text-primary" />,
				desc: "Quản lý các nhóm chat"
			},
			blocked: {
				title: "Danh sách bị chặn",
				icon: <UserX className="h-5 w-5 text-primary" />,
				desc: "Người dùng bạn đã chặn"
			}
		};
		return config[tab] || config.friends;
	};

	const header = getHeaderContent();

	return (
		<SidebarProvider className="flex h-full w-full relative min-h-0" style={{ "--sidebar-width": "300px" } as React.CSSProperties}>
			<Sidebar
				collapsible="offcanvas"
				className="md:left-20 top-2 bottom-2 h-[calc(100vh-16px)] bg-card/20 backdrop-blur border border-border/40 rounded-2xl overflow-hidden"
			>
				<div className="p-4 space-y-2">
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
			</Sidebar>

			<main className="flex-1 min-w-0 bg-card rounded-2xl overflow-hidden shadow-soft border border-border/40 ml-2 h-full">
				{showChat ? (
					<div className="h-full flex-1 min-h-0 flex flex-col">
						<ChatWindowLayout />
					</div>
				) : (
					<div className="h-full overflow-y-auto">
						<div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-20 shrink-0">
							<SidebarTrigger className="-ml-1 md:hidden" />
							<div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
								{header.icon}
							</div>
							<div>
								<h1 className="text-lg font-semibold text-foreground tracking-tight">{header.title}</h1>
								<p className="text-xs text-muted-foreground">
									{header.desc}
								</p>
							</div>
						</div>

						<div className="flex flex-col">
							<UserSearch className="p-4" onOpenChat={handleOpenChat} />

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
						</div>
					</div>
				)}
			</main>
		</SidebarProvider>
	);
};

export default PeoplePage;