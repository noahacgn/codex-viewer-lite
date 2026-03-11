import { homedir } from "node:os";
import { resolve } from "node:path";

export const codexSessionsRootPath = resolve(homedir(), ".codex", "sessions");
export const codexHistoryFilePath = resolve(homedir(), ".codex", "history.jsonl");
export const codexLogDirPath = resolve(homedir(), ".codex", "log");
export const codexTuiLogPath = resolve(codexLogDirPath, "codex-tui.log");
