import type {CompMembershipActionState} from "@/lib/admin/membership-comp-action-core";
type Props=Readonly<{
 labels:Readonly<{title:string;description:string;planLabel?:string;submit?:string}>;
 /** Retained only for old component callers; no form or mutation is rendered. */
 action?:(state:CompMembershipActionState,data:FormData)=>Promise<CompMembershipActionState>;
 profileId?:string;state?:CompMembershipActionState;
}>;
export function MembershipCompForm({labels}:Props){
 return <section className="glass-card p-5 sm:p-7">
  <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
  <p className="mt-2 text-sm text-muted-foreground">{labels.description}</p>
 </section>;
}
