import { redirect } from "next/navigation";
import { homeFor } from "@/lib/lines";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
// No login-type picker: the account's role decides the home screen.
export default async function Home(){const {user}=await getViewer();redirect(user?homeFor(user.roles):"/login");}
