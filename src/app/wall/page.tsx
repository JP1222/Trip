import { redirect } from "next/navigation";

/** Cork wall lives at `/`; keep `/wall` as an alias. */
export default function WallAliasPage() {
  redirect("/");
}
