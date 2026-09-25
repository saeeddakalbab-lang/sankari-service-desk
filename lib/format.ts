// All request timestamps render in one fixed, LTR format so columns line up in both languages.
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// Built by hand: ICU versions disagree on "Sep" vs "Sept", and the column must not change width between servers.
export const fmtDate=(d:string|Date|null|undefined)=>{if(!d)return "";const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"numeric",year:"numeric",timeZone:"Asia/Dubai"}).formatToParts(new Date(d)).map(x=>[x.type,x.value]));return `${p.day} ${MONTHS[Number(p.month)-1]} ${p.year}`;};
export const fmtDateTime=(d:string|Date|null|undefined)=>d?`${fmtDate(d)} · ${new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Dubai"}).format(new Date(d))}`:"";
export const refFor=(type:string,id:string,created:string)=>`${type==="subscription_approval"?"SUB":type==="email_account_request"?"EML":"HLP"}-${new Date(created).getUTCFullYear()}-${id.slice(0,4).toUpperCase()}`;
