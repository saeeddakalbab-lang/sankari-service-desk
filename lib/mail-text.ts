// The words of every request email, in English and Arabic. Callers name a message and pass its
// values; the recipient's own portal language picks the version. {name} is replaced by the value.
import type { Locale } from "./types";

type Text = { title: string; body: string };
const M = {
  received:            { en: { title: "Request received", body: "Your request was received and is now with the IT team." }, ar: { title: "تم استلام طلبك", body: "استلمنا طلبك، وهو الآن لدى فريق تقنية المعلومات." } },
  receivedApproval:    { en: { title: "Request received", body: "Your request was received and is waiting for approval from {approver}." }, ar: { title: "تم استلام طلبك", body: "استلمنا طلبك، وهو بانتظار موافقة {approver}." } },
  approvalNeeded:      { en: { title: "Approval needed", body: "{requester} submitted a request that needs your decision." }, ar: { title: "مطلوب موافقتك", body: "قدّم {requester} طلبًا يحتاج إلى قرارك." } },
  approvalNeededNext:  { en: { title: "Approval needed", body: "{requester}'s request was approved by {by} and now needs your decision." }, ar: { title: "مطلوب موافقتك", body: "وافق {by} على طلب {requester}، وهو الآن بانتظار قرارك." } },
  approvalNeededSkip:  { en: { title: "Approval needed", body: "{requester}'s request reached you after {skipped} was skipped. Reason: {reason}" }, ar: { title: "مطلوب موافقتك", body: "وصل إليك طلب {requester} بعد تخطي {skipped}. السبب: {reason}" } },
  newRequest:          { en: { title: "New request", body: "{requester} submitted a new request." }, ar: { title: "طلب جديد", body: "قدّم {requester} طلبًا جديدًا." } },
  assigned:            { en: { title: "Request assigned to you", body: "This request is now yours to work on." }, ar: { title: "أُسند إليك طلب", body: "هذا الطلب أصبح من مسؤوليتك الآن." } },
  resolved:            { en: { title: "Your request is {status}", body: "The IT team marked your request as {status}. If something is still wrong, reply in the portal and it will be reopened." }, ar: { title: "طلبك: {status}", body: "غيّر فريق تقنية المعلومات حالة طلبك إلى: {status}. إذا بقيت المشكلة، اكتب تعليقًا في البوابة ليُعاد فتح الطلب." } },
  comment:             { en: { title: "New comment from {author}", body: "{author} added a comment on your request." }, ar: { title: "تعليق جديد من {author}", body: "أضاف {author} تعليقًا على الطلب." } },
  rejected:            { en: { title: "Request rejected", body: "{by} rejected your request. Reason: {reason}" }, ar: { title: "رُفض طلبك", body: "رفض {by} طلبك. السبب: {reason}" } },
  progressed:          { en: { title: "Approval progressed", body: "{by} approved your request. It is now with {next}." }, ar: { title: "تقدّمت الموافقة", body: "وافق {by} على طلبك، وهو الآن لدى {next}." } },
  approvedAll:         { en: { title: "Request approved", body: "Every approver has approved your request. It is now with the IT team." }, ar: { title: "تمت الموافقة على طلبك", body: "وافق جميع المعتمدين على طلبك، وهو الآن لدى فريق تقنية المعلومات." } },
  fulfil:              { en: { title: "Approved request ready for IT", body: "{requester}'s request passed the approval line and is ready to be carried out." }, ar: { title: "طلب معتمد جاهز للتنفيذ", body: "اجتاز طلب {requester} خط الموافقات، وهو جاهز للتنفيذ." } },
  skipped:             { en: { title: "Approver skipped", body: "{by} skipped {skipped}, who had not answered. Reason: {reason}" }, ar: { title: "تم تخطي معتمد", body: "تخطى {by} المعتمد {skipped} لعدم الرد. السبب: {reason}" } },
  started:             { en: { title: "Work has started", body: "{by} has started working on your ticket." }, ar: { title: "بدأ العمل على طلبك", body: "بدأ {by} العمل على تذكرتك." } },
  closedByIt:          { en: { title: "Ticket closed", body: "{by} closed your ticket without action. Reason: {reason}" }, ar: { title: "أُغلقت التذكرة", body: "أغلق {by} تذكرتك دون تنفيذ. السبب: {reason}" } },
  slaOverdue:          { en: { title: "Overdue", body: "This request is past its target time." }, ar: { title: "طلب متأخر", body: "تجاوز هذا الطلب الوقت المستهدف لإنجازه." } },
  slaWarning:          { en: { title: "Due soon", body: "This request is due within two hours." }, ar: { title: "طلب يقترب موعده", body: "يجب إنجاز هذا الطلب خلال ساعتين." } },
  newTicket:           { en: { title: "New helpdesk ticket", body: "" }, ar: { title: "تذكرة دعم فني جديدة", body: "" } },
} satisfies Record<string, Record<Locale, Text>>;
export type MailKey = keyof typeof M;
export type MailMsg = { k: MailKey; p?: Record<string, string> };

const L = {
  en: { reference: "Reference", type: "Type", requester: "Requested by", company: "Company", priority: "Priority", status: "Status", assignee: "Assigned to", due: "Due", submitted: "Submitted", category: "Category", asset: "Asset tag", description: "Description", comment: "Comment", unassigned: "Not assigned yet", open: "Open request", start: "Start", reject: "Reject", footer: "Sankari Holding · IT", links: "Each button works once, only for you, for 72 hours, and asks you to confirm in the portal before anything changes.", openTicket: "Open the ticket" },
  ar: { reference: "المرجع", type: "النوع", requester: "مقدّم الطلب", company: "الشركة", priority: "الأولوية", status: "الحالة", assignee: "المسؤول", due: "موعد الإنجاز", submitted: "تاريخ التقديم", category: "الفئة", asset: "رقم الجهاز", description: "الوصف", comment: "التعليق", unassigned: "لم يُسند بعد", open: "فتح الطلب", start: "بدء العمل", reject: "رفض", footer: "سنكري القابضة · تقنية المعلومات", links: "يعمل كل زر مرة واحدة، لك وحدك، خلال 72 ساعة، ويطلب منك التأكيد في البوابة قبل أي تغيير.", openTicket: "فتح التذكرة" },
} satisfies Record<Locale, Record<string, string>>;
export type Labels = typeof L.en;

const fill = (s: string, p: Record<string, string> = {}) => s.replace(/\{(\w+)\}/g, (_, v) => p[v] ?? "");
export function mailText(msg: MailMsg, locale: Locale): Text { const t = M[msg.k][locale] ?? M[msg.k].en; return { title: fill(t.title, msg.p), body: fill(t.body, msg.p) }; }
export const labels = (locale: Locale): Labels => L[locale] ?? L.en;
