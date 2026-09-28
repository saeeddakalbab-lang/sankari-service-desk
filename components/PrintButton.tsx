"use client";
// Opens the browser's print dialog; "Save as PDF" there produces the file.
export function PrintButton({ label }: { label: string }) { return <button type="button" className="btn btn-primary" onClick={() => window.print()}>{label}</button>; }
