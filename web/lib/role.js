"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState, useEffect } from "react";

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function useRole() {
  const [role, setRole] = useState("manager"); // default while loading
  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data: { user } }) => {
        setRole(user?.user_metadata?.role ?? "manager");
      });
  }, []);
  return role;
}
