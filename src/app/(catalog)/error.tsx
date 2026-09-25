"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function CatalogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="pt-24">
      <EmptyState
        icon={TriangleAlert}
        title="The library didn't load"
        action={<Button onClick={reset}>Try again</Button>}
      >
        {error.digest ? `Something went wrong on the server (ref ${error.digest}).` : "Something went wrong on the server."}
      </EmptyState>
    </div>
  );
}
