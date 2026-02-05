"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { ClubWithMembership, ClubMemberRole } from "@/types/database";

interface ClubContextType {
  clubs: ClubWithMembership[];
  selectedClub: ClubWithMembership | null;
  setSelectedClub: (club: ClubWithMembership) => void;
  isLoading: boolean;
  currentRole: ClubMemberRole | null;
  isOwner: boolean;
  isEditor: boolean;
  canEdit: boolean;
  isAdmin: boolean;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

const SELECTED_CLUB_KEY = "selectedClubId";

interface ClubProviderProps {
  children: ReactNode;
  clubs: ClubWithMembership[];
  isAdmin?: boolean;
}

export function ClubProvider({ children, clubs, isAdmin = false }: ClubProviderProps) {
  const [selectedClub, setSelectedClubState] = useState<ClubWithMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On mount, try to restore selected club from localStorage
    const savedClubId = localStorage.getItem(SELECTED_CLUB_KEY);

    if (savedClubId) {
      const savedClub = clubs.find((c) => c.id === savedClubId);
      if (savedClub) {
        setSelectedClubState(savedClub);
      } else {
        // Saved club no longer exists, select first club
        setSelectedClubState(clubs[0] || null);
      }
    } else {
      // No saved selection, select first club
      setSelectedClubState(clubs[0] || null);
    }

    setIsLoading(false);
  }, [clubs]);

  const setSelectedClub = (club: ClubWithMembership) => {
    setSelectedClubState(club);
    localStorage.setItem(SELECTED_CLUB_KEY, club.id);
  };

  const currentRole = selectedClub?.membership?.role ?? null;
  const isOwner = currentRole === 'owner';
  const isEditor = currentRole === 'editor';
  const canEdit = isOwner || isEditor;

  return (
    <ClubContext.Provider
      value={{
        clubs,
        selectedClub,
        setSelectedClub,
        isLoading,
        currentRole,
        isOwner,
        isEditor,
        canEdit,
        isAdmin,
      }}
    >
      {children}
    </ClubContext.Provider>
  );
}

export function useClub() {
  const context = useContext(ClubContext);
  if (context === undefined) {
    throw new Error("useClub must be used within a ClubProvider");
  }
  return context;
}
