"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Club } from "@/types/database";

interface ClubContextType {
  clubs: Club[];
  selectedClub: Club | null;
  setSelectedClub: (club: Club) => void;
  isLoading: boolean;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

const SELECTED_CLUB_KEY = "selectedClubId";

interface ClubProviderProps {
  children: ReactNode;
  clubs: Club[];
}

export function ClubProvider({ children, clubs }: ClubProviderProps) {
  const [selectedClub, setSelectedClubState] = useState<Club | null>(null);
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

  const setSelectedClub = (club: Club) => {
    setSelectedClubState(club);
    localStorage.setItem(SELECTED_CLUB_KEY, club.id);
  };

  return (
    <ClubContext.Provider
      value={{
        clubs,
        selectedClub,
        setSelectedClub,
        isLoading,
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
