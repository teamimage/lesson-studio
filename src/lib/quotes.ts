// Daily inspirational quote for Downbeat.
//
// Every quote here is from a fixed, checked list: nothing is generated. Bible
// verses are the King James Version (public domain in the US), quoted as
// printed, with the exact reference. Other quotes come from the named work
// with a known source; popular quotes that are misattributed online (the
// "Einstein", "Beethoven" or "Confucius" sayings with no source) were left
// out on purpose. Where a translation is quoted, the translator is named.
//
// Ids are stored in quote_history, so never change or reuse an id. To retire
// a quote, delete it from the list; old history rows that name it are skipped.

export type QuoteKind = "bible" | "music" | "teaching" | "wisdom";

export type Quote = {
  id: string;
  kind: QuoteKind;
  text: string;
  /** Who said or wrote it; for Bible verses, the reference. */
  by: string;
  /** Where it comes from (work, year, translation). */
  source: string;
};

const KJV = "King James Version";

export const QUOTES: Quote[] = [
  // ── Bible (King James Version) ──────────────────────────────────────────
  { id: "kjv-phil-4-13", kind: "bible", by: "Philippians 4:13", source: KJV, text: "I can do all things through Christ which strengtheneth me." },
  { id: "kjv-isa-40-31", kind: "bible", by: "Isaiah 40:31", source: KJV, text: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint." },
  { id: "kjv-josh-1-9", kind: "bible", by: "Joshua 1:9", source: KJV, text: "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest." },
  { id: "kjv-ps-118-24", kind: "bible", by: "Psalm 118:24", source: KJV, text: "This is the day which the LORD hath made; we will rejoice and be glad in it." },
  { id: "kjv-gal-6-9", kind: "bible", by: "Galatians 6:9", source: KJV, text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not." },
  { id: "kjv-col-3-23", kind: "bible", by: "Colossians 3:23–24", source: KJV, text: "And whatsoever ye do, do it heartily, as to the Lord, and not unto men; knowing that of the Lord ye shall receive the reward of the inheritance: for ye serve the Lord Christ." },
  { id: "kjv-ps-150-6", kind: "bible", by: "Psalm 150:6", source: KJV, text: "Let every thing that hath breath praise the LORD. Praise ye the LORD." },
  { id: "kjv-ps-33-3", kind: "bible", by: "Psalm 33:3", source: KJV, text: "Sing unto him a new song; play skilfully with a loud noise." },
  { id: "kjv-prov-22-6", kind: "bible", by: "Proverbs 22:6", source: KJV, text: "Train up a child in the way he should go: and when he is old, he will not depart from it." },
  { id: "kjv-prov-16-3", kind: "bible", by: "Proverbs 16:3", source: KJV, text: "Commit thy works unto the LORD, and thy thoughts shall be established." },
  { id: "kjv-ps-46-1", kind: "bible", by: "Psalm 46:1", source: KJV, text: "God is our refuge and strength, a very present help in trouble." },
  { id: "kjv-lam-3-22", kind: "bible", by: "Lamentations 3:22–23", source: KJV, text: "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness." },
  { id: "kjv-prov-3-5", kind: "bible", by: "Proverbs 3:5–6", source: KJV, text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths." },
  { id: "kjv-ps-37-5", kind: "bible", by: "Psalm 37:5", source: KJV, text: "Commit thy way unto the LORD; trust also in him; and he shall bring it to pass." },
  { id: "kjv-isa-41-10", kind: "bible", by: "Isaiah 41:10", source: KJV, text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness." },
  { id: "kjv-matt-5-16", kind: "bible", by: "Matthew 5:16", source: KJV, text: "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven." },
  { id: "kjv-2tim-1-7", kind: "bible", by: "2 Timothy 1:7", source: KJV, text: "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind." },
  { id: "kjv-ps-90-17", kind: "bible", by: "Psalm 90:17", source: KJV, text: "And let the beauty of the LORD our God be upon us: and establish thou the work of our hands upon us; yea, the work of our hands establish thou it." },
  { id: "kjv-prov-27-17", kind: "bible", by: "Proverbs 27:17", source: KJV, text: "Iron sharpeneth iron; so a man sharpeneth the countenance of his friend." },
  { id: "kjv-ps-98-4", kind: "bible", by: "Psalm 98:4", source: KJV, text: "Make a joyful noise unto the LORD, all the earth: make a loud noise, and rejoice, and sing praise." },
  { id: "kjv-ps-100-1", kind: "bible", by: "Psalm 100:1–2", source: KJV, text: "Make a joyful noise unto the LORD, all ye lands. Serve the LORD with gladness: come before his presence with singing." },
  { id: "kjv-zeph-3-17", kind: "bible", by: "Zephaniah 3:17", source: KJV, text: "The LORD thy God in the midst of thee is mighty; he will save, he will rejoice over thee with joy; he will rest in his love, he will joy over thee with singing." },
  { id: "kjv-ps-96-1", kind: "bible", by: "Psalm 96:1", source: KJV, text: "O sing unto the LORD a new song: sing unto the LORD, all the earth." },
  { id: "kjv-ps-121-1", kind: "bible", by: "Psalm 121:1–2", source: KJV, text: "I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth." },
  { id: "kjv-ps-27-1", kind: "bible", by: "Psalm 27:1", source: KJV, text: "The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?" },
  { id: "kjv-isa-40-29", kind: "bible", by: "Isaiah 40:29", source: KJV, text: "He giveth power to the faint; and to them that have no might he increaseth strength." },
  { id: "kjv-matt-11-28", kind: "bible", by: "Matthew 11:28", source: KJV, text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." },
  { id: "kjv-jas-1-5", kind: "bible", by: "James 1:5", source: KJV, text: "If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him." },
  { id: "kjv-1thess-5-16", kind: "bible", by: "1 Thessalonians 5:16–18", source: KJV, text: "Rejoice evermore. Pray without ceasing. In every thing give thanks: for this is the will of God in Christ Jesus concerning you." },
  { id: "kjv-prov-15-1", kind: "bible", by: "Proverbs 15:1", source: KJV, text: "A soft answer turneth away wrath: but grievous words stir up anger." },
  { id: "kjv-ps-32-8", kind: "bible", by: "Psalm 32:8", source: KJV, text: "I will instruct thee and teach thee in the way which thou shalt go: I will guide thee with mine eye." },
  { id: "kjv-isa-26-3", kind: "bible", by: "Isaiah 26:3", source: KJV, text: "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee." },
  { id: "kjv-1cor-15-58", kind: "bible", by: "1 Corinthians 15:58", source: KJV, text: "Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord." },
  { id: "kjv-ps-57-8", kind: "bible", by: "Psalm 57:8", source: KJV, text: "Awake up, my glory; awake, psaltery and harp: I myself will awake early." },
  { id: "kjv-1pet-4-10", kind: "bible", by: "1 Peter 4:10", source: KJV, text: "As every man hath received the gift, even so minister the same one to another, as good stewards of the manifold grace of God." },
  { id: "kjv-ps-147-1", kind: "bible", by: "Psalm 147:1", source: KJV, text: "Praise ye the LORD: for it is good to sing praises unto our God; for it is pleasant; and praise is comely." },
  { id: "kjv-gal-6-2", kind: "bible", by: "Galatians 6:2", source: KJV, text: "Bear ye one another's burdens, and so fulfil the law of Christ." },

  // ── Music ───────────────────────────────────────────────────────────────
  { id: "longfellow-universal-language", kind: "music", by: "Henry Wadsworth Longfellow", source: "Outre-Mer (1835)", text: "Music is the universal language of mankind." },
  { id: "nietzsche-mistake", kind: "music", by: "Friedrich Nietzsche", source: "Twilight of the Idols (1889), trans. Walter Kaufmann", text: "Without music, life would be a mistake." },
  { id: "hugo-cannot-be-said", kind: "music", by: "Victor Hugo", source: "William Shakespeare (1864)", text: "Music expresses that which cannot be said and on which it is impossible to be silent." },
  { id: "casals-daily-progress", kind: "music", by: "Pablo Casals", source: "Letter at 70, quoted in The New York Times, Dec 29, 1946", text: "I feel that I am making daily progress." },
  { id: "suzuki-love-deep", kind: "music", by: "Shinichi Suzuki", source: "Nurtured by Love (1969)", text: "Where love is deep, much can be accomplished." },
  { id: "schumann-ear", kind: "music", by: "Robert Schumann", source: "Advice to Young Musicians (1850), trans. H. H. Pierson", text: "The cultivation of the Ear is of the greatest importance." },
  { id: "schumann-master", kind: "music", by: "Robert Schumann", source: "Advice to Young Musicians (1850), trans. H. H. Pierson", text: "Play always as if in the presence of a master." },
  { id: "schumann-easy-pieces", kind: "music", by: "Robert Schumann", source: "Advice to Young Musicians (1850), trans. H. H. Pierson", text: "Endeavour to play easy pieces well and with elegance; that is better than to play difficult pieces badly." },
  { id: "schumann-no-end", kind: "music", by: "Robert Schumann", source: "Advice to Young Musicians (1850), trans. H. H. Pierson", text: "There is no end of learning." },
  { id: "schumann-industry", kind: "music", by: "Robert Schumann", source: "Advice to Young Musicians (1850), trans. H. H. Pierson", text: "By means of industry and perseverance you will rise higher and higher." },
  { id: "schumann-choruses", kind: "music", by: "Robert Schumann", source: "Advice to Young Musicians (1850), trans. H. H. Pierson", text: "Frequently sing in choruses, especially the middle parts, this will help to make you a real musician." },
  { id: "aristotle-lyre", kind: "music", by: "Aristotle", source: "Nicomachean Ethics, Book II, trans. W. D. Ross", text: "For the things we have to learn before we can do them, we learn by doing them, e.g. men become builders by building and lyre-players by playing the lyre." },
  { id: "plato-rhythm-harmony", kind: "music", by: "Plato", source: "Republic, Book III, trans. Benjamin Jowett", text: "Musical training is a more potent instrument than any other, because rhythm and harmony find their way into the inward places of the soul…" },
  { id: "goethe-little-song", kind: "music", by: "Johann Wolfgang von Goethe", source: "Wilhelm Meister's Apprenticeship (1795), trans. Thomas Carlyle", text: "One ought, every day at least, to hear a little song, read a good poem, see a fine picture, and, if it were possible, to speak a few reasonable words." },
  { id: "thoreau-different-drummer", kind: "music", by: "Henry David Thoreau", source: "Walden (1854)", text: "If a man does not keep pace with his companions, perhaps it is because he hears a different drummer. Let him step to the music which he hears, however measured or far away." },
  { id: "wordsworth-solitary-reaper", kind: "music", by: "William Wordsworth", source: "The Solitary Reaper (1807)", text: "The music in my heart I bore, / Long after it was heard no more." },
  { id: "dickinson-hope", kind: "music", by: "Emily Dickinson", source: "“Hope” is the thing with feathers (pub. 1891)", text: "“Hope” is the thing with feathers – / That perches in the soul – / And sings the tune without the words – / And never stops – at all –" },
  { id: "mendelssohn-too-definite", kind: "music", by: "Felix Mendelssohn", source: "Letter to Marc-André Souchay (1842)", text: "The thoughts which are expressed to me by music that I love are not too indefinite to be put into words, but on the contrary, too definite." },
  { id: "bernstein-reply", kind: "music", by: "Leonard Bernstein", source: "Address after President Kennedy's death (Nov 25, 1963)", text: "This will be our reply to violence: to make music more intensely, more beautifully, more devotedly than ever before." },
  { id: "luther-music-praise", kind: "music", by: "Martin Luther", source: "Preface to Symphoniae iucundae (1538)", text: "Next to the Word of God, music deserves the highest praise." },
  { id: "emerson-iron-string", kind: "music", by: "Ralph Waldo Emerson", source: "Self-Reliance (1841)", text: "Trust thyself: every heart vibrates to that iron string." },

  // ── Teaching ────────────────────────────────────────────────────────────
  { id: "adams-eternity", kind: "teaching", by: "Henry Adams", source: "The Education of Henry Adams (1907)", text: "A teacher affects eternity; he can never tell where his influence stops." },
  { id: "seneca-learn-teach", kind: "teaching", by: "Seneca", source: "Letters to Lucilius, 7", text: "Men learn while they teach." },
  { id: "emerson-respecting-pupil", kind: "teaching", by: "Ralph Waldo Emerson", source: "Education (lecture, published 1883)", text: "The secret of education lies in respecting the pupil." },
  { id: "gibran-threshold", kind: "teaching", by: "Kahlil Gibran", source: "The Prophet (1923), On Teaching", text: "If he is indeed wise he does not bid you enter the house of his wisdom, but rather leads you to the threshold of your own mind." },
  { id: "gibran-work-love", kind: "teaching", by: "Kahlil Gibran", source: "The Prophet (1923), On Work", text: "Work is love made visible." },
  { id: "plutarch-kindling", kind: "teaching", by: "Plutarch", source: "On Listening to Lectures, trans. F. C. Babbitt (1927)", text: "For the mind does not require filling like a bottle, but rather, like wood, it only requires kindling to create in it an impulse to think independently and an ardent desire for the truth." },
  { id: "confucius-learn", kind: "teaching", by: "Confucius", source: "Analects 1.1, trans. James Legge", text: "Is it not pleasant to learn with a constant perseverance and application?" },
  { id: "newton-giants", kind: "teaching", by: "Isaac Newton", source: "Letter to Robert Hooke (1676)", text: "If I have seen further it is by standing on the shoulders of Giants." },
  { id: "durant-habit", kind: "teaching", by: "Will Durant, summing up Aristotle", source: "The Story of Philosophy (1926)", text: "We are what we repeatedly do. Excellence, then, is not an act but a habit." },
  { id: "wooden-quick", kind: "teaching", by: "John Wooden", source: "His coaching maxim", text: "Be quick, but don't hurry." },

  // ── Wisdom and perseverance ─────────────────────────────────────────────
  { id: "emerson-enthusiasm", kind: "wisdom", by: "Ralph Waldo Emerson", source: "Circles (1841)", text: "Nothing great was ever achieved without enthusiasm." },
  { id: "thoreau-dreams", kind: "wisdom", by: "Henry David Thoreau", source: "Walden (1854)", text: "If one advances confidently in the direction of his dreams, and endeavors to live the life which he has imagined, he will meet with a success unexpected in common hours." },
  { id: "keller-optimism", kind: "wisdom", by: "Helen Keller", source: "Optimism (1903)", text: "Optimism is the faith that leads to achievement. Nothing can be done without hope and confidence." },
  { id: "keller-overcoming", kind: "wisdom", by: "Helen Keller", source: "Optimism (1903)", text: "Although the world is full of suffering, it is full also of the overcoming of it." },
  { id: "roosevelt-work-worth-doing", kind: "wisdom", by: "Theodore Roosevelt", source: "Labor Day address, Syracuse (1903)", text: "Far and away the best prize that life offers is the chance to work hard at work worth doing." },
  { id: "washington-obstacles", kind: "wisdom", by: "Booker T. Washington", source: "Up from Slavery (1901)", text: "I have learned that success is to be measured not so much by the position that one has reached in life as by the obstacles which he has overcome while trying to succeed." },
  { id: "douglass-struggle", kind: "wisdom", by: "Frederick Douglass", source: "West India Emancipation speech (1857)", text: "If there is no struggle, there is no progress." },
  { id: "franklin-diligence", kind: "wisdom", by: "Benjamin Franklin", source: "Poor Richard's Almanack (1736)", text: "Diligence is the Mother of Good-Luck." },
  { id: "franklin-well-done", kind: "wisdom", by: "Benjamin Franklin", source: "Poor Richard's Almanack (1737)", text: "Well done is better than well said." },
  { id: "johnson-perseverance", kind: "wisdom", by: "Samuel Johnson", source: "Rasselas (1759)", text: "Few things are impossible to diligence and skill." },
  { id: "shakespeare-doubts", kind: "wisdom", by: "William Shakespeare", source: "Measure for Measure, Act 1, Scene 4", text: "Our doubts are traitors, / And make us lose the good we oft might win, / By fearing to attempt." },
  { id: "longfellow-psalm-of-life", kind: "wisdom", by: "Henry Wadsworth Longfellow", source: "A Psalm of Life (1838)", text: "Let us, then, be up and doing, / With a heart for any fate; / Still achieving, still pursuing, / Learn to labor and to wait." },
  { id: "browning-reach", kind: "wisdom", by: "Robert Browning", source: "Andrea del Sarto (1855)", text: "Ah, but a man's reach should exceed his grasp, / Or what's a heaven for?" },
  { id: "tennyson-ulysses", kind: "wisdom", by: "Alfred, Lord Tennyson", source: "Ulysses (1842)", text: "To strive, to seek, to find, and not to yield." },
  { id: "seneca-dare", kind: "wisdom", by: "Seneca", source: "Letters to Lucilius, 104", text: "It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult." },
  { id: "eroosevelt-cannot-do", kind: "wisdom", by: "Eleanor Roosevelt", source: "You Learn by Living (1960)", text: "You must do the thing you think you cannot do." },
  { id: "laozi-journey", kind: "wisdom", by: "Laozi", source: "Tao Te Ching, ch. 64 (common rendering)", text: "A journey of a thousand miles begins with a single step." },
];

const BY_ID = new Map(QUOTES.map((q) => [q.id, q]));
export const quoteById = (id: string) => BY_ID.get(id) ?? null;

/** Share of days each kind gets before any thumbs: about 35% Bible. */
export const BASE_SHARE: Record<QuoteKind, number> = {
  bible: 0.35,
  music: 0.3,
  teaching: 0.15,
  wisdom: 0.2,
};

export type HistoryRow = { quote_id: string; shown_on: string; vote: number | null };

/**
 * How much to lean toward or away from a kind of quote, from the user's
 * thumbs on that kind. Mostly thumbs down (2 or more, at least 4 in 5) stops
 * the kind altogether; each net thumbs up doubles it every two votes.
 */
export function kindFactor(ups: number, downs: number): number {
  if (downs >= 2 && downs >= 4 * ups) return 0;
  const net = ups - downs;
  return Math.min(4, Math.max(0.25, 2 ** (net / 2)));
}

/** Small, stable hash for picking the same quote all day. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Pick the quote for one day from what the user has seen and rated.
 * Quotes rated down never come back; quotes seen in the last 90 days are
 * skipped while there is anything else left in that kind.
 */
export function pickQuote(history: HistoryRow[], seed: string, today: string): Quote {
  const votes = new Map<QuoteKind, { ups: number; downs: number }>();
  const down = new Set<string>();
  const recent = new Set<string>();
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  for (const h of history) {
    const q = BY_ID.get(h.quote_id);
    if (!q) continue;
    if (h.shown_on >= cutoffISO) recent.add(q.id);
    if (!h.vote) continue;
    const v = votes.get(q.kind) ?? { ups: 0, downs: 0 };
    if (h.vote > 0) v.ups++;
    else {
      v.downs++;
      down.add(q.id);
    }
    votes.set(q.kind, v);
  }

  const kinds = Object.keys(BASE_SHARE) as QuoteKind[];
  const pools = new Map<QuoteKind, Quote[]>();
  for (const k of kinds) {
    const all = QUOTES.filter((q) => q.kind === k && !down.has(q.id));
    const fresh = all.filter((q) => !recent.has(q.id));
    pools.set(k, fresh.length > 0 ? fresh : all);
  }

  let weights = kinds.map((k) => {
    const v = votes.get(k) ?? { ups: 0, downs: 0 };
    return (pools.get(k)!.length > 0 ? 1 : 0) * BASE_SHARE[k] * kindFactor(v.ups, v.downs);
  });
  // Turned everything down: start over from the plain mix rather than show nothing.
  if (weights.every((w) => w === 0)) weights = kinds.map((k) => (pools.get(k)!.length > 0 ? BASE_SHARE[k] : 0));
  if (weights.every((w) => w === 0)) return QUOTES[Math.floor(hash(seed) * QUOTES.length)];

  const total = weights.reduce((a, b) => a + b, 0);
  let r = hash(`${seed}:kind`) * total;
  let kind = kinds[kinds.length - 1];
  for (let i = 0; i < kinds.length; i++) {
    if (weights[i] === 0) continue;
    if (r < weights[i]) {
      kind = kinds[i];
      break;
    }
    r -= weights[i];
  }
  let pool = pools.get(kind)!;
  if (pool.length === 0) pool = QUOTES.filter((q) => q.kind === kind);
  return pool[Math.floor(hash(`${seed}:quote`) * pool.length)];
}
