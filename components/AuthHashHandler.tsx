"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken) return;

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error("Failed to set session from hash:", error);
          return;
        }

        // Clear the hash
        window.history.replaceState(null, "", window.location.pathname);

        // Redirect based on the link type
        if (type === "recovery") {
          router.push("/reset-password");
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      });
  }, [router]);

  return null;
}
