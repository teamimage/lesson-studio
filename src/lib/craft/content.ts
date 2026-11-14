// Craft: the teacher's own improvement section. Everything here is fixed,
// checked content that ships with the app (like the daily quotes), not
// generated per teacher. Rules for anything added here:
//   - Our own words. Never copy a published article, book or method text.
//   - A research claim names its source, and the source was read, not
//     remembered. Where the research is thin, the text says it is our
//     practical suggestion instead.
//   - Teacher-only. Nothing here is shown to families.

export type Source = { label: string; url: string };

export type Instrument = "all" | "strings" | "piano";

export const SOURCES = {
  hattie: {
    label: "Hattie & Timperley (2007), The Power of Feedback, Review of Educational Research 77(1), 81–112",
    url: "https://doi.org/10.3102/003465430298487",
  },
  dweck: {
    label: "Mueller & Dweck (1998), Praise for intelligence can undermine children's motivation and performance, Journal of Personality and Social Psychology 75(1), 33–52",
    url: "https://www.columbia.edu/cu/psychology/courses/3615/Readings/Mueller_Dweck.pdf",
  },
  dukeSimmons: {
    label: "Duke & Simmons (2006), The nature of expertise: 19 common elements in the lessons of three renowned artist-teachers, Bulletin of the Council for Research in Music Education 170, 1–13",
    url: "https://cml.music.utexas.edu/online-resources/the-nature-of-expertise",
  },
  dukeSimmonsResults: {
    label: "Duke & Simmons (2006), the elements described, with lesson video",
    url: "https://cml.music.utexas.edu/online-resources/the-nature-of-expertise/results-and-video-recordings",
  },
  dukeHenninger: {
    label: "Duke & Henninger (2002), Teachers' verbal corrections and observers' perceptions of teaching and learning, Journal of Research in Music Education 50(1), 75–87",
    url: "https://scholars.ttu.edu/en/publications/teachers-verbal-corrections-and-observers-perceptions-of-teaching",
  },
} satisfies Record<string, Source>;

/** What a program's numbers are, read from lesson transcripts. */
export type MetricKey = "barePraise" | "teacherShare" | "questions";

export type ProgramDay = {
  title: string;
  /** Two-minute read: two or three short paragraphs. */
  read: string[];
  /** One thing to try in today's lessons (or the next one). */
  tryThis: string;
  sources?: Source[];
};

export type Program = {
  slug: string;
  name: string;
  /** One line for lists. */
  line: string;
  days: ProgramDay[];
  /** The number that should move, and which way is better. */
  metric: MetricKey;
  better: "lower" | "higher";
  /** Shown beside the number, in plain words. */
  metricHelp: string;
};

export const PROGRAMS: Program[] = [
  {
    slug: "name-what-was-good",
    name: "Name what was good",
    line: "Praise that says what worked, so the student can do it again.",
    metric: "barePraise",
    better: "lower",
    metricHelp:
      "Of the times you praised, how often it was only a word like \"good\" or \"nice\" with nothing about what was good. Counted from the words in the transcript, so treat it as a trend, not an exact count.",
    days: [
      {
        title: "\"Good\" on its own carries almost nothing",
        read: [
          "A large review of feedback research found that praise on its own had one of the smallest effects on learning of any kind of feedback. What helped was information about the task: what was done well, what to change, and what to do next.",
          "Praise is not the problem. Empty praise is. \"Good\" tells the student you are pleased; it does not tell them what to repeat.",
        ],
        tryThis:
          "Every time you hear yourself say \"good\" today, finish the sentence with what was good: \"Good, the last note was in tune.\"",
        sources: [SOURCES.hattie],
      },
      {
        title: "What three master teachers did with praise",
        read: [
          "Researchers filmed about 25 hours of lessons by three renowned teachers (piano, viola, oboe). Praise was rare, but when it came it was emphatic, detailed and often repeated, usually after a real achievement. Specific corrections were far more common.",
          "Their students were advanced, from high school to doctoral level, so a young child needs more encouragement than this. The part that carries over to every age is the detail: when they praised, the student knew exactly what for.",
        ],
        tryThis: "Choose one moment per piece that truly deserves praise, and make that praise detailed rather than quick.",
        sources: [SOURCES.dukeSimmons, SOURCES.dukeSimmonsResults],
      },
      {
        title: "Praise the work, not the child",
        read: [
          "In a well-known set of experiments, children praised for being smart chose easier tasks afterwards and did worse after a setback than children praised for their effort and approach.",
          "In a lesson that means praising what the student did (slowed down, listened, tried the fingering you showed) rather than who they are (talented, a natural, so musical).",
        ],
        tryThis: "Replace any \"you're so talented\" today with what they did that worked: \"You slowed down before the hard bar, and it paid off.\"",
        sources: [SOURCES.dweck],
      },
      {
        title: "Tie the praise to the sound",
        read: [
          "In the master teachers' lessons, technique was always connected to what it did to the sound. A movement was never right in the abstract; it was right because of what the listener heard.",
          "Praise can do the same: name the sound, then what made it.",
        ],
        tryThis: "Use the pattern \"That sounded ___ because you ___\" at least three times today.",
        sources: [SOURCES.dukeSimmonsResults],
      },
      {
        title: "Let them name it first",
        read: [
          "The master teachers made very fine distinctions about playing, and expected students to learn to make them too and to say them out loud.",
          "When a student can say what was good, they can hear it in their own practice, when you are not there.",
        ],
        tryThis: "After a good attempt, ask \"What was better that time?\" before you say anything. Then confirm or add one detail.",
        sources: [SOURCES.dukeSimmonsResults],
      },
      {
        title: "Corrections: say what to do next",
        read: [
          "One study compared two versions of the same lesson: one where corrections described what was wrong with the last attempt, and one where they only said what to do on the next attempt. Observers rated both lessons about the same and rarely noticed the teacher's feedback at all; they noticed the playing.",
          "Our reading: since neither style cost anything in how the lesson felt, use the shorter one. \"Next time, keep the bow near the bridge\" does the job of \"that was scratchy\" plus an instruction.",
        ],
        tryThis: "Phrase each correction today as an instruction for the next try, not a verdict on the last one.",
        sources: [SOURCES.dukeHenninger],
      },
      {
        title: "Look back and choose what to keep",
        read: [
          "Compare your number below with where you started, and how many recorded lessons it rests on. A change across one or two lessons can be chance; across five or more it is more likely to be you.",
          "Pick the one sentence pattern from this week that felt most natural, and keep using it.",
        ],
        tryThis: "Write down the praise sentence you want to keep, and use it in your next lesson.",
      },
    ],
  },
  {
    slug: "ask-before-you-tell",
    name: "Ask before you tell",
    line: "Shorter turns and more questions, so the student learns to hear their own playing.",
    metric: "teacherShare",
    better: "lower",
    metricHelp:
      "Your share of all the words spoken in the lesson. The teacher is taken to be whoever spoke the most. Playing isn't counted, only talking. Treat it as a trend.",
    days: [
      {
        title: "The most useful feedback teaches self-checking",
        read: [
          "A large review of feedback research describes feedback at several levels. The ones that last are about how the student works and how they check their own work, not only whether this attempt was right.",
          "A question like \"How was that?\" asks the student to do the checking. Telling them does it for them.",
        ],
        tryThis: "After each run-through today, ask \"How was that?\" before you say anything.",
        sources: [SOURCES.hattie],
      },
      {
        title: "Ask choice questions",
        read: [
          "Young students often answer \"good\" to an open question. A choice is easier to answer honestly: \"Was the second time smoother, or the first?\"",
          "This is our practical suggestion rather than a research finding. It builds the same habit the master teachers relied on: students learning to make fine distinctions and say them.",
        ],
        tryThis: "Ask at least three either/or questions about sound today.",
        sources: [SOURCES.dukeSimmonsResults],
      },
      {
        title: "Wait for the answer",
        read: [
          "A question only works if there is room to answer it. Many teachers, wanting to help, answer their own question within a second or two.",
          "This is a practical suggestion, not a measured finding from these sources. The app can't yet measure silences in your lessons, because counting and cueing while a student plays fills the gaps.",
        ],
        tryThis: "After each question, count three slowly in your head before you speak again.",
      },
      {
        title: "Short turns",
        read: [
          "The master teachers' lessons moved fast: short alternating turns between teacher and student, with brief, direct feedback, and only an occasional pause for a story or demonstration.",
          "Long explanations slow that rhythm and leave less time for playing.",
        ],
        tryThis: "Keep each instruction to one sentence, then have the student play.",
        sources: [SOURCES.dukeSimmonsResults],
      },
      {
        title: "Ask about the sound",
        read: [
          "Questions about facts (\"What's the key signature?\") test memory. Questions about sound (\"What happened to the tone at the end of the phrase?\") train listening.",
          "In the master teachers' lessons, technique was always tied to its effect on the sound, and students were asked to put what they heard into words.",
        ],
        tryThis: "Ask at least one \"What did you hear?\" question for each piece.",
        sources: [SOURCES.dukeSimmonsResults],
      },
      {
        title: "Let them choose the next step",
        read: [
          "The same feedback review frames good feedback as three questions: Where am I going? How am I going? Where to next?",
          "A student who can answer \"Where to next?\" for themselves arrives at home practice with a plan.",
        ],
        tryThis: "End each piece by asking \"What will you work on in this one this week?\" and write their answer in the lesson notes.",
        sources: [SOURCES.hattie],
      },
      {
        title: "Look back and choose what to keep",
        read: [
          "Compare your share of the words below with where you started, and how many recorded lessons it rests on. In Suzuki lessons a parent may also talk, which moves the number; that's fine as long as it's the student and parent doing more of the thinking.",
          "Choose the question that got the best answers this week, and keep it.",
        ],
        tryThis: "Write down the one question you want to keep asking, and use it in your next lesson.",
      },
    ],
  },
];

export type Article = {
  slug: string;
  title: string;
  instrument: Instrument;
  minutes: number;
  summary: string;
  body: string[];
  sources: Source[];
};

export const ARTICLES: Article[] = [
  {
    slug: "what-master-teachers-share",
    title: "What three master teachers had in common",
    instrument: "all",
    minutes: 4,
    summary: "A pianist, a violist and an oboist, filmed for 25 hours. The same habits showed up in all three.",
    body: [
      "In a study published in 2006, researchers at the University of Texas filmed about 25 hours of private lessons by three renowned teachers: Nelita True (piano), Donald McInnes (viola) and Richard Killmer (oboe). They then looked for what all three did. They found 19 elements, grouped as goals and expectations, how the teachers brought about change, and how they conveyed information.",
      "Some of the elements most useful for any studio:",
      "They insisted on good sound every time. A passage was repeated until the technique and tone were right in context, and recurring sound problems were raised again and again rather than let go.",
      "Errors stopped the playing at once. Flaws in basic technique took priority over everything else and were repeated until fixed. Otherwise, pieces were played from beginning to end, like a performance.",
      "The pace was fast. Turns between teacher and student were short, feedback was brief and direct, and breaks for a story or a demonstration were occasional and well timed.",
      "Criticism was frequent, specific and short. Praise was rare, but emphatic and detailed when it came.",
      "They compared playing with earlier lessons, pointing out what had improved and what had slipped.",
      "Every physical movement was connected to its effect on the sound.",
      "A caution before copying all of this: the students ranged from high school to doctoral level. A seven-year-old needs a warmer ratio of praise to correction. What carries over to every age is the precision: specific goals, specific feedback, and lots of playing.",
    ],
    sources: [SOURCES.dukeSimmons, SOURCES.dukeSimmonsResults],
  },
  {
    slug: "praise-that-teaches",
    title: "Praise that teaches",
    instrument: "all",
    minutes: 3,
    summary: "Why \"good job\" does little, and the two changes to praise that research supports.",
    body: [
      "In their review of feedback research, Hattie and Timperley found that praise on its own had a small average effect on learning, much smaller than feedback about the task and about how the student is working. Praise is not harmful in itself; it just carries little information.",
      "Two changes make praise do more.",
      "First, say what was good. \"Good\" tells the student you are pleased. \"Good, your bow stayed straight\" tells them what to do again.",
      "Second, praise the work, not the person. In Mueller and Dweck's experiments, children praised for being smart later chose easier problems and did worse after a setback than children praised for effort. In a lesson, that means praising the slowing down, the careful listening or the new fingering, not the talent.",
      "The same applies to corrections. In a study of music lessons, observers barely noticed whether corrections described the last attempt or directed the next one. Phrasing them as the next instruction is simply shorter.",
      "The Focus program \"Name what was good\" turns these into seven small daily habits, and shows you from your own recorded lessons how often your praise says what was good.",
    ],
    sources: [SOURCES.hattie, SOURCES.dweck, SOURCES.dukeHenninger],
  },
  {
    slug: "strings-sound-first",
    title: "Strings: sound first",
    instrument: "strings",
    minutes: 3,
    summary: "How the master teachers tied every motion to the tone, and how to do it with young string players.",
    body: [
      "Of the three master teachers in the University of Texas study, one was a violist, Donald McInnes. A thread through all three teachers' lessons was that technique was never right in the abstract: every movement was linked to what it did to the sound.",
      "For string players this is a natural fit. Tone comes from three things the student controls with the bow: how fast it moves, how much weight is in it, and where it touches the string between the bridge and the fingerboard. When a sound is wrong, one of those three is usually the reason.",
      "So instead of \"keep your bow straight\", try connecting it to the result: \"When the bow drifts toward the fingerboard, the sound gets thin. Keep it in the middle lane and listen.\" Then ask the student to play it both ways and say which sounded better.",
      "The master teachers also returned to the same sound problem lesson after lesson, rather than mentioning it once and moving on. A recurring scratch or whistle deserves the same patience.",
      "This article is written for the app from the published study and standard string teaching; it is not a method. Your own method and your students' ages come first.",
    ],
    sources: [SOURCES.dukeSimmons, SOURCES.dukeSimmonsResults],
  },
  {
    slug: "piano-whole-pieces",
    title: "Piano: whole pieces, then detail",
    instrument: "piano",
    minutes: 3,
    summary: "Play it through like a performance, stop for what matters, compare with last week.",
    body: [
      "One of the three master teachers in the University of Texas study was the pianist Nelita True. Three habits shared by all three teachers fit a piano lesson well.",
      "Pieces were played from beginning to end, treated like a performance, and stopped only for errors. That tells the student the piece is meant to be whole, not a set of fragments.",
      "When an error happened, the playing stopped at once, and anything wrong in basic technique came first. For a young pianist that usually means hand shape, finger independence or a steady pulse before expression.",
      "They compared playing with earlier lessons, pointing out what had improved and what had slipped. The lesson record in this app gives you last week's notes on the same page, which makes that comparison easy.",
      "A caution: their students were from high school to doctoral level. With young pianists, a full run-through might be eight bars, and the stops should be few enough that the child still gets to finish.",
    ],
    sources: [SOURCES.dukeSimmons, SOURCES.dukeSimmonsResults],
  },
];

export const programBySlug = (slug: string) => PROGRAMS.find((p) => p.slug === slug) ?? null;
export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug) ?? null;
