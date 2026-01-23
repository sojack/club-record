"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { clubs, selectedClub, setSelectedClub, isLoading } = useClub();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleClubSelect = (clubId: string) => {
    const club = clubs.find((c) => c.id === clubId);
    if (club) {
      setSelectedClub(club);
    }
    setDropdownOpen(false);
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠" },
    { href: "/dashboard/records", label: "Record Lists", icon: "📋" },
    { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <aside
      className={`flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-800 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Club Selector */}
      <div className="relative border-b border-gray-200 px-2 py-3 dark:border-gray-700">
        {collapsed ? (
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex h-10 w-full items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            title={selectedClub?.short_name || "Select Club"}
          >
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              {selectedClub?.short_name?.charAt(0) || "?"}
            </span>
          </button>
        ) : (
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {isLoading ? "Loading..." : selectedClub?.short_name || "Select Club"}
              </div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                {selectedClub?.full_name || ""}
              </div>
            </div>
            <svg
              className={`h-5 w-5 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {dropdownOpen && (
          <div
            className={`absolute top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700 ${
              collapsed ? "left-2 w-48" : "left-4 right-4"
            }`}
          >
            <div className="max-h-64 overflow-y-auto py-1">
              {clubs.map((club) => (
                <button
                  key={club.id}
                  onClick={() => handleClubSelect(club.id)}
                  className={`flex w-full items-center px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    selectedClub?.id === club.id
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{club.short_name}</div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {club.full_name}
                    </div>
                  </div>
                  {selectedClub?.id === club.id && (
                    <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-600">
              <Link
                href="/dashboard/clubs/new"
                onClick={() => setDropdownOpen(false)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add New Club
              </Link>
            </div>
          </div>
        )}
      </div>

      <nav className={`flex-1 space-y-1 ${collapsed ? "p-2" : "p-4"}`}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
              } ${
                isActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <span className={collapsed ? "text-lg" : ""}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {selectedClub && !collapsed && (
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          <div className="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Public URL
          </div>
          <code className="block rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            /{selectedClub.slug}
          </code>
        </div>
      )}

      <div className={`border-t border-gray-200 dark:border-gray-700 ${collapsed ? "p-2" : "p-4"}`}>
        <button
          onClick={handleLogout}
          title={collapsed ? "Log out" : undefined}
          className={`flex w-full items-center rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          }`}
        >
          <span className={collapsed ? "text-lg" : ""}>🚪</span>
          {!collapsed && "Log out"}
        </button>
      </div>

      {/* Collapse/Expand Toggle */}
      <div className={`border-t border-gray-200 dark:border-gray-700 ${collapsed ? "p-2" : "p-4"}`}>
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex w-full items-center rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          }`}
        >
          <svg
            className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
