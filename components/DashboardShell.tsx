"use client";

import { ReactNode, useState, useEffect } from "react";
import { ClubProvider } from "@/contexts/ClubContext";
import Sidebar from "@/components/Sidebar";
import type { ClubWithMembership } from "@/types/database";

interface DashboardShellProps {
  children: ReactNode;
  clubs: ClubWithMembership[];
}

export default function DashboardShell({ children, clubs }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Persist collapsed state to localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("sidebarCollapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <ClubProvider clubs={clubs}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">{children}</div>
        </main>
      </div>
    </ClubProvider>
  );
}
