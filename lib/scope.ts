export type ClubLevel = "regular" | "provincial" | "national";
export type ListScope = "club" | "provincial" | "national";

/** A club's level authoritatively determines its lists' scope. */
export function scopeForClubLevel(
  level: ClubLevel | null | undefined
): ListScope {
  return level === "national"
    ? "national"
    : level === "provincial"
    ? "provincial"
    : "club";
}
