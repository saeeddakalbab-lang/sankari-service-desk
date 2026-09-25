// Money is integer minor units (cents); shares are integer basis points. No floats anywhere.
export type InstallmentSplit={firstCents:bigint;secondCents:bigint;finalCents:bigint};
// Mirrors SQL installment_split(): first and second round down, the final installment is the residual,
// so the three always sum exactly to the total.
export function splitInstallments(totalCents:bigint,firstBps:number,secondBps:number):InstallmentSplit{
  if(totalCents<0n)throw new Error("Contract total cannot be negative");
  if(!Number.isInteger(firstBps)||!Number.isInteger(secondBps)||firstBps<0||secondBps<0||firstBps+secondBps>10000)throw new Error("Installment shares must be whole basis points totalling at most 10000");
  const firstCents=totalCents*BigInt(firstBps)/10000n,secondCents=totalCents*BigInt(secondBps)/10000n;
  return {firstCents,secondCents,finalCents:totalCents-firstCents-secondCents};
}
// USD cents -> AED cents at a decimal rate string ("3.6725"), exact integer maths, half-up.
export function usdToAedCents(usdCents:bigint,rate:string):bigint{
  const [whole,frac=""]=rate.split("."),scale=10n**BigInt(frac.length),r=BigInt(whole+frac);
  return (usdCents*r*2n+scale)/(2n*scale);
}
export function formatMoney(cents:bigint|number|string,currency:string){
  const c=BigInt(cents),neg=c<0n,abs=neg?-c:c,units=(abs/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,","),sub=(abs%100n).toString().padStart(2,"0");
  return `${currency} ${neg?"-":""}${units}.${sub}`;
}
// "360.00" -> 36000n; refuses more than two decimals rather than rounding someone's money.
export function parseAmountToCents(text:string):bigint|null{const m=/^\s*(\d{1,12})(?:\.(\d{1,2}))?\s*$/.exec(text.replace(/,/g,""));return m?BigInt(m[1])*100n+BigInt((m[2]||"").padEnd(2,"0")):null;}
