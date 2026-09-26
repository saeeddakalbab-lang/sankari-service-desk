import type { Role } from "./types";

// What an admin picks when adding a person, and the roles it grants. Everyone is also an employee.
export const PERSON_TYPES=["employee","manager","ceo","owner","board","admin","agent"] as const;
export type PersonType=typeof PERSON_TYPES[number];
export const rolesForType=(type:PersonType):Role[]=>type==="employee"?["employee"]:["employee",type];
export const SINGLE_HOLDER:readonly PersonType[]=["ceo","owner"];
// A placeholder name until Google supplies the real one at first sign-in.
export const placeholderName=(email:string)=>email.split("@")[0].split(/[._-]+/).filter(Boolean).map(p=>p[0].toUpperCase()+p.slice(1)).join(" ")||email;
