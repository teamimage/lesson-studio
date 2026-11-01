"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { INSTRUMENTS, instrumentLabel, suzukiBookTitles } from "@/lib/constants";

const OTHER = "__other";

/** Book number at the end of a title ("Suzuki Cello Book 3" -> 3). */
function bookNumber(title: string): number | null {
  const m = /book\s+(\d+)\s*$/i.exec(title.trim());
  return m ? Number(m[1]) : null;
}

/** Find a stored book title in the list, ignoring case and a missing "Suzuki". */
function matchBook(stored: string, books: string[]): string | null {
  const s = stored.trim().toLowerCase().replace(/^suzuki\s+/, "");
  if (!s) return null;
  return books.find((b) => b.toLowerCase().replace(/^suzuki\s+/, "") === s) ?? null;
}

/**
 * Instrument picker plus a "Current book" picker that lists the Suzuki books
 * for the chosen instrument, Book 1 upward. "Other" allows a typed book for
 * non-Suzuki methods. Submits form fields `instrument` and `current_book`.
 */
export function InstrumentBookFields({
  instrument: initialInstrument,
  currentBook,
}: {
  instrument?: string | null;
  currentBook?: string | null;
}) {
  const startInstrument = (initialInstrument ?? "piano").toLowerCase();
  const startBooks = suzukiBookTitles(startInstrument);
  const startMatch = currentBook ? matchBook(currentBook, startBooks) : null;

  const [instrument, setInstrument] = useState(startInstrument);
  const [choice, setChoice] = useState<string>(startMatch ?? (currentBook?.trim() ? OTHER : ""));
  const [custom, setCustom] = useState(startMatch ? "" : (currentBook ?? ""));

  const books = suzukiBookTitles(instrument);
  const instrumentOptions = INSTRUMENTS.includes(instrument) ? INSTRUMENTS : [...INSTRUMENTS, instrument];
  const value = choice === OTHER ? custom.trim() : choice;

  function changeInstrument(next: string) {
    setInstrument(next);
    if (choice === OTHER || !choice) return;
    // Keep the same book number on the new instrument when it has one.
    const n = bookNumber(choice);
    const nextBooks = suzukiBookTitles(next);
    setChoice(n && n <= nextBooks.length ? nextBooks[n - 1] : nextBooks[0] ?? "");
  }

  return (
    <>
      <Field label="Instrument">
        <Select name="instrument" value={instrument} onChange={(e) => changeInstrument(e.target.value)}>
          {instrumentOptions.map((i) => (
            <option key={i} value={i}>
              {instrumentLabel(i)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Current book"
        hint={books.length === 0 && choice !== OTHER ? "No Suzuki books for this instrument yet." : undefined}
      >
        <input type="hidden" name="current_book" value={value} />
        <Select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Current book">
          <option value="">Not set</option>
          {books.map((b) => (
            <option key={b} value={b}>
              {b.replace(/^Suzuki\s+/, "")}
            </option>
          ))}
          <option value={OTHER}>Other (type it)</option>
        </Select>
        {choice === OTHER && (
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Book name"
            aria-label="Other book"
            className="mt-2"
          />
        )}
      </Field>
    </>
  );
}
