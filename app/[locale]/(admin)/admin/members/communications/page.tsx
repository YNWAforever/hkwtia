import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {getTranslations,setRequestLocale} from "next-intl/server";
import {z} from "zod";
import type {AppLocale} from "@/i18n/routing";
import {MemberCommunicationForm} from "@/components/admin/member-communication-form";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {segmentsRepository} from "@/lib/db/repos/segments";
import {listCommunicationTargets} from "@/lib/db/repos/batch-handlers/communication";
import {localizedPath} from "@/lib/urls";

export default async function MemberCommunicationsPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{segmentId?:string}>}) {
  const {locale:value}=await params;const locale=value as AppLocale;setRequestLocale(locale);
  const actor=await requireAdminPageActor();
  const t=await getTranslations({locale,namespace:"Admin.communications"});
  const plans=await getTranslations({locale,namespace:"Portal.plans"});
  const enabled=process.env.ADMIN_BATCH_ENABLED==="true"&&process.env.MEMBER_COMMUNICATION_BATCH_ENABLED==="true";
  const query=await searchParams;
  const id=z.string().uuid().safeParse(query.segmentId);
  let segments:Awaited<ReturnType<typeof segmentsRepository.list>>=[];
  let targets:Awaited<ReturnType<typeof listCommunicationTargets>>|null=null;
  let unavailable=false;
  if(enabled)try {segments=await segmentsRepository.list(actor);if(id.success)targets=await listCommunicationTargets(actor,id.data);} catch {unavailable=true;}
  return <div className="space-y-5"><Link className="text-primary underline" href={localizedPath(locale,"/admin/members")}>{t("back")}</Link><h1 className="font-serif text-4xl">{t("title")}</h1>{!enabled?<p>{t("disabled")}</p>:<><form className="flex flex-wrap items-end gap-3" method="get"><label className="grid gap-1">{t("segment")}<select className="min-h-11 rounded border p-2" name="segmentId" defaultValue={id.success?id.data:""} required><option value="">{t("chooseSegment")}</option>{segments.map(segment=><option key={segment.id} value={segment.id}>{locale==="zh-HK"?segment.nameZh??segment.nameEn:segment.nameEn}</option>)}</select></label><button className="min-h-11 rounded border px-4" type="submit">{t("load")}</button><Link className="text-primary underline" href={localizedPath(locale,"/admin/segments")}>{t("manageSegments")}</Link></form>{unavailable?<p role="alert">{t("error")}</p>:targets&&id.success?<MemberCommunicationForm key={id.data} locale={locale} segmentId={id.data} targets={targets} labels={{operation:t("operation"),renewal:t("renewal"),invite:t("invite"),channel:t("channel"),email:t("email"),whatsapp:t("whatsapp"),help:t("help"),selectAll:t("selectAll"),selectAllMatching:t("selectAllMatching"),selected:t("selected",{count:"{count}"}),previous:t("previous"),next:t("next"),name:t("name"),scope:t("scope"),date:t("date"),preview:t("preview"),error:t("error"),empty:t("empty"),planCodes:Object.fromEntries(["community","startup","corporate","patron"].map(code=>[code,plans(code as "community"|"startup"|"corporate"|"patron")]))}}/>:null}</>}</div>;
}
