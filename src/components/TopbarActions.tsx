"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function TopbarActions() {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        aria-label="Clear conversation"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("clear-chat"));
        }}
      >
        <RefreshCw className="w-4 h-4" />
        <span className="sr-only">Clear</span>
      </Button>
    </div>
  );
}


