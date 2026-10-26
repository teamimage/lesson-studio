export function Avatar({ name, instrument }: { name: string; instrument: string }) {
  const icon = instrument === "piano" ? "🎹" : instrument === "cello" || instrument === "violin" || instrument === "viola" ? "🎻" : instrument === "guitar" ? "🎸" : instrument === "voice" ? "🎤" : "🎵";
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-2xl"
      aria-label={`${name}, ${instrument}`}
    >
      {icon}
    </div>
  );
}
