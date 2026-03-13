import { MessageSquare, Video, Users, Calendar, Bell, Moon, Sun, LogOut, Settings, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { useFriendStore } from "@/stores/useFriendStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { ProfileEditDialog } from "./ProfileEditDialog";
import { SettingsDialog } from "./SettingsDialog";

const MobileBottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, signOut } = useAuthStore();
    const { isDark, toggleTheme } = useThemeStore();
    const { incomingRequests } = useFriendStore();
    const { unreadCount } = useNotificationStore();
    const { conversations, setFocusedConversation } = useChatStore();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const unreadMessagesCount = conversations.reduce((acc, convo) => {
        if (!user) return acc;
        return acc + (convo.unreadCounts?.[user._id] ?? 0);
    }, 0);

    const isPathActive = (path: string) => {
        if (path === "/chat" && (location.pathname === "/" || location.pathname === "/chat")) return true;
        return location.pathname === path;
    };

    const navItems = [
        { icon: MessageSquare, label: "Trò chuyện", path: "/chat", badge: unreadMessagesCount },
        { icon: Users, label: "Mọi người", path: "/people", badge: incomingRequests.length },
        { icon: Video, label: "Cuộc họp", path: "/meet", badge: 0 },
        { icon: Bell, label: "Thông báo", path: "/notification", badge: unreadCount },
        { icon: Calendar, label: "Lời nhắc", path: "/reminder", badge: 0 },
    ];

    const handleLogout = async () => {
        try {
            await signOut();
            navigate("/signin");
        } catch (error) {
            console.error("Đăng xuất thất bại:", error);
        }
    };

    return (
        <>
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border/40 safe-area-bottom">
                <div className="flex items-center justify-around h-14">
                {navItems.map((item) => {
                    const active = isPathActive(item.path);
                    return (
                        <button
                            key={item.path}
                            onClick={() => {
                                setFocusedConversation(null);
                                navigate(item.path);
                            }}
                            className={cn(
                                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative transition-colors",
                                active ? "text-primary" : "text-muted-foreground"
                            )}
                        >
                            <div className="relative">
                                <item.icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} />
                                {item.badge > 0 && (
                                    <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold border border-card">
                                        {item.badge > 99 ? "99+" : item.badge}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] font-medium leading-none">{item.label}</span>
                            {active && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    );
                })}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative transition-colors text-muted-foreground"
                            aria-label="Tài khoản"
                        >
                            <Avatar className="h-5 w-5 rounded-full border border-border/60">
                                <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
                                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                                    {user?.displayName?.charAt(0) || "U"}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-[10px] font-medium leading-none">Tài khoản</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 mr-1" align="end" side="top" sideOffset={8}>
                        <DropdownMenuGroup>
                            <DropdownMenuItem className="cursor-pointer py-2" onSelect={() => setIsProfileOpen(true)}>
                                <User className="mr-2 h-4 w-4" />
                                <span>Hồ sơ của tôi</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer py-2" onSelect={() => setIsSettingsOpen(true)}>
                                <Settings className="mr-2 h-4 w-4" />
                                <span>Cài đặt</span>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="cursor-pointer py-2 text-primary focus:text-primary"
                            onSelect={(e) => {
                                e.preventDefault();
                                toggleTheme();
                            }}
                        >
                            {isDark ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                            <div className="flex-1 capitalize">{isDark ? "Tối" : "Sáng"}</div>
                            <Switch checked={isDark} className="ml-2" />
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="cursor-pointer py-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                            onSelect={handleLogout}
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span className="flex-1">Đăng xuất</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                </div>
            </nav>

            <ProfileEditDialog open={isProfileOpen} onOpenChange={setIsProfileOpen} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        </>
    );
};

export default MobileBottomNav;
