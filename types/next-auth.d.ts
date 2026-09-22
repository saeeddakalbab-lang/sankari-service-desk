import "next-auth";
import type { Role } from "@/lib/types";
declare module "next-auth" {
  interface Session { user:{id:string;email:string;name:string;image?:string|null;roles:Role[]} }
  interface User { roles?:Role[] }
}
