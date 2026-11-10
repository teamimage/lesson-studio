"use client";

import { useEffect, useRef } from "react";

/**
 * The music card's editable title. A textarea that grows with the text, so a long
 * title wraps onto more lines instead of being cut off. Enter saves (submits the form).
 */
export function ScoreTitleField({ defaultValue }: { defaultValue: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    fit();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Re-fit when the column width changes (rotation, resize).
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      name="title"
      rows={1}
      defaultValue={defaultValue}
      onInput={fit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
      className="block min-h-9 min-w-0 flex-1 resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-1 py-1 font-semibold leading-snug hover:border-rule focus:border-accent focus:bg-paper"
    />
  );
}
