import {ProtectedPage} from "@/components/ProtectedPage";import {KpiDashboard} from "@/components/KpiDashboard";
export const dynamic="force-dynamic";
export default function KPI(){return <ProtectedPage roles={["board","admin"]}><div className="heading"><div><div className="eyebrow">Board intelligence</div><h1>Live operating picture.</h1><p>Request volume, service levels and workload across the holding.</p></div></div><KpiDashboard/></ProtectedPage>}
