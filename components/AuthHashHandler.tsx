"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          router.push("/reset-password");
          router.refresh();
        } else if (event === "SIGNED_IN") {
          // Only redirect if we came from an auth link (hash fragment present or just consumed)
          const hash = window.location.hash;
          if (hash || document.referrer.includes("supabase")) {
            window.history.replaceState(null, "", window.location.pathname);
            router.push("/dashboard");
            router.refresh();
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
