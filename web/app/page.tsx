"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatWindow from "@/components/ChatWindow";
import type { AuthUser } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const stored = localStorage.getItem("auth_user");
    if (!token || !stored) {
      router.replace("/login");
      return;
    }
    try {
      setUser(JSON.parse(stored));
    } catch {
      router.replace("/login");
    } finally {
      setChecking(false);
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    router.replace("/login");
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return <ChatWindow user={user} onLogout={handleLogout} />;
}
