import MainSidebar from "@/components/sidebar/MainSidebar";
import MobileBottomNav from "@/components/sidebar/MobileBottomNav";
import { useChatStore } from "@/stores/useChatStore";
import { useMeetStore } from "@/stores/useMeetStore";
import { useReminderStore } from "@/stores/useReminderStore";
import { cn } from "@/lib/utils";
import { Outlet, useLocation } from "react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect } from "react";

const AppLayout = () => {
    const location = useLocation();
    const isMobile = useIsMobile();
    const { activeConversationId } = useChatStore();
    const { isInMeeting, isMinimized: isMeetMinimized } = useMeetStore();
    const { fetchUpcomingCount } = useReminderStore();

    const isChatRoute = location.pathname === "/" || location.pathname === "/chat";
    const shouldHideMobileBottomNav = isMobile && ((isInMeeting && !isMeetMinimized) || (isChatRoute && !!activeConversationId));

    useEffect(() => {
        void fetchUpcomingCount();
    }, [fetchUpcomingCount]);

    return (
        <div className="flex bg-background h-svh w-full overflow-hidden p-0 relative">
            <div className="z-[100] shrink-0 h-full">
                <MainSidebar />
            </div>

            <div
                className={cn(
                    "flex-1 min-w-0 relative h-full md:pb-0",
                    shouldHideMobileBottomNav ? "pb-0" : "pb-14"
                )}
            >
                <Outlet />
            </div>

            {!shouldHideMobileBottomNav && <MobileBottomNav />}
        </div>
    );
}

export default AppLayout;
