import MainSidebar from "@/components/sidebar/MainSidebar";
import { Outlet } from "react-router";

const AppLayout = () => {
    return (
        <div className="flex bg-background h-screen w-full overflow-hidden p-2 gap-2 relative">
            <div className="z-50 shrink-0">
                <MainSidebar />
            </div>

            <div className="flex-1 min-w-0 relative">
                <Outlet />
            </div>
        </div>
    );
}

export default AppLayout;
