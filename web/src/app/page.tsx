"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOwner } from "@/lib/owner-context";

export default function RootPage() {
  const { owner, loading } = useOwner();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(owner ? "/overview" : "/login");
  }, [owner, loading, router]);

  return null;
}
