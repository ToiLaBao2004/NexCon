import { useFriendStore } from "@/stores/useFriendStore";
import { MessageSquare, Sparkles, UserPlus, Users, UserX } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useState, useEffect, type ElementType, type CSSProperties } from "react";
import { useSearchParams } from "react-router";
import { useChatStore } from "@/stores/useChatStore";
import FriendsTab from "@/components/people/FriendsTab";
import RequestsTab from "@/components/people/RequestsTab";
import GroupsTab from "@/components/people/GroupsTab";
import BlockedTab from "@/components/people/BlockedTab";
import SuggestionsTab from "@/components/people/SuggestionsTab";
import UserSearch from "@/components/shared/UserSearch";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { FriendSuggestion } from "@/types/user";

type PeopleTabKey = "friends" | "suggestions" | "requests" | "groups" | "blocked";

interface TabItem {
	key: PeopleTabKey;
	label: string;
	shortLabel: string;
	icon: ElementType;
}

const PEOPLE_TABS: TabItem[] = [
	{ key: "friends", label: "Danh sách bạn bè", shortLabel: "Bạn bè", icon: Users },
	{ key: "suggestions", label: "Gợi ý kết bạn", shortLabel: "Gợi ý", icon: Sparkles },
	{ key: "requests", label: "Lời mời kết bạn", shortLabel: "Lời mời", icon: UserPlus },
	{ key: "groups", label: "Quản lý nhóm", shortLabel: "Nhóm", icon: MessageSquare },
	{ key: "blocked", label: "Danh sách bị chặn", shortLabel: "Bị chặn", icon: UserX },
];

const PeoplePage = () => {
	const {
		friends,
		friendSuggestions,
		fetchFriendSuggestions,
		fetchingFriendSuggestions,
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
		blockedUsers,
		sendFriendRequest,
	} = useFriendStore();

	const { onlineUsers } = useSocketStore();
	const { openChat, setActiveConversation, conversations, groupConversations } = useChatStore();
	const [processingId, setProcessingId] = useState<string | null>(null);
	const [searchParams, setSearchParams] = useSearchParams();
	const rawTab = searchParams.get("tab") as PeopleTabKey | null;
	const initialTab: PeopleTabKey = rawTab && PEOPLE_TABS.some((item) => item.key === rawTab) ? rawTab : "friends";
	const [tab, setTab] = useState<PeopleTabKey>(initialTab);
	const [showChat, setShowChat] = useState(false);
	const isMobile = useIsMobile();

	useEffect(() => {
		fetchFriends();
		fetchIncomingRequests();
		fetchSentRequests();
	}, [fetchFriends, fetchIncomingRequests, fetchSentRequests]);

	useEffect(() => {
		if (tab === "blocked") {
			fetchBlockedList();
		}
		if (tab === "suggestions") {
			fetchFriendSuggestions();
		}
	}, [tab, fetchBlockedList, fetchFriendSuggestions]);

	useEffect(() => {
		const urlTab = searchParams.get("tab") as PeopleTabKey | null;
		if (urlTab && PEOPLE_TABS.some((item) => item.key === urlTab)) {
			setTab(urlTab);
		}
	}, [searchParams]);

	const handleTabChange = (newTab: PeopleTabKey) => {
		setTab(newTab);
		setShowChat(false);
		setActiveConversation(null);
		setSearchParams({ tab: newTab });
	};

	const handleOpenChat = async (friend: any) => {
		const friendId = friend.friendId || friend._id;
		await openChat({ userId: friendId });
		setShowChat(true);
	};

	const handleOpenGroupChat = () => {
		setShowChat(true);
	};

	const handleSendSuggestionRequest = async (suggestion: FriendSuggestion) => {
		await sendFriendRequest({ userId: suggestion._id, email: suggestion.email });
		await fetchSentRequests(true);
		await fetchFriendSuggestions(true);
	};

	const getTabBadge = (key: PeopleTabKey): number => {
		if (key === "requests") return incomingRequests.length;
		return 0;
	};

	const headerConfig: Record<PeopleTabKey, { title: string; count: number }> = {
		friends: {
			title: "Bạn bè",
			count: friends.length,
		},
		suggestions: {
			title: "Gợi ý kết bạn",
			count: friendSuggestions.length,
		},
		requests: {
			title: "Lời mời kết bạn",
			count: incomingRequests.length + sentRequests.length,
		},
		groups: {
			title: "Quản lý nhóm",
			count: groupConversations.length || conversations.filter((c) => c.type === "group").length,
		},
		blocked: {
			title: "Danh sách bị chặn",
			count: blockedUsers.length,
		},
	};

	const header = headerConfig[tab];

	return (
		<SidebarProvider
			style={{ "--sidebar-width": "340px" } as CSSProperties}
			className={`h-full min-h-0 w-full relative ${isMobile ? "flex flex-col" : "flex"}`}
		>
			{!isMobile && (
				<aside className="hidden h-full w-[340px] shrink-0 flex-col overflow-hidden border-y border-r border-l-0 border-border/50 bg-card md:flex">
					<div className="space-y-1.5 p-5">
						{PEOPLE_TABS.map((item) => {
							const Icon = item.icon;
							const badge = getTabBadge(item.key);

							return (
								<button
									key={item.key}
									onClick={() => handleTabChange(item.key)}
									className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center gap-3.5 transition-all duration-200 ${tab === item.key ? "bg-background text-foreground shadow-sm font-semibold" : "text-foreground hover:bg-muted/60"}`}
								>
									<Icon className={`h-5 w-5 transition-colors ${tab === item.key ? "text-primary" : "text-foreground"}`} strokeWidth={1.65} />
									<span className="flex-1 text-[15px]">{item.label}</span>
									{badge > 0 && (
										<span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">{badge}</span>
									)}
								</button>
							);
						})}
					</div>
				</aside>
			)}

			<main className="flex h-full min-h-0 flex-1 min-w-0 flex-col overflow-hidden border-0 bg-card shadow-none md:rounded-l-none md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
				{showChat ? (
					<div className="h-full flex-1 min-h-0 flex flex-col">
						<ChatWindowLayout />
					</div>
				) : (
					<div className="flex h-full min-h-0 flex-col overflow-hidden">
						{isMobile && (
							<div className="sticky top-0 z-20 px-4 pt-4 pb-3 bg-card border-b border-border/40">
								<h1 className="text-[28px] leading-none font-bold tracking-tight text-primary">NexCon</h1>
							</div>
						)}

						{tab !== 'groups' && (
							<UserSearch
								className="shrink-0 bg-card/95 px-5 pb-3 pt-5 backdrop-blur-md"
								onOpenChat={handleOpenChat}
							/>
						)}

						{tab !== 'groups' && (
							<div className="shrink-0 bg-card/95 px-5 pb-3 pt-1 md:px-7">
								<h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
									{header.title} ({header.count})
								</h2>
								<div className="mt-3 border-b border-border/40" />
							</div>
						)}

						<div className={`flex-1 min-h-0 overflow-x-hidden overscroll-contain ${tab === "requests" ? "overflow-hidden" : "overflow-y-auto beautiful-scrollbar"}`}>
							<div className={tab === "requests" ? "h-full min-h-0 p-4 md:p-5" : tab === "groups" ? "h-full min-h-0" : "h-full min-h-0 p-5"}>
								{tab === 'friends' && (
									<FriendsTab
										friends={friends}
										onlineUsers={onlineUsers}
										onOpenChat={handleOpenChat}
										onUnfriend={unfriendUser}
									/>
								)}

								{tab === 'suggestions' && (
									<SuggestionsTab
										suggestions={friendSuggestions}
										loading={fetchingFriendSuggestions}
										onRefresh={() => fetchFriendSuggestions(true)}
										onSendRequest={handleSendSuggestionRequest}
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

								{tab === 'groups' && (
									<GroupsTab
										title={header.title}
										count={header.count}
										onOpenGroup={handleOpenGroupChat}
									/>
								)}

								{tab === 'blocked' && <BlockedTab />}
							</div>
						</div>

						{isMobile && (
							<div className="shrink-0 border-t border-border/40 bg-card/95 backdrop-blur-md">
								<div className="grid grid-cols-5 gap-1.5 p-2">
									{PEOPLE_TABS.map((item) => {
										const Icon = item.icon;
										const badge = getTabBadge(item.key);
										const isActive = tab === item.key;

										return (
											<button
												key={item.key}
												onClick={() => handleTabChange(item.key)}
												className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10.5px] transition-colors ${isActive ? "bg-primary/15 text-primary font-semibold" : "text-foreground/75 hover:bg-muted/50 hover:text-foreground"}`}
											>
												<Icon className="h-5 w-5" strokeWidth={isActive ? 1.85 : 1.65} />
												<span>{item.shortLabel}</span>
												{badge > 0 && <span className="absolute top-1 right-3 text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">{badge}</span>}
											</button>
										);
									})}
								</div>
							</div>
						)}
					</div>
				)}
			</main>
		</SidebarProvider>
	);
};

export default PeoplePage;
