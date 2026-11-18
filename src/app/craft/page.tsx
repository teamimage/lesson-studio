import { redirect } from "next/navigation";

// Craft now lives at the bottom of Downbeat; old links land there.
export default function CraftPage() {
  redirect("/downbeat#craft");
}
