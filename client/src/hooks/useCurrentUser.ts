import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";

export interface CurrentUser {
  authenticated: boolean;
  anonymous: boolean;
  id: number;
  username: string;
  email?: string | null;
  lichess: string | null;
  preferences?: Record<string, unknown>;
  /** Pro features: subscription, signup trial, or complimentary test account. */
  hasProAccess?: boolean;
  trialEndsAt?: string | null;
  subscriptionActive?: boolean;
  complimentary?: boolean;
  inSignupTrial?: boolean;
}

/**
 * Session-bound identity from `/api/auth/me` (anonymous user created on
 * first visit, or Lichess-linked account after OAuth).
 */
/** True when the user has a real account (not the anonymous guest session). */
export function isSignedInUser(user: CurrentUser | undefined | null): boolean {
  return Boolean(user?.authenticated && !user.anonymous);
}

export function useCurrentUser() {
  const q = useQuery<CurrentUser>({
    queryKey: ["auth", "me"],
    queryFn: () => api<CurrentUser>("/api/auth/me"),
    staleTime: 60_000,
  });
  return {
    user: q.data,
    userId: q.data?.id ?? null,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
