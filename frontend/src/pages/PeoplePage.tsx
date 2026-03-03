import { useFriendStore } from "@/stores/useFriendStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, UserX, MessageSquare, UserPlus, X, Loader2, Search, UserMinus } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { Input } from "@/components/ui/input";
import FriendsTab from "@/components/people/FriendsTab";
import RequestsTab from "@/components/people/RequestsTab";
import GroupsTab from "@/components/people/GroupsTab";
import BlockedTab from "@/components/people/BlockedTab";

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
		sendFriendRequest,
	} = useFriendStore();

	const { onlineUsers } = useSocketStore();
	const { conversations, fetchConversations, setActiveConversation, fetchMessages } = useChatStore();
	const [processingId, setProcessingId] = useState<string | null>(null);
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const initialTab = searchParams.get("tab") as 'friends' | 'requests' | 'groups' | 'blocked' || 'friends';
	const [tab, setTab] = useState<'friends' | 'requests' | 'groups' | 'blocked'>(initialTab);

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

	// Search (copied from AddFriendModal)
	const [query, setQuery] = useState("");
	const socket = useSocketStore((s) => s.socket);
	type SearchStatus = "idle" | "searching" | "found" | "not-found" | "error" | "empty";
	const [user, setUser] = useState<any | null>(null);
	const [status, setStatus] = useState<SearchStatus>("idle");
	const [actionLoading, setActionLoading] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		fetchFriends();
		fetchIncomingRequests();
		fetchSentRequests();
	}, []);

	useEffect(() => {
		if (!socket) return;

		const handleResult = ({ user: foundUser, status: s }: { user: any | null; status: SearchStatus }) => {
			setUser(foundUser);
			setStatus(s);
		};

		socket.on("search-user-result", handleResult);

		return () => { socket.off("search-user-result", handleResult); };
	}, [socket]);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);

		if (!query.trim()) {
			setStatus("idle");
			setUser(null);
			return;
		}

		setStatus("searching");

		debounceRef.current = setTimeout(() => {
			socket?.emit("search-user", { query });
		}, 500);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, socket]);

	const handleClear = () => {
		setQuery("");
		setUser(null);
		setStatus("idle");
	};

	const pendingRequest = user ? sentRequests.find((r) => r.to._id === user._id) : null;
	const hasPendingRequest = !!pendingRequest;

	const handleSendRequest = async (e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		if (!user || actionLoading) return;
		try {
			setActionLoading(true);
			await sendFriendRequest(user.email);
			await fetchSentRequests();
		} catch {
		} finally {
			setActionLoading(false);
		}
	};

	const handleCancelRequest = async (e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		if (!pendingRequest || actionLoading) return;
		try {
			setActionLoading(true);
			await cancelFriendRequest(pendingRequest._id);
		} catch {
		} finally {
			setActionLoading(false);
		}
	};

	const renderSmallIcon = () => {
		if (actionLoading) {
			return <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />;
		}
		if (hasPendingRequest) {
			return (
				<button
					onClick={handleCancelRequest}
					className="p-1 rounded-full hover:bg-destructive/10 transition-colors shrink-0"
					title="Hủy lời mời"
				>
					<UserMinus className="h-4 w-4 text-destructive" />
				</button>
			);
		}
		return (
			<button
				onClick={handleSendRequest}
				className="p-1 rounded-full hover:bg-primary/10 transition-colors shrink-0"
				title="Gửi lời mời kết bạn"
			>
				<UserPlus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
			</button>
		);
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
					<div className="p-4 border-b border-border/40">
						<div className="relative flex-1">
							<span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
								{status === 'searching' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Search className="h-4 w-4 text-muted-foreground" />}
							</span>
							<Input
								placeholder="Tìm kiếm theo email hoặc SĐT..."
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="h-9 pl-9 pr-8 border-border/60 bg-muted/30 focus-visible:ring-primary/20 rounded-lg text-sm"
							/>
							{query && (
								<button onClick={handleClear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</div>

						{status === 'searching' && (
							<p className="text-xs text-muted-foreground mt-2 px-1 flex items-center gap-1.5 animate-pulse">
								<Loader2 className="h-3 w-3 animate-spin" />
								Đang tìm kiếm...
							</p>
						)}

						{status === 'not-found' && (
							<div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
								<UserX className="h-4 w-4 shrink-0" />
								<p className="text-xs font-medium">Không tìm thấy người dùng này.</p>
							</div>
						)}

						{status === 'error' && (
							<div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
								<X className="h-4 w-4 shrink-0" />
								<p className="text-xs font-medium">Đã có lỗi xảy ra khi tìm kiếm.</p>
							</div>
						)}

						{status === 'found' && user && (
							<div className="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-card hover:bg-muted/50 hover:border-primary/30 transition-all duration-150 animate-in fade-in slide-in-from-top-1 duration-200 group text-left cursor-pointer">
								<Avatar className="h-8 w-8 shrink-0">
									<AvatarImage src={user.avatarUrl} />
									<AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{user.displayName?.charAt(0)}</AvatarFallback>
								</Avatar>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-semibold text-foreground truncate">{user.displayName}</p>
									<p className="text-xs text-muted-foreground truncate">{user.email}</p>
								</div>
								{renderSmallIcon()}
							</div>
						)}
					</div>

					<div className="p-4">
						{tab === 'friends' && (
							<FriendsTab friends={friends} onlineUsers={onlineUsers} onOpenChat={handleOpenChat} />
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