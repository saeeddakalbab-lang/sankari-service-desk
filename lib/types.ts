export const REQUEST_TYPES=["subscription_approval","helpdesk_ticket","email_account_request"] as const;
export type RequestType=typeof REQUEST_TYPES[number];
export const PRIORITIES=["low","medium","high","urgent"] as const;
export type Priority=typeof PRIORITIES[number];
export const ROLES=["employee","agent","admin","board","dev"] as const;
export type Role=typeof ROLES[number];
export const STATUS_BY_TYPE:Record<RequestType,readonly string[]>={
  subscription_approval:["new","pending_manager","pending_finance","approved","rejected","cancelled","closed","reopened"],
  helpdesk_ticket:["new","assigned","inprogress","waiting","resolved","closed","reopened"],
  email_account_request:["new","assigned","inprogress","waiting","provisioned","whatsapp_sent","confirmed","closed","reopened"]
};
export const CLOSED_BY_TYPE:Record<RequestType,readonly string[]>={subscription_approval:["approved","rejected","cancelled","closed"],helpdesk_ticket:["resolved","closed"],email_account_request:["provisioned","whatsapp_sent","confirmed","closed"]};
export const SLA_HOURS:Record<Priority,number>={urgent:4,high:24,medium:72,low:120};
export type User={id:string;email:string;name:string;image:string|null;roles:Role[]};
export type RequestRecord={id:string;type:RequestType;requester_user_id:string|null;requester_name:string;requester_email:string;department:string;company:string;subject:string;description:string;priority:Priority;status:string;assignee_id:string|null;assignee_name?:string|null;created_at:string;updated_at:string;sla_due_at:string;assigned_at:string|null;resolved_at:string|null;closed_at:string|null;reopened_at:string|null;details:Record<string,unknown>;import_source:string|null;import_id:string|null;version:number};
