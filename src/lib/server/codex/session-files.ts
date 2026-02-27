import type { Dirent } from "node:fs";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { getHistoryTimestamps } from "$lib/server/codex/history";
import { codexSessionsRootPath } from "$lib/server/paths";

export type SessionHeader = {
  sessionUuid: string | null;
  workspacePath: string | null;
  startedAt: string | null;
  instructions: string | null;
};

export type SessionRecord = SessionHeader & {
  filePath: string;
  lastModifiedAt: Date | null;
};

const isJsonl = (name: string) => name.endsWith(".jsonl");

const readFirstLine = async (filePath: string): Promise<string | null> => {
  return await new Promise((resolve, reject) => {
    let buffer = "";
    const stream = createReadStream(filePath, {
      encoding: "utf-8",
      highWaterMark: 4 * 1024,
    });

    stream.on("data", (chunk) => {
      buffer += chunk;
      const newLineIndex = buffer.indexOf("\n");
      if (newLineIndex === -1) {
        return;
      }
      stream.close();
      resolve(buffer.slice(0, newLineIndex));
    });

    stream.on("error", (error) => reject(error));
    stream.on("close", () => resolve(buffer.length > 0 ? buffer : null));
  });
};

export const readSessionHeader = async (filePath: string): Promise<SessionHeader | null> => {
  try {
    const firstLine = await readFirstLine(filePath);
    if (!firstLine) {
      return null;
    }

    const parsed = JSON.parse(firstLine) as {
      type?: unknown;
      timestamp?: unknown;
      payload?: {
        id?: unknown;
        cwd?: unknown;
        timestamp?: unknown;
        instructions?: unknown;
      };
    };

    if (parsed.type !== "session_meta") {
      return null;
    }

    return {
      sessionUuid: typeof parsed.payload?.id === "string" ? parsed.payload.id : null,
      workspacePath: typeof parsed.payload?.cwd === "string" ? parsed.payload.cwd : null,
      startedAt:
        typeof parsed.payload?.timestamp === "string"
          ? parsed.payload.timestamp
          : typeof parsed.timestamp === "string"
            ? parsed.timestamp
            : null,
      instructions: typeof parsed.payload?.instructions === "string" ? parsed.payload.instructions : null,
    };
  } catch {
    return null;
  }
};

const walkSessions = async (rootPath: string): Promise<string[]> => {
  const stack = [rootPath];
  const files: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = (await readdir(current, { withFileTypes: true })) as unknown as Dirent[];
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name.toString());
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && isJsonl(entry.name.toString())) {
        files.push(fullPath);
      }
    }
  }

  return files;
};

export const listSessionRecords = async (): Promise<SessionRecord[]> => {
  const files = await walkSessions(codexSessionsRootPath);
  const historyMap = await getHistoryTimestamps();
  const records: SessionRecord[] = [];

  for (const filePath of files) {
    const header = await readSessionHeader(filePath);
    if (!header) {
      continue;
    }

    let modifiedAt: Date | null = null;
    try {
      const fileStat = await stat(filePath);
      modifiedAt = fileStat.mtime;
    } catch {
      modifiedAt = null;
    }

    const historyTimestamp = header.sessionUuid ? (historyMap.get(header.sessionUuid) ?? null) : null;
    if (historyTimestamp && (!modifiedAt || historyTimestamp > modifiedAt)) {
      modifiedAt = historyTimestamp;
    }

    records.push({
      ...header,
      filePath,
      lastModifiedAt: modifiedAt,
    });
  }

  records.sort((a, b) => (b.lastModifiedAt?.getTime() ?? 0) - (a.lastModifiedAt?.getTime() ?? 0));
  return records;
};

export const getWorkspaceName = (workspacePath: string) => basename(workspacePath);
