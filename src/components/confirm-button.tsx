"use client";

import type { ComponentProps } from "react";
import { Button, type ButtonVariant } from "@/components/ui";

/** Submit button that asks "are you sure?" first. */
export function ConfirmButton({
  message,
  ...props
}: ComponentProps<"button"> & { message: string; variant?: ButtonVariant }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
