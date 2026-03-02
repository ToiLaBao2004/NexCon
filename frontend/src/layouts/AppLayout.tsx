import MainSidebar from "@/components/sidebar/MainSidebar";
import { Outlet } from "react-router";

const AppLayout = () => {
    return (
        <div className="flex bg-background h-svh w-full overflow-hidden p-2 gap-2 relative">
            <div className="z-50 shrink-0 h-full">
                <MainSidebar />
            </div>

            <div className="flex-1 min-w-0 relative h-full">
                <Outlet />
            </div>
        </div>
    );
}

export default AppLayout;
