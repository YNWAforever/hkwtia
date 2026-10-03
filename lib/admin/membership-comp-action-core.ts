import type {CompMembershipInput} from "@/lib/db/repos/admin-membership";
export type CompMembershipActionState=Readonly<{status?:"success"|"error";message?:string;code?:"LEGACY_COMP_RETIRED"}>;
type CompMembershipOptions=Readonly<{successMessage:string;validationMessage:string;errorMessage:string;duplicateMessage:string;retiredMessage?:string;mutate:(input:CompMembershipInput)=>Promise<unknown>}>;
/** Legacy adapter is read-only, including when an old caller supplies a mutation. */
export async function runCompMembershipAction(_state:CompMembershipActionState,_formData:FormData,options:CompMembershipOptions):Promise<CompMembershipActionState>{
 return {status:"error",code:"LEGACY_COMP_RETIRED",message:options.retiredMessage??options.errorMessage};
}
