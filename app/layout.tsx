import type { Metadata } from "next";
import { IBM_Plex_Mono,IBM_Plex_Sans_Arabic,Jost,Zilla_Slab } from "next/font/google";
import { I18nProvider } from "@/components/I18n";
import { getViewer } from "@/lib/view";
import "./globals.css";

// Fonts are bundled at build time: the CSP allows fonts from this site only.
const display=Zilla_Slab({subsets:["latin"],weight:["500","600","700"],variable:"--font-display",display:"swap"});
const body=Jost({subsets:["latin"],weight:["400","500","600","700"],variable:"--font-body",display:"swap"});
const mono=IBM_Plex_Mono({subsets:["latin"],weight:["400","500"],variable:"--font-mono",display:"swap"});
const arabic=IBM_Plex_Sans_Arabic({subsets:["arabic"],weight:["400","500","600","700"],variable:"--font-arabic",display:"swap"});

export const metadata:Metadata={title:{default:"Sankari IT portal",template:"%s · Sankari Holding"},description:"Sankari Holding IT requests, approvals and KPIs",icons:{icon:"/logo-dark.png",apple:"/logo-dark.png"}};

export default async function RootLayout({children}:{children:React.ReactNode}){
  const v=await getViewer(),p=v.palette;
  // Hex values come from checkAccent/accentPalette, never raw user text.
  // --brand-deep never changes with the theme: it sits behind white text on the sign-in panel.
  const accentCss=`:root{--accent:${p.accent};--accent-strong:${p.strong};--accent-soft:${p.soft};--accent-ink:${p.strong};--brand-deep:${p.strong}}`+
    `:root[data-theme=dark]{--accent:${p.dark};--accent-strong:${p.darkStrong};--accent-soft:${p.darkSoft};--accent-ink:${p.dark}}`+
    `@media (prefers-color-scheme:dark){:root[data-theme=system]{--accent:${p.dark};--accent-strong:${p.darkStrong};--accent-soft:${p.darkSoft};--accent-ink:${p.dark}}}`;
  return <html lang={v.locale} dir={v.dir} data-theme={v.theme} className={`${display.variable} ${body.variable} ${mono.variable} ${arabic.variable}`} suppressHydrationWarning>
    <head><style dangerouslySetInnerHTML={{__html:accentCss}}/></head>
    <body><I18nProvider locale={v.locale}>{children}</I18nProvider></body>
  </html>;
}
