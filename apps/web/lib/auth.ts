"use client";

import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "./api";

/**
 * A 401 here means "logged out", not "transient failure" — retrying would only
 * delay the redirect to /entrar that AuthGate does the moment this settles.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    retry: false,
  });
}
