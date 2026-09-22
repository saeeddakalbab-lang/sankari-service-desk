import {ProtectedPage} from "@/components/ProtectedPage";import {JiraDashboard} from "@/components/JiraDashboard";
export const dynamic="force-dynamic";
export default function Jira(){return <ProtectedPage roles={["dev","admin"]}><div className="heading"><div><div className="eyebrow">Development operations</div><h1>Jira, without the noise.</h1><p>A read-only view of the projects and tasks configured for your team.</p></div><span className="badge">5–10 min sync</span></div><JiraDashboard/></ProtectedPage>}
