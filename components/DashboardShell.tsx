"use client";

import { ReactNode } from "react";
import { ClubProvider } from "@/contexts/ClubContext";
import Sidebar from "@/components/Sidebar";
import type { Club } from "@/types/database";

interface DashboardShellProps {
  children: ReactNode;
  clubs: Club[];
}

export default function DashboardShell({ children, clubs }: DashboardShellProps) {
  return (
    <ClubProvider clubs={clubs}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">{children}</div>
        </main>
      </div>
    </ClubProvider>
  );
}
