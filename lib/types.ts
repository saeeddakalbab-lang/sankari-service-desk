export const REQUEST_TYPES=["subscription_approval","helpdesk_ticket","email_account_request"] as const;
export type RequestType=typeof REQUEST_TYPES[number];
export const PRIORITIES=["low","medium","high","urgent"] as const;
export type Priority=typeof PRIORITIES[number];
export const ROLES=["employee","agent","admin","board","dev","accountant","ceo","owner","manager"] as const;
export type Role=typeof ROLES[number];
// Request types that travel Employee -> Manager -> CEO before fulfilment. Helpdesk and email accounts go straight to the agent queue.
export const APPROVAL_TYPES:readonly RequestType[]=["subscription_approval"];
// Read-only oversight: the stuck view and the IT KPI dashboard.
export const OVERSIGHT_ROLES:readonly Role[]=["ceo","board","owner","admin"];
export type Theme="light"|"dark"|"system";
export type Locale="en"|"ar";
// Written only by the database from approval_steps (derive_request_approval_status); never set by hand.
export const APPROVAL_STATUSES=["awaiting_approval","approved","rejected"] as const;
export const STATUS_BY_TYPE:Record<RequestType,readonly string[]>={
  subscription_approval:["new","awaiting_approval","pending_manager","pending_finance","approved","assigned","inprogress","rejected","cancelled","closed","reopened"],
  helpdesk_ticket:["new","assigned","inprogress","waiting","resolved","closed","reopened"],
  email_account_request:["new","awaiting_approval","approved","rejected","assigned","inprogress","waiting","provisioned","whatsapp_sent","confirmed","closed","reopened"]
};
export const CLOSED_BY_TYPE:Record<RequestType,readonly string[]>={subscription_approval:["approved","rejected","cancelled","closed"],helpdesk_ticket:["resolved","closed"],email_account_request:["provisioned","whatsapp_sent","confirmed","closed"]};
export const SLA_HOURS:Record<Priority,number>={urgent:4,high:24,medium:72,low:120};
export type User={id:string;email:string;name:string;image:string|null;roles:Role[]};
export type RequestRecord={id:string;type:RequestType;requester_user_id:string|null;requester_name:string;requester_email:string;department:string;company:string;subject:string;description:string;priority:Priority;status:string;assignee_id:string|null;assignee_name?:string|null;created_at:string;updated_at:string;sla_due_at:string;assigned_at:string|null;resolved_at:string|null;closed_at:string|null;reopened_at:string|null;details:Record<string,unknown>;import_source:string|null;import_id:string|null;approval_required:boolean;version:number};
export type ApprovalRole="manager"|"ceo";
export type ApprovalStep={id:string;request_id:string;step_no:number;approver_user_id:string;approver_role:ApprovalRole;approver_name:string;status:"waiting"|"approved"|"rejected"|"skipped";decided_at:string|null;comment:string|null;created_at:string;skipped_by_user_id?:string|null;skip_reason?:string|null;skipped_by_name?:string|null};
