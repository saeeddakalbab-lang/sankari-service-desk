import type { LineInput } from "@/components/ApprovalLine";
import type { ApprovalStep, RequestRecord } from "./types";

// Serializable input for the approval-line component, built on the server.
export function lineFor(r:RequestRecord,steps:ApprovalStep[]=[]):LineInput{
  return {
    approvalRequired:r.approval_required,status:r.status,finished:!!(r.resolved_at||r.closed_at),requesterName:r.requester_name,createdAt:String(r.created_at),
    steps:steps.map(s=>({approver_name:s.approver_name,approver_role:s.approver_role,status:s.status,decided_at:s.decided_at?String(s.decided_at):null,skipped_by_name:s.skipped_by_name??null,skip_reason:s.skip_reason??null})),
  };
}

// Where each role lands after signing in.
export function homeFor(roles:string[]){
  if(roles.includes("ceo"))return "/approvals";
  if(roles.includes("board")||roles.includes("owner"))return "/dashboard/kpi";
  if(roles.includes("agent")||roles.includes("admin"))return "/admin";
  return "/portal";
}
