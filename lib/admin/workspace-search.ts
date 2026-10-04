import "server-only";
// Reuse the existing repository boundary; this is a read model, not a new CRM.
export {createWorkspaceSearchRepository, searchWorkspace} from "@/lib/db/repos/workspace-search";
export {WORKSPACE_KINDS, workspaceSearchInputSchema} from "./workspace-search-types";
export type {WorkspaceKind, WorkspaceSearchInput, WorkspaceSearchPage} from "./workspace-search-types";
