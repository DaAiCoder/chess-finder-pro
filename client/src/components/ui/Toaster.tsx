import * as React from "react";
import * as Toast from "@radix-ui/react-toast";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

const listeners = new Set<(t: ToastItem) => void>();
let nextId = 1;

export function toast(input: Omit<ToastItem, "id">) {
  const item: ToastItem = { id: nextId++, ...input };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  React.useEffect(() => {
    const fn = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== t.id)), 4000);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return (
    <Toast.Provider swipeDirection="right">
      {items.map((it) => (
        <Toast.Root
          key={it.id}
          className={[
            "rounded-md border p-4 shadow-lg backdrop-blur",
            it.variant === "destructive"
              ? "border-destructive bg-destructive/10 text-foreground"
              : it.variant === "success"
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-card text-card-foreground",
          ].join(" ")}
        >
          <Toast.Title className="text-sm font-semibold">{it.title}</Toast.Title>
          {it.description && (
            <Toast.Description className="mt-1 text-xs text-muted-foreground">
              {it.description}
            </Toast.Description>
          )}
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[100vw] flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}
