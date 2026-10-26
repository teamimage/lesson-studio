// Titles and order of the Suzuki books, so a piece is one tap away in the
// lesson form and the repertoire map can show where a student sits.
// Titles and sequence only; no book content. "Suzuki" is a trademark of the
// International Suzuki Association; lists follow the Alfred editions.

export type SuzukiBook = { book: string; pieces: string[] };

export const SUZUKI_BOOKS: Record<string, SuzukiBook[]> = {
  piano: [
    {
      book: "Suzuki Piano Book 1",
      pieces: [
        "Twinkle, Twinkle, Little Star Variations",
        "Lightly Row",
        "The Honeybee",
        "Cuckoo",
        "Lightly Row (left hand)",
        "French Children's Song",
        "London Bridge",
        "Mary Had a Little Lamb",
        "Go Tell Aunt Rhody",
        "Au Clair de la Lune",
        "Long, Long Ago",
        "Little Playmates",
        "Chant Arabe",
        "Allegretto 1",
        "Goodbye to Winter",
        "Allegretto 2",
        "Christmas-Day Secrets",
        "Allegro",
        "Musette",
      ],
    },
    {
      book: "Suzuki Piano Book 2",
      pieces: [
        "Ecossaise (Hummel)",
        "A Short Story (Lichner)",
        "The Happy Farmer (Schumann)",
        "Minuet 1 in G major, BWV 822 (Bach)",
        "Minuet 2 in G major (Anna Magdalena Notebook)",
        "Minuet 3 in G minor, BWV 822 (Bach)",
        "Cradle Song (Weber)",
        "Arietta (Mozart)",
        "Hungarian Folk Song (Bartók)",
        "Melody (Schumann)",
        "Minuet in G major (Petzold)",
        "Sonatina in G major, Moderato (Beethoven)",
        "Sonatina in G major, Romance (Beethoven)",
        "Children at Play (Bartók)",
      ],
    },
  ],
  cello: [
    {
      book: "Suzuki Cello Book 1",
      pieces: [
        "Twinkle, Twinkle, Little Star Variations",
        "French Folk Song",
        "Lightly Row",
        "Song of the Wind",
        "Go Tell Aunt Rhody",
        "O Come, Little Children",
        "May Song",
        "Allegro",
        "Perpetual Motion in D major",
        "Perpetual Motion in G major",
        "Long, Long Ago",
        "Allegretto",
        "Andantino",
        "Rigadoon (Purcell)",
        "Etude",
        "The Happy Farmer (Schumann)",
        "Minuet in C (Bach)",
        "Minuet No. 2 (Bach)",
      ],
    },
    {
      book: "Suzuki Cello Book 2",
      pieces: [
        "Long, Long Ago (with variation)",
        "May Time (Mozart)",
        "Minuet No. 1 (Bach)",
        "Minuet No. 3 (Bach)",
        "Chorus from Judas Maccabaeus (Handel)",
        "Hunters' Chorus (Weber)",
        "Musette in G (Bach)",
        "March in G (Bach)",
        "Theme from Witches' Dance (Paganini)",
        "The Moon over the Ruined Castle (Taki)",
        "The Two Grenadiers (Schumann)",
        "Gavotte (Gossec)",
        "Bourrée (Handel)",
      ],
    },
  ],
};

export function booksFor(instrument: string): SuzukiBook[] {
  return SUZUKI_BOOKS[instrument.toLowerCase()] ?? [];
}

// Loose title match: ignores case, punctuation and anything in parentheses,
// and treats "Twinkle Variation A" as part of the Twinkle set.
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/variations?\b.*$/, "variations")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesPiece(bookTitle: string, repTitle: string): boolean {
  const a = normalizeTitle(bookTitle);
  const b = normalizeTitle(repTitle);
  if (a === b) return true;
  // Any "Twinkle ..." title (Variation A, Theme, etc.) belongs to the Twinkle set.
  if (a.startsWith("twinkle") && b.startsWith("twinkle")) return true;
  // "Twinkle Variation A" -> "twinkle variations"; "Lightly Row (left hand)" -> "lightly row"
  const aShort = a.replace(/ variations$/, "");
  const bShort = b.replace(/ variations$/, "");
  return aShort.length > 4 && (bShort.startsWith(aShort) || aShort.startsWith(bShort)) && Math.abs(aShort.length - bShort.length) <= 12;
}
