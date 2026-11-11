"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { LiveUpdates } from "./live-updates";
import { CelebrationHost } from "./app/celebration";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <LiveUpdates />
      <CelebrationHost />
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: 16, background: "#0f2a18", color: "#fff", border: "none" },
          className: "font-sans",
        }}
      />
    </QueryClientProvider>
  );
}
