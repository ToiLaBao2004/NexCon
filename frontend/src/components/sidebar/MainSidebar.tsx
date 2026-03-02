import {
    Video,
    Users,
    Calendar,
    Bell,
    Moon,
    Sun,
    LogOut,
    MessageSquare
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useFriendStore } from "@/stores/useFriendStore";
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

const MainSidebar = () => {
    const { user, signOut } = useAuthStore();
    const { isDark, toggleTheme } = useThemeStore();
    const { incomingRequests } = useFriendStore();
    const navigate = useNavigate();
    const location = useLocation();

    const notificationCount = incomingRequests.length;

    const handleLogout = async () => {
        try {
            await signOut();
            navigate("/signin");
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    const navItems = [
        { icon: Video, label: "Meet", id: "meet", path: "/meet" },
        { icon: Users, label: "People", id: "people", path: "/people" },
        { icon: Calendar, label: "Reminder", id: "reminder", path: "/reminder" },
        { icon: Bell, label: "Notification", id: "notification", path: "/notification" },
    ];

    const isPathActive = (path: string) => {
        if (path === "/chat" && (location.pathname === "/" || location.pathname === "/chat")) return true;
        return location.pathname === path;
    };

    return (
        <aside className="hidden md:flex flex-col items-center w-16 h-full py-4 bg-card border border-border/40 rounded-2xl shadow-soft shrink-0">
            <TooltipProvider delayDuration={0}>
                <div className="flex flex-col items-center gap-3 w-full px-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="relative h-12 w-12 rounded-full p-0 hover:bg-primary/20 transition-all group border-primary/30 bg-primary/10 shadow-sm overflow-visible">
                                <Avatar className="h-9 w-9 transition-all rounded-full">
                                    <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
                                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                        {user?.displayName?.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute bottom-1 right-1 h-3 w-3 rounded-full bg-green-500 border-2 border-card shadow-glow" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-64 ml-2" align="start" side="right" sideOffset={15}>
                            <DropdownMenuLabel className="font-normal px-2 py-3">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 rounded-lg">
                                        <AvatarImage src={user?.avatarUrl} />
                                        <AvatarFallback>{user?.displayName?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col space-y-0.5">
                                        <p className="text-sm font-semibold leading-none">{user?.displayName}</p>
                                        <p className="text-xs text-muted-foreground truncate w-40">{user?.email}</p>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
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
                            </DropdownMenuGroup>
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

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                onClick={() => navigate("/chat")}
                                className={cn(
                                    "h-12 w-12 rounded-full transition-all duration-300 border-primary/30 shadow-sm group relative",
                                    isPathActive("/chat") ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 hover:bg-primary/20 hover:text-primary"
                                )}
                            >
                                <MessageSquare className={cn("h-6 w-6 transition-transform duration-300 group-hover:scale-110", isPathActive("/chat") && "text-white")} />
                                {isPathActive("/chat") && (
                                    <div className="absolute -left-3 w-1 h-6 bg-primary rounded-r-full top-1/2 -translate-y-1/2" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={15} className="font-semibold font-sans bg-white text-black">Chat</TooltipContent>
                    </Tooltip>

                    {navItems.map((item) => {
                        const active = isPathActive(item.path);
                        const badgeCount = item.id === "notification" ? notificationCount : 0;
                        return (
                            <Tooltip key={item.id}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => navigate(item.path)}
                                        className={cn(
                                            "h-12 w-12 rounded-2xl transition-all duration-300 border-primary/30 shadow-sm group relative",
                                            active ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 hover:bg-primary/20 hover:text-primary"
                                        )}
                                    >
                                        <item.icon className={cn("h-6 w-6 transition-transform duration-300 group-hover:scale-110", active && "text-white")} />
                                        <div className={cn(
                                            "absolute -left-3 w-1 bg-primary rounded-r-full transition-all duration-300 top-1/2 -translate-y-1/2",
                                            active ? "h-6 opacity-100" : "h-0 opacity-0 group-hover:h-6 group-hover:opacity-100"
                                        )} />
                                        {badgeCount > 0 && (
                                            <span className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold shadow-md border-2 border-card animate-in zoom-in duration-200">
                                                {badgeCount > 99 ? "99+" : badgeCount}
                                            </span>
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={15} className="font-semibold font-sans bg-popover text-popover-foreground shadow-soft border-border/50">
                                    {item.label}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>
            </TooltipProvider>

            <div className="mt-auto" />
        </aside>
    );
};

export default MainSidebar;
