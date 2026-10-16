import {z} from "zod";
export const WORKSPACE_KINDS = ["member", "company", "application", "event", "conversation"] as const;
export type WorkspaceKind = typeof WORKSPACE_KINDS[number];
export const workspaceSearchInputSchema = z.object({query: z.string().trim().max(120), cursor: z.string().max(1000).optional(), limit: z.literal(20)}).strict();
export type WorkspaceSearchInput = z.infer<typeof workspaceSearchInputSchema>;
export type WorkspaceSearchPage = Readonly<{items: readonly Readonly<{kind: WorkspaceKind; id: string; label: string; href: string}>[]; nextCursor: string | null}>;
