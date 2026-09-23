import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:{default:"Sankari Unified Platform",template:"%s · Sankari Holding"},description:"Sankari Holding internal systems platform"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning>{children}</body></html>}
