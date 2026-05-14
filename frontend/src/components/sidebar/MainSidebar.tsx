import {
    Video,
    Users,
    Calendar,
    Bell,
    Moon,
    Sun,
    LogOut,
    MessageSquare,
    Settings
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useChatStore } from "@/stores/useChatStore";
import { useNavigate, useLocation } from "react-router";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "../ui/switch";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ProfileEditDialog } from "./ProfileEditDialog";
import { SettingsDialog } from "./SettingsDialog";

const MainSidebar = () => {
    const { user, signOut } = useAuthStore();
    const { isDark, toggleTheme } = useThemeStore();
    const { incomingRequests } = useFriendStore();
    const { unreadCount } = useNotificationStore();
    const { conversations, setFocusedConversation } = useChatStore();
    const navigate = useNavigate();
    const location = useLocation();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const friendRequestCount = incomingRequests.length;

    const unreadMessagesCount = conversations.reduce((acc, convo) => {
        if (!user) return acc;
        return acc + (convo.unreadCounts?.[user._id] ?? 0);
    }, 0);

    const handleLogout = async () => {
        try {
            await signOut();
            navigate("/signin");
        } catch (error) {
            console.error("Đăng xuất thất bại:", error);
        }
    };

    const handleSidebarClick = () => {
        setFocusedConversation(null);
    };

    const topNavItems = [
        { icon: MessageSquare, label: "Tin nhắn", id: "chat", path: "/chat", badge: unreadMessagesCount },
        { icon: Users, label: "Mọi người", id: "people", path: "/people", badge: friendRequestCount },
        { icon: Calendar, label: "Lời nhắc", id: "reminder", path: "/reminder", badge: 0 },
        { icon: Bell, label: "Thông báo", id: "notification", path: "/notification", badge: unreadCount },
    ];

    const bottomNavItems = [
        { icon: Video, label: "Cuộc họp", id: "meet", path: "/meet" },
    ];

    const isPathActive = (path: string) => {
        if (path === "/chat" && (location.pathname === "/" || location.pathname === "/chat")) return true;
        return location.pathname === path;
    };

    return (
        <aside
            onClick={handleSidebarClick}
            className="hidden md:flex flex-col items-center w-16 h-full pt-3 pb-4 bg-white dark:bg-[#081c36] border-r border-border/80 shadow-none shrink-0 cursor-default transition-colors duration-300"
        >
            <TooltipProvider delayDuration={0}>
                {/* Top Section: Avatar and Main Nav */}
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setFocusedConversation(null);
                            return;
                        }
                        e.stopPropagation();
                    }}
                    className="flex flex-col items-center gap-2 w-full flex-1"
                >
                    {/* User Avatar */}
                    <div className="mb-4">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-12 w-12 rounded-full p-0 hover:bg-slate-100 dark:hover:bg-white/10 transition-all border-none bg-transparent shadow-none">
                                    <Avatar className="h-10 w-10 border-2 border-slate-200 dark:border-white/20">
                                        <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
                                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                            {user?.displayName?.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute bottom-1 right-1 h-3 w-3 rounded-full bg-green-500 border-2 border-white dark:border-[#081c36]" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-80 ml-2" align="start" side="right" sideOffset={15}>
                                <DropdownMenuLabel className="font-normal px-2 py-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10 rounded-lg">
                                            <AvatarImage src={user?.avatarUrl} />
                                            <AvatarFallback>{user?.displayName?.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col space-y-0.5">
                                            <p className="text-sm font-semibold leading-none">{user?.displayName}</p>
                                            <p className="text-xs text-muted-foreground truncate w-60">{user?.email}</p>
                                        </div>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                    <DropdownMenuItem className="cursor-pointer py-2" onSelect={() => setIsProfileOpen(true)}>
                                        <Users className="mr-2 h-4 w-4" />
                                        <span>Hồ sơ của tôi</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer py-2" onSelect={() => setIsSettingsOpen(true)}>
                                        <Settings className="mr-2 h-4 w-4" />
                                        <span>Cài đặt</span>
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                    <DropdownMenuItem className="cursor-pointer py-2 text-primary focus:text-primary" onSelect={(e) => { e.preventDefault(); toggleTheme(); }}>
                                        {isDark ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                                        <div className="flex-1 capitalize">{isDark ? "Tối" : "Sáng"}</div>
                                        <Switch checked={isDark} className="ml-2" />
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer py-2 text-destructive focus:text-destructive focus:bg-destructive/10" onSelect={handleLogout}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span className="flex-1">Đăng xuất</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Main Nav Items */}
                    {topNavItems.map((item) => {
                        const active = isPathActive(item.path);
                        return (
                            <Tooltip key={item.id}>
                                <TooltipTrigger asChild>
                                    <div
                                        onClick={() => navigate(item.path)}
                                        className={cn(
                                            "h-16 w-full flex items-center justify-center transition-all duration-200 group relative cursor-pointer",
                                            active
                                                ? "bg-slate-100 dark:bg-white/10 text-black dark:text-white"
                                                : "bg-transparent text-black dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon 
                                            strokeWidth={1.5}
                                            className={cn("h-[26px] w-[26px] transition-transform", active ? "scale-100 text-[#0068ff]" : "scale-95 group-hover:scale-100")} 
                                        />
                                        {item.badge > 0 && (
                                            <span className="absolute top-3 right-3 min-w-[1.1rem] h-4.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold border-2 border-white dark:border-[#081c36] px-1">
                                                {item.badge > 99 ? "99+" : item.badge}
                                            </span>
                                        )}
                                        {active && (
                                            <div className="absolute left-0 w-1 h-8 bg-[#0068ff] rounded-r-full" />
                                        )}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={10} className="font-semibold">{item.label}</TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>

                {/* Bottom Section: Meeting and Settings */}
                <div className="flex flex-col items-center w-full mt-auto">
                    {bottomNavItems.map((item) => {
                        const active = isPathActive(item.path);
                        return (
                            <Tooltip key={item.id}>
                                <TooltipTrigger asChild>
                                    <div
                                        onClick={() => navigate(item.path)}
                                        className={cn(
                                            "h-16 w-full flex items-center justify-center transition-all duration-200 group relative cursor-pointer",
                                            active
                                                ? "bg-slate-100 dark:bg-white/10 text-black dark:text-white"
                                                : "bg-transparent text-black dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon 
                                            strokeWidth={1.5}
                                            className={cn("h-[26px] w-[26px]", active && "text-[#0068ff]")} 
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={10}>{item.label}</TooltipContent>
                            </Tooltip>
                        );
                    })}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                onClick={() => setIsSettingsOpen(true)}
                                className="h-16 w-full flex items-center justify-center transition-all duration-200 text-black dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                            >
                                <Settings strokeWidth={1.5} className="h-[26px] w-[26px]" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={10}>Cài đặt</TooltipContent>
                    </Tooltip>
                </div>
            </TooltipProvider>

            <ProfileEditDialog open={isProfileOpen} onOpenChange={setIsProfileOpen} />
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        </aside>
    );
};

export default MainSidebar;
