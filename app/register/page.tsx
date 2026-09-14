import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function RegisterPage() {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "localhost";
  const isTenantHost = host.split(".").length > 2 && !host.startsWith("www.");
  redirect(isTenantHost ? "/user/register" : "/onboarding");
}
