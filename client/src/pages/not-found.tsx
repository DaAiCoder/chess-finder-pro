import { Link } from "wouter";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 gap-4">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <Link href="/">
        <Button variant="outline">Go to Analysis</Button>
      </Link>
    </div>
  );
}
