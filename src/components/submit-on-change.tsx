"use client";

import { useEffect, useRef } from "react";

// Submits the enclosing form when any select inside it changes.
export function SubmitOnChange() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const handler = () => form.requestSubmit();
    form.querySelectorAll("select").forEach((el) => el.addEventListener("change", handler));
    return () => form.querySelectorAll("select").forEach((el) => el.removeEventListener("change", handler));
  }, []);
  return <span ref={ref} hidden />;
}
