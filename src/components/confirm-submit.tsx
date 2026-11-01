"use client";

import type { ComponentProps } from "react";

/** A plain (unstyled) submit button that asks "are you sure?" first. */
export function ConfirmSubmit({ message, ...props }: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
