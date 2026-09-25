import Image from "next/image";

// The official Sankari Holding mark (chevron over SANKARI / HOLDING), from the two PNGs in public/.
// tone="auto" follows the theme: the dark mark on light grounds, the white mark in dark mode.
// tone="white" is for dark panels (sign-in story, public header); tone="dark" for print.
export function Logo({ tone = "auto", width = 100 }: { tone?: "auto" | "dark" | "white"; width?: number }) {
  const h = Math.round(width * 256 / 336);
  const img = (src: string, cls: string) => <Image src={src} alt="Sankari Holding" width={width} height={h} className={cls} priority unoptimized />;
  if (tone === "white") return img("/logo-white.png", "logo");
  if (tone === "dark") return img("/logo-dark.png", "logo");
  return <>{img("/logo-dark.png", "logo logo-light")}{img("/logo-white.png", "logo logo-dark")}</>;
}
