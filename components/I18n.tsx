"use client";
import { createContext,useContext,useMemo } from "react";
import { translator } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

const Ctx=createContext<Locale>("en");
export function I18nProvider({locale,children}:{locale:Locale;children:React.ReactNode}){return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;}
export function useLocale(){return useContext(Ctx);}
export function useT(){const locale=useContext(Ctx);return useMemo(()=>translator(locale),[locale]);}
