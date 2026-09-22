import {ProtectedPage} from "@/components/ProtectedPage";import {Settings} from "@/components/Settings";
export const dynamic="force-dynamic";
export default function Page(){return <ProtectedPage roles={["admin"]}><div className="heading"><div><div className="eyebrow">Administration</div><h1>Access and operations.</h1><p>Assign roles after a user signs in and watch integration health.</p></div></div><Settings/></ProtectedPage>}
