import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export interface TrainingUsage {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export function useTrainingUsage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const q = useQuery<TrainingUsage>({
    queryKey: ["training", "usage", user?.id],
    queryFn: () => api<TrainingUsage>("/api/training/usage"),
    enabled: !!user,
    staleTime: 15_000,
  });
  return {
    usage: q.data,
    isLoading: authLoading || q.isLoading,
    refetch: q.refetch,
  };
}
