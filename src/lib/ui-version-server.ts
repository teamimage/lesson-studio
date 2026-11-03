import "server-only";
import { cookies } from "next/headers";
import { UI_COOKIE, parseUiVersion, type UiVersion } from "@/lib/ui-version";

/** Which app version this request shows. Call only inside a Suspense'd (dynamic) component. */
export async function getUiVersion(): Promise<UiVersion> {
  const jar = await cookies();
  return parseUiVersion(jar.get(UI_COOKIE)?.value);
}
