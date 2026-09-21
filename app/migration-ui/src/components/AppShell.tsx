import { useState, useCallback } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ShellBar, SideNavigation, SideNavigationItem, FlexBox, Button } from "@ui5/webcomponents-react";
import "@ui5/webcomponents-icons/dist/home.js";
import "@ui5/webcomponents-icons/dist/error.js";
import "@ui5/webcomponents-icons/dist/history.js";
import "@ui5/webcomponents-icons/dist/action-settings.js";
import "@ui5/webcomponents-icons/dist/menu2.js";
import "@ui5/webcomponents-icons/dist/attachment.js";

const NAV_ITEMS = [
  { key: "dashboard", path: "/dashboard", text: "Dashboard", icon: "home" },
  { key: "failed-records", path: "/failed-records", text: "Failed Records", icon: "error" },
  { key: "history", path: "/history", text: "Migration History", icon: "history" },
  { key: "settings", path: "/settings", text: "Settings", icon: "action-settings" },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sideNavCollapsed, setSideNavCollapsed] = useState(false);
  const currentPath = location.pathname;
  const selectedKey = NAV_ITEMS.find((item) => item.path === currentPath)?.key || "dashboard";

  const handleNavClick = useCallback((key: string) => {
    const item = NAV_ITEMS.find((i) => i.key === key);
    if (item) navigate(item.path);
  }, [navigate]);

  const toggleSideNav = useCallback(() => {
    setSideNavCollapsed((prev) => !prev);
  }, []);

  return (
    <FlexBox direction="Column" style={{ height: "100vh" }}>
      <ShellBar
        primaryTitle="V1 to V2 Lead Attachment Migration"
        secondaryTitle="Administration Dashboard"
        startButton={<Button icon="menu2" design="Transparent" onClick={toggleSideNav} />}
      />
      <FlexBox style={{ flex: 1, overflow: "hidden" }}>
        <SideNavigation
          collapsed={sideNavCollapsed}
          style={{ height: "100%", borderRight: "1px solid var(--sapGroup_ContentBorderColor)" }}
          onSelectionChange={(e) => {
            const selectedItem = e.detail.item;
            const key = selectedItem.dataset.key;
            if (key) handleNavClick(key);
          }}
        >
          {NAV_ITEMS.map((item) => (
            <SideNavigationItem key={item.key} data-key={item.key} text={item.text} icon={item.icon} selected={selectedKey === item.key} />
          ))}
        </SideNavigation>
        <main style={{ flex: 1, overflow: "auto", padding: "1rem", backgroundColor: "var(--sapBackgroundColor)" }}>
          <Outlet />
        </main>
      </FlexBox>
    </FlexBox>
  );
}
