// WCAG 2 contrast maths for the admin-editable brand colour. Pure functions: safe on server and client.
export const HEX_RE=/^#[0-9A-Fa-f]{6}$/;
const WHITE="#FFFFFF",DARK_SURFACE="#1E1A16";

const channels=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const toHex=(c:number[])=>"#"+c.map(v=>Math.round(Math.min(255,Math.max(0,v))).toString(16).padStart(2,"0")).join("").toUpperCase();
export function luminance(hex:string){const [r,g,b]=channels(hex).map(v=>{const s=v/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;}
export function contrast(a:string,b:string){const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);}
// Rounded DOWN to one decimal so a colour that is 4.49:1 is never shown as passing "4.5:1".
export const ratioLabel=(r:number)=>(Math.floor(r*10)/10).toFixed(1);
export function mix(hex:string,other:string,t:number){const a=channels(hex),b=channels(other);return toHex(a.map((v,i)=>v+(b[i]-v)*t));}

export function checkAccent(hex:string){
  if(!HEX_RE.test(hex))return {ok:false as const,ratio:0,reason:"Use a 6-digit hex colour such as #B84F27."};
  const ratio=contrast(hex,WHITE);
  if(ratio<4.5)return {ok:false as const,ratio,reason:`White text on ${hex.toUpperCase()} is only ${ratioLabel(ratio)}:1. Buttons need at least 4.5:1. Pick a darker shade.`};
  return {ok:true as const,ratio,reason:null};
}

// The palette derived from one accent: light-mode fills, and a lighter variant that still reads on the dark surface.
export function accentPalette(hex:string){
  const accent=hex.toUpperCase();
  let t=0.3,dark=mix(accent,WHITE,t);
  while(contrast(dark,DARK_SURFACE)<4.5&&t<0.9){t+=0.05;dark=mix(accent,WHITE,t);}
  return {accent,strong:mix(accent,"#000000",0.22),soft:mix(accent,WHITE,0.86),dark,darkStrong:mix(dark,WHITE,0.25),darkSoft:mix(accent,DARK_SURFACE,0.78)};
}
