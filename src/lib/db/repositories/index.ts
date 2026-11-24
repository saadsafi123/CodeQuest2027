// Purpose: single entry point to the data-access layer. Services import from here only.
// This layer is where confidentiality filtering MUST be enforced (see rules/confidentiality.ts).
export * from "./types";
export { userRepository, systemRepository } from "./userRepository";
export { reportRepository } from "./reportRepository";
export { issueRepository } from "./issueRepository";
export { voteRepository } from "./voteRepository";
export { trustRepository } from "./trustRepository";
