// Re-exports MaterialSelect AI's shared API contract types.
//
// packages/shared-types/index.ts is canonical (D-16/M4) — this barrel exists
// only so the rest of the app keeps importing "@/lib/types" instead of every
// call site switching to the workspace package name.
export * from "@materialselect/shared-types";
