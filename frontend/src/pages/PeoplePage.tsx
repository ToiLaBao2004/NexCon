import { useFriendStore } from "@/stores/useFriendStore";
import { Users, UserX, MessageSquare, UserPlus } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useState, useEffect, type ElementType, type ReactNode } from "react";
import { useSearchParams, useLocation } from "react-router";
import { useChatStore } from "@/stores/useChatStore";
import FriendsTab from "@/components/people/FriendsTab";
import RequestsTab from "@/components/people/RequestsTab";
import GroupsTab from "@/components/people/GroupsTab";
import BlockedTab from "@/components/people/BlockedTab";
import UserSearch from "@/components/shared/UserSearch";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { MOBILE_BOTTOM_NAV_HEIGHT_REM } from "@/constants/layout";

type PeopleTabKey = "friends" | "requests" | "groups" | "blocked";

interface TabItem {
	key: PeopleTabKey;
	label: string;
	shortLabel: string;
	icon: ElementType;
}

const PEOPLE_TABS: TabItem[] = [
	{ key: "friends", label: "Danh sách bạn bè", shortLabel: "Bạn bè", icon: Users },
	{ key: "requests", label: "Lời mời kết bạn", shortLabel: "Lời mời", icon: UserPlus },
	{ key: "groups", label: "Quản lý nhóm", shortLabel: "Nhóm", icon: MessageSquare },
	{ key: "blocked", label: "Danh sách bị chặn", shortLabel: "Bị chặn", icon: UserX },
];

const PeoplePage = () => {
	const {
		friends,
		incomingRequests,
		sentRequests,
		fetchIncomingRequests,
		fetchSentRequests,
		fetchFriends,
		fetchBlockedList,
		acceptFriendRequest,
		rejectFriendRequest,
		cancelFriendRequest,
		unfriendUser,
	} = useFriendStore();

	const { onlineUsers } = useSocketStore();
	const { openChat, activeConversationId, setActiveConversation, conversations } = useChatStore();
	const [processingId, setProcessingId] = useState<string | null>(null);
	const [searchParams, setSearchParams] = useSearchParams();
	const rawTab = searchParams.get("tab") as PeopleTabKey | null;
	const initialTab: PeopleTabKey = rawTab && PEOPLE_TABS.some((item) => item.key === rawTab) ? rawTab : "friends";
	const [tab, setTab] = useState<PeopleTabKey>(initialTab);
	const [showChat, setShowChat] = useState(false);
	const location = useLocation();
	const isMobile = useIsMobile();

	useEffect(() => {
		fetchFriends();
		fetchIncomingRequests();
		fetchSentRequests();
		fetchBlockedList();
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
		const urlTab = searchParams.get("tab") as PeopleTabKey | null;
		if (urlTab && PEOPLE_TABS.some((item) => item.key === urlTab)) {
			setTab(urlTab);
		}
	}, [searchParams]);

	const handleTabChange = (newTab: PeopleTabKey) => {
		setTab(newTab);
		setActiveConversation(null);
		setSearchParams({ tab: newTab });
	};

	const handleOpenChat = async (friend: any) => {
		const friendId = friend.friendId || friend._id;
		await openChat({ userId: friendId });
	};

	const getTabBadge = (key: PeopleTabKey): number => {
		if (key === "requests") return incomingRequests.length;
		return 0;
	};

	const headerConfig: Record<PeopleTabKey, { title: string; icon: ReactNode; desc: string }> = {
		friends: {
			title: "Bạn bè",
			icon: <Users className="h-6 w-6 text-white" />,
			desc: friends.length > 0 ? `${friends.length} bạn bè` : "Chưa có bạn bè nào",
		},
		requests: {
			title: "Lời mời kết bạn",
			icon: <UserPlus className="h-6 w-6 text-white" />,
			desc:
				(incomingRequests.length + sentRequests.length) > 0
					? `${incomingRequests.length} lời mời đã nhận, ${sentRequests.length} đã gửi`
					: "Không có lời mời nào",
		},
		groups: {
			title: "Quản lý nhóm",
			icon: <MessageSquare className="h-6 w-6 text-white" />,
			desc: `${conversations.filter((c) => c.type === "group").length} nhóm`,
		},
		blocked: {
			title: "Danh sách bị chặn",
			icon: <UserX className="h-6 w-6 text-white" />,
			desc: "Người dùng bạn đã chặn",
		},
	};

	const header = headerConfig[tab];

	return (
		<SidebarProvider
			className={`h-full min-h-0! w-full relative ${isMobile ? "flex flex-col" : "flex"}`}
			style={{ "--sidebar-width": "300px" } as React.CSSProperties}
		>
			{!isMobile && (
				<Sidebar
					collapsible="offcanvas"
					className="md:left-20 top-0 md:top-2 bottom-0 md:bottom-2 h-full md:h-[calc(100vh-16px)] bg-card/60 backdrop-blur border border-border/40 rounded-none md:rounded-2xl overflow-hidden"
				>
					<div className="space-y-2 p-4">
						{PEOPLE_TABS.map((item) => {
							const Icon = item.icon;
							const badge = getTabBadge(item.key);

							return (
								<button
									key={item.key}
									onClick={() => handleTabChange(item.key)}
									className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-200 ${tab === item.key ? "bg-background text-foreground shadow-sm font-normal" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
								>
									<Icon className={`h-4 w-4 transition-colors ${tab === item.key ? "text-primary" : "text-muted-foreground"}`} />
									<span className="flex-1 text-sm">{item.label}</span>
									{badge > 0 && (
										<span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{badge}</span>
									)}
								</button>
							);
						})}
					</div>
				</Sidebar>
			)}

			<main className={`flex h-full min-h-0 flex-1 min-w-0 flex-col bg-card rounded-none md:rounded-2xl overflow-hidden shadow-soft border-0 md:border border-border/40 ${isMobile ? "" : "md:ml-2"}`}>
				{showChat ? (
					<div className="h-full flex-1 min-h-0 flex flex-col">
						<ChatWindowLayout />
					</div>
				) : (
					<div className="flex h-full min-h-0 flex-col overflow-hidden">
						{isMobile && (
							<div className="sticky top-0 z-20 px-4 pt-4 pb-3 bg-card border-b border-border/40">
								<h1 className="text-[28px] leading-none font-bold tracking-tight text-primary">NextCon</h1>
							</div>
						)}

						<div className="flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm md:sticky md:top-0 md:z-50 shrink-0">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
								{header.icon}
							</div>
							<div>
								<h1 className="text-lg font-medium text-foreground tracking-tight">{header.title}</h1>
								<p className="text-xs text-muted-foreground">
									{header.desc}
								</p>
							</div>
						</div>

						{tab !== 'groups' && (
							<UserSearch
								className="shrink-0 bg-card/95 p-4 backdrop-blur-md"
								onOpenChat={handleOpenChat}
							/>
						)}

						<div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain beautiful-scrollbar ${isMobile ? "pb-32" : ""}`}>
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
										onOpenChat={handleOpenChat}
									/>
								)}

								{tab === 'groups' && <GroupsTab />}

								{tab === 'blocked' && <BlockedTab />}
							</div>
						</div>
					</div>
				)}
			</main>

			{isMobile && !showChat && (
				<div
					className="fixed left-0 right-0 z-40 border-t border-border/40 bg-card/95 backdrop-blur-md"
					style={{ bottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM}rem + env(safe-area-inset-bottom, 0px))` }}
				>
					<div className="grid grid-cols-4 gap-1 p-2">
						{PEOPLE_TABS.map((item) => {
							const Icon = item.icon;
							const badge = getTabBadge(item.key);

							return (
								<button
									key={item.key}
									onClick={() => handleTabChange(item.key)}
									className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-[11px] transition-colors relative ${tab === item.key ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-muted/30"}`}
								>
									<Icon className="h-4 w-4" />
									<span>{item.shortLabel}</span>
									{badge > 0 && <span className="absolute top-1 right-3 text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">{badge}</span>}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</SidebarProvider>
	);
};

export default PeoplePage;
