import "server-only";

// Runtime repositories import this boundary; schema-core.ts stays build-time loadable.
export * from "./schema-core";
