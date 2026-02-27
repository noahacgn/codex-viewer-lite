import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { codexHistoryFilePath } from "$lib/server/paths";

const toMillis = (timestamp: number) => {
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
};

let cachedMtimeMs = 0;
let cachedMap: Map<string, Date> | null = null;

export const getHistoryTimestamps = async (): Promise<Map<string, Date>> => {
  if (!existsSync(codexHistoryFilePath)) {
    cachedMtimeMs = 0;
    cachedMap = null;
    return new Map();
  }

  const historyStats = await stat(codexHistoryFilePath);
  if (cachedMap && cachedMtimeMs === historyStats.mtimeMs) {
    return new Map(cachedMap);
  }

  const bySession = new Map<string, Date>();
  const stream = createReadStream(codexHistoryFilePath, { encoding: "utf-8" });
  const reader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed: { session_id?: unknown; ts?: unknown };
    try {
      parsed = JSON.parse(trimmed) as { session_id?: unknown; ts?: unknown };
    } catch {
      continue;
    }

    if (typeof parsed.session_id !== "string" || typeof parsed.ts !== "number") {
      continue;
    }

    const timestamp = new Date(toMillis(parsed.ts));
    const current = bySession.get(parsed.session_id);
    if (!current || timestamp > current) {
      bySession.set(parsed.session_id, timestamp);
    }
  }

  cachedMap = bySession;
  cachedMtimeMs = historyStats.mtimeMs;
  return new Map(bySession);
};
