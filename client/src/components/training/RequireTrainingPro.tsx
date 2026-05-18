import * as React from "react";
import { Link } from "wouter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { TrainingProGate } from "@/components/training/TrainingProGate";
import { Button } from "@/components/ui/Button";

export function RequireTrainingPro({
  feature,
  children,
}: {
  feature: string;
  children: React.ReactNode;
}) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user?.authenticated || user.anonymous) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Sign in to use this trainer</h1>
          <p className="text-sm text-muted-foreground">
            Create a free account for daily puzzle practice, or subscribe for full Pro trainers.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild style={{ backgroundColor: "#769656", color: "white" }}>
              <Link href={`/signup?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/training")}`}>
                Sign up free
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          </div>
      </div>
    );
  }

  if (user.hasProAccess !== true) {
    return <TrainingProGate feature={feature} />;
  }

  return <>{children}</>;
}
