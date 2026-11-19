import { Select } from "@/components/ui";

// The teacher's time zone, as a plain list: the US zones first with everyday
// names, then every other zone the device knows.

const COMMON: [string, string][] = [
  ["America/New_York", "Eastern time (New York)"],
  ["America/Chicago", "Central time (Chicago)"],
  ["America/Denver", "Mountain time (Denver)"],
  ["America/Phoenix", "Arizona (Phoenix)"],
  ["America/Los_Angeles", "Pacific time (Los Angeles)"],
  ["America/Anchorage", "Alaska (Anchorage)"],
  ["Pacific/Honolulu", "Hawaii (Honolulu)"],
];

export function timeZones(current: string): [string, string][] {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  const named = new Map(COMMON);
  const list: [string, string][] = [...COMMON];
  for (const z of [current, ...all]) {
    if (z && !named.has(z)) {
      named.set(z, z.replace(/_/g, " "));
      list.push([z, z.replace(/_/g, " ")]);
    }
  }
  return list;
}

export function TimeZoneSelect({ value, name = "time_zone" }: { value: string; name?: string }) {
  return (
    <Select name={name} defaultValue={value}>
      {timeZones(value).map(([z, label]) => (
        <option key={z} value={z}>
          {label}
        </option>
      ))}
    </Select>
  );
}

/** A real IANA time zone name, else null. */
export function validTimeZone(zone: string): string | null {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}
