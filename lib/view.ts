import { cache } from "react";
import { currentUser } from "./auth";
import { translator } from "./i18n";
import { resolveView } from "./prefs";

// One lookup per request: who is viewing, their theme, language and the brand palette.
export const getViewer=cache(async()=>{
  const user=await currentUser();
  const view=await resolveView(user);
  return {user,...view,t:translator(view.locale),dir:view.locale==="ar"?"rtl" as const:"ltr" as const};
});

export { fmtDate,fmtDateTime,refFor } from "./format";
