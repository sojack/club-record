/**
 * Parse a time string to milliseconds
 * Handles formats: "20.91", "1:42.00", "14:30.67", "1:42:00" (malformed)
 */
export function parseTimeToMs(time: string): number {
  if (!time || time.trim() === "") {
    return 0;
  }

  const cleaned = time.trim();

  // Handle malformed format like "1:42:00" (should be "1:42.00")
  const normalized = cleaned.replace(/:(\d{2})$/, ".$1");

  const parts = normalized.split(":");

  if (parts.length === 1) {
    // Format: SS.hh (e.g., "20.91")
    const seconds = parseFloat(parts[0]);
    return Math.round(seconds * 1000);
  } else if (parts.length === 2) {
    // Format: MM:SS.hh (e.g., "1:42.00")
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    return Math.round((minutes * 60 + seconds) * 1000);
  } else if (parts.length === 3) {
    // Format: HH:MM:SS.hh (unlikely for swimming but handle it)
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }

  return 0;
}

/**
 * Format milliseconds to time string.
 * Returns SS.hh for times under 1 minute, M:SS.hh otherwise.
 * Rounds once at the hundredths place; overflow carries into seconds/minutes.
 */
export function formatMsToTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "";
  }

  const totalHundredths = Math.round(ms / 10);
  const totalSeconds = Math.floor(totalHundredths / 100);
  const hundredths = totalHundredths % 100;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const hh = hundredths.toString().padStart(2, "0");

  if (minutes === 0) {
    return `${seconds}.${hh}`;
  }

  const ss = seconds.toString().padStart(2, "0");
  return `${minutes}:${ss}.${hh}`;
}

/**
 * Validate if a string is a valid time format
 */
export function isValidTimeFormat(time: string): boolean {
  if (!time || time.trim() === "") {
    return false;
  }

  // Patterns: SS.hh, M:SS.hh, MM:SS.hh, H:MM:SS.hh
  const patterns = [
    /^\d{1,2}\.\d{1,2}$/,           // SS.hh
    /^\d{1,2}:\d{2}\.\d{1,2}$/,     // M:SS.hh or MM:SS.hh
    /^\d{1,2}:\d{2}:\d{2}$/,        // Malformed M:SS:hh
    /^\d{1,2}:\d{2}:\d{2}\.\d{1,2}$/, // H:MM:SS.hh
  ];

  return patterns.some((pattern) => pattern.test(time.trim()));
}
