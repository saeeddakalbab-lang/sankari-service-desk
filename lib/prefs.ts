import { cookies } from "next/headers";
import { accentPalette } from "./color";
import { query } from "./db";
import { getAppearance, THEMES } from "./settings";
import type { Locale, Theme, User } from "./types";

export const LOCALES:readonly Locale[]=["en","ar"];
// Cookies only carry the choice to the sign-in page, where there is no user yet. The saved value lives in users.
export const THEME_COOKIE="sk_theme",LOCALE_COOKIE="sk_locale";

// What the <html> element needs: the viewer's saved choice, else a cookie (sign-in page), else the platform default.
export async function resolveView(user:User|null){
  const [{accentHex,defaultTheme},jar]=await Promise.all([getAppearance(),cookies()]);
  let theme:Theme|null=null,locale:Locale|null=null;
  if(user){try{const r=await query<{preferred_theme:Theme|null;preferred_locale:Locale|null}>(`SELECT preferred_theme,preferred_locale FROM users WHERE id=$1`,[user.id]);theme=r.rows[0]?.preferred_theme??null;locale=r.rows[0]?.preferred_locale??null;}catch{}}
  const ct=jar.get(THEME_COOKIE)?.value as Theme,cl=jar.get(LOCALE_COOKIE)?.value as Locale;
  theme=theme??(THEMES.includes(ct)?ct:defaultTheme);
  locale=locale??(LOCALES.includes(cl)?cl:"en");
  return {theme,locale,palette:accentPalette(accentHex),defaultTheme};
}
