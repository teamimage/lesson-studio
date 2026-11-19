"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx, inputClass } from "@/components/ui";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

type Parts = { h: number; m: number; pm: boolean };

function parse(v: string | undefined | null): Parts | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(v ?? "");
  if (!m) return null;
  const h24 = Number(m[1]);
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, m: Number(m[2]), pm: h24 >= 12 };
}

function toValue(p: Parts): string {
  const h24 = (p.h % 12) + (p.pm ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The app's own time picker, in place of the phone's clock face. A field
 * shows the time; tapping it opens a digital clock: tap the hour or the
 * minutes to pick from a grid, and AM or PM beside it. Sends "HH:MM" (24 h)
 * under `name`, like a time input.
 */
export function TimePicker({
  name,
  value,
  defaultValue,
  onChange,
  required,
  label = "Time",
  className,
}: {
  name: string;
  value?: string;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  required?: boolean;
  label?: string;
  className?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const parts = parse(current);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Parts>({ h: 4, m: 0, pm: true });
  const [step, setStep] = useState<"h" | "m">("h");
  const dialog = useRef<HTMLDialogElement>(null);

  function set(v: string) {
    if (value === undefined) setOwn(v);
    onChange?.(v);
  }
  function show() {
    setDraft(parts ?? { h: 4, m: 0, pm: true });
    setStep("h");
    setOpen(true);
    requestAnimationFrame(() => dialog.current?.showModal());
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  function done(p: Parts) {
    set(toValue(p));
    close();
  }

  return (
    <div className={cx("relative", className)}>
      <button
        type="button"
        onClick={show}
        aria-label={`${label}: ${parts ? `${parts.h}:${pad(parts.m)} ${parts.pm ? "PM" : "AM"}` : "not set"}`}
        className={cx(inputClass, "text-center tabular-nums", !parts && "text-muted")}
      >
        {parts ? `${parts.h}:${pad(parts.m)} ${parts.pm ? "PM" : "AM"}` : "Pick a time"}
      </button>
      {/* Carries the value with the form; kept focusable so "required" can point at it. */}
      <input
        name={name}
        value={current}
        onChange={() => {}}
        required={required}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
      />
      {/* In a portal, so a <label> around the field can't catch clicks inside the picker. */}
      {open &&
        createPortal(
        <dialog
          ref={dialog}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === dialog.current) close();
          }}
          aria-label={label}
          className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-paper p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-sm sm:rounded-2xl"
        >
          <div className="flex flex-col gap-4 px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {/* The time, centred: hour and minutes are buttons, AM / PM beside. */}
            <div className="flex justify-center">
              <div className="relative my-4 flex items-center font-display text-[56px] leading-none tabular-nums">
                <Segment on={step === "h"} onClick={() => setStep("h")} label="Hour">
                  {draft.h}
                </Segment>
                <span className="px-0.5 text-muted">:</span>
                <Segment on={step === "m"} onClick={() => setStep("m")} label="Minutes">
                  {pad(draft.m)}
                </Segment>
              <div className="absolute left-full top-1/2 ml-3 flex -translate-y-1/2 flex-col gap-1 font-sans" role="group" aria-label="AM or PM">
                {(["AM", "PM"] as const).map((x) => {
                  const on = (x === "PM") === draft.pm;
                  return (
                    <button
                      key={x}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft({ ...draft, pm: x === "PM" })}
                      className={cx(
                        "min-h-10 rounded-lg px-3 text-[20px]",
                        on ? "bg-accent text-white font-bold" : "font-normal text-muted/70",
                      )}
                    >
                      {x}
                    </button>
                  );
                })}
              </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={step === "h" ? "Hour" : "Minutes"}>
              {(step === "h" ? HOURS : MINUTES).map((n) => {
                const on = step === "h" ? draft.h === n : draft.m === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      if (step === "h") {
                        setDraft({ ...draft, h: n });
                        setStep("m");
                      } else {
                        setDraft({ ...draft, m: n });
                      }
                    }}
                    className={cx(
                      "min-h-12 rounded-xl text-[20px] tabular-nums",
                      on ? "bg-accent font-bold text-white" : "text-ink hover:bg-accent-soft",
                    )}
                  >
                    {step === "h" ? n : pad(n)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={close} className="min-h-12 rounded-xl px-4 text-[17px] font-medium text-muted hover:bg-rule/40">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => done(draft)}
                className="min-h-12 rounded-xl bg-accent px-6 text-[17px] font-semibold text-white"
              >
                Set {draft.h}:{pad(draft.m)} {draft.pm ? "PM" : "AM"}
              </button>
            </div>
          </div>
        </dialog>,
          document.body,
        )}
    </div>
  );
}

function Segment({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={cx("rounded-xl px-2 py-1", on ? "bg-accent-soft text-accent-ink" : "text-ink")}
    >
      {children}
    </button>
  );
}
