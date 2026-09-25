import { MySettings } from "@/components/MySettings";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function Settings(){const {theme,locale}=await getViewer();return <ProtectedPage><MySettings theme={theme} locale={locale}/></ProtectedPage>;}
