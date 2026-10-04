import "server-only";
import {createHash} from "node:crypto";
import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";
import {requireAdmin} from "@/lib/auth/authorize";
import {decodeScopedCursor, encodeScopedCursor} from "@/lib/admin/pagination";
import {WORKSPACE_KINDS, workspaceSearchInputSchema, type WorkspaceSearchInput, type WorkspaceSearchPage} from "@/lib/admin/workspace-search-types";
import {forbidden, type Actor, type AdminActor} from "@/lib/membership/lifecycle";
import {getDb, type Database} from "./common";

type SearchDatabase = Pick<Database, "transaction">;
const rowSchema = z.object({rank: z.number().int().min(0).max(4), id: z.string().min(1).max(200), label: z.string().max(180)});
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  throw Error("WORKSPACE_SEARCH_READ_FAILED");
}
function destination(kind: typeof WORKSPACE_KINDS[number], id: string): string {
  const encoded = encodeURIComponent(id);
  switch(kind) {
    case "member": return `/admin/members/${encoded}`;
    case "company": return `/admin/members?${new URLSearchParams({companyId:id})}`;
    case "application": return `/admin/members/queue/${encoded}`;
    case "event": return `/admin/events-mgmt/${encoded}`;
    case "conversation": return `/admin/inbox/${encoded}`;
  }
}
/** All existing admin roles have these reads; member/private agent histories do not. */
export function createWorkspaceSearchRepository(loadDatabase: () => Promise<SearchDatabase> = getDb) {
  return {
    async searchWorkspace(actor: Actor, input: unknown): Promise<WorkspaceSearchPage> {
      requireAdmin(actor);
      const parsed = workspaceSearchInputSchema.parse(input);
      if (!parsed.query) return {items:[], nextCursor:null};
      // A cursor is a position, never authority. Recheck the actor on every nonempty read.
      // Keep actor IDs and query text out of the cursor payload.
      const scope = createHash("sha256").update(JSON.stringify(["workspace-v1",actor.kind,actor.profileId,actor.userId,parsed.query])).digest("hex");
      const key = parsed.cursor ? decodeScopedCursor(scope,parsed.cursor) : null;
      let cursorRank = -1, cursorId = "";
      if(key) {
        if(!/^[0-4]$/.test(key[0]) || key[1] !== "" || !key[2]) throw Error("INVALID_CURSOR");
        cursorRank = Number(key[0]); cursorId = key[2];
      }
      const database = await loadDatabase();
      return database.transaction(async tx => {
        const identities = rows(await tx.execute(sql`SELECT id FROM profiles WHERE id=${actor.profileId} AND auth_user_id=${actor.userId} AND role=${actor.kind} FOR SHARE`));
        if(identities.length !== 1) forbidden();
        const term = "%" + parsed.query.replace(/[\\%_]/g, char => "\\" + char) + "%";
        const matches = (column:SQL) => sql`${column} ILIKE ${term} ESCAPE ${"\\"}`;
        const after = (rank:number, id:SQL):SQL => rank < cursorRank ? sql`FALSE` : rank > cursorRank ? sql`TRUE` : sql`${id} COLLATE "C" > ${cursorId} COLLATE "C"`;
        // Each branch is scoped and bounded in SQL before projection. No messages,
        // emails, phone numbers, freeform bodies, private drafts or total counts.
        const branches = [
          sql`(SELECT 0::integer AS rank,p.id::text AS id,left(p.display_name,180) AS label FROM profiles p WHERE (${matches(sql`p.display_name`)} OR ${matches(sql`p.id::text`)}) AND ${after(0,sql`p.id::text`)} ORDER BY p.id::text COLLATE "C" LIMIT 21)`,
          sql`(SELECT 1::integer AS rank,c.id::text AS id,left(c.display_name,180) AS label FROM companies c WHERE (${matches(sql`c.display_name`)} OR ${matches(sql`c.legal_name`)} OR ${matches(sql`c.id::text`)}) AND ${after(1,sql`c.id::text`)} ORDER BY c.id::text COLLATE "C" LIMIT 21)`,
          sql`(SELECT 2::integer AS rank,a.id::text AS id,left(coalesce(nullif(p.display_name,''),a.id::text),180) AS label FROM membership_applications a JOIN profiles p ON p.id=a.applicant_user_id LEFT JOIN companies c ON c.id=a.company_id WHERE (${matches(sql`p.display_name`)} OR ${matches(sql`c.display_name`)} OR ${matches(sql`a.id::text`)}) AND ${after(2,sql`a.id::text`)} ORDER BY a.id::text COLLATE "C" LIMIT 21)`,
          sql`(SELECT 3::integer AS rank,e.id::text AS id,left(e.title_en,180) AS label FROM events e WHERE (${matches(sql`e.title_en`)} OR ${matches(sql`e.title_zh`)} OR ${matches(sql`e.id::text`)}) AND ${after(3,sql`e.id::text`)} ORDER BY e.id::text COLLATE "C" LIMIT 21)`,
          sql`(SELECT 4::integer AS rank,c.id::text AS id,left(coalesce(nullif(p.display_name,''),c.id::text),180) AS label FROM conversations c LEFT JOIN profiles p ON p.id=c.profile_id WHERE c.agent_kind='concierge' AND c.status<>'deleted' AND (${matches(sql`p.display_name`)} OR ${matches(sql`c.id::text`)}) AND ${after(4,sql`c.id::text`)} ORDER BY c.id::text COLLATE "C" LIMIT 21)`,
        ];
        const result = rows(await tx.execute(sql`SELECT rank,id,label FROM (${sql.join(branches,sql` UNION ALL `)}) AS scoped ORDER BY rank,id COLLATE "C" LIMIT 21`)).map(row=>rowSchema.parse(row));
        const page = result.slice(0,20);
        const last = page.at(-1);
        return {items: page.map(row=>{const kind=WORKSPACE_KINDS[row.rank];return {kind,id:row.id,label:row.label,href:destination(kind,row.id)};}), nextCursor: result.length>20 && last ? encodeScopedCursor(scope,[String(last.rank),"",last.id]) : null};
      });
    },
  };
}
const repository = createWorkspaceSearchRepository();
export async function searchWorkspace(actor: AdminActor, input: WorkspaceSearchInput): Promise<WorkspaceSearchPage> {
  return repository.searchWorkspace(actor,input);
}
