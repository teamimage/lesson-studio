"use client";

import { Button } from "./ui";

export function PrintButton() {
  return (
    <Button type="button" className="min-h-9 px-3 text-sm" onClick={() => window.print()}>
      Print or save PDF
    </Button>
  );
}
