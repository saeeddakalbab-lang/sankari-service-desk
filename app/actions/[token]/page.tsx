import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionConfirm } from "@/components/ActionConfirm";
import { ProtectedPage } from "@/components/ProtectedPage";
import { inspectLink } from "@/lib/actions";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
// The token is in the path; never send it on to another site in a Referer header.
export const metadata: Metadata = { title: "Email action", referrer: "no-referrer", robots: { index: false, follow: false } };

// Opening an email link only shows what it would do. Nothing changes until the form is submitted (POST).
export default async function ActionPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, { user }] = await Promise.all([params, getViewer()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/actions/${token}`)}`);
  const info = await inspectLink(token, user);
  return <ProtectedPage><ActionConfirm token={token} info={JSON.parse(JSON.stringify(info))} /></ProtectedPage>;
}
