import { NavLink, Outlet, useNavigate } from "react-router";
import {
  Activity,
  FileWarning,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UnlockKeyhole,
  UserRoundX,
} from "lucide-react";
import AdminIconButton from "@/components/admin/AdminIconButton";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";

const navItems = [
  { to: "/admin/overview", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/admin/observability", label: "Giám sát", icon: Activity },
  { to: "/admin/reports/messages", label: "Báo cáo tin nhắn", icon: FileWarning },
  { to: "/admin/reports/users", label: "Báo cáo người dùng", icon: UserRoundX },
  { to: "/admin/appeals", label: "Kháng cáo khóa", icon: UnlockKeyhole },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();

  const handleSignOut = async () => {
    await signOut();
    navigate("/signin", { replace: true });
  };

  return (
    <div className="flex h-svh min-h-0 bg-background text-foreground">
      <aside className="hidden w-68 shrink-0 border-r border-border/70 bg-card md:flex md:flex-col">
        <div className="border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">NexCon Admin</div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="size-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-border/70 p-3">
          <AdminIconButton label="Đăng xuất" tooltipSide="right" variant="ghost" className="rounded-md" onClick={handleSignOut}>
            <LogOut className="size-4" />
          </AdminIconButton>
        </div>
      </aside>

      <div className="safe-area-top flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-card px-3 md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex size-10 items-center justify-center rounded-md",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )
                }
                title={item.label}
              >
                <Icon className="size-4" />
              </NavLink>
            );
          })}
          <AdminIconButton label="Đăng xuất" tooltipSide="bottom" variant="ghost" className="ml-auto rounded-md" onClick={handleSignOut}>
            <LogOut className="size-4" />
          </AdminIconButton>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
