import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseCodexSession } from "$lib/server/codex/parse-session";
import { listSessionRecords, readSessionHeader } from "$lib/server/codex/session-files";
import { decodeProjectId, decodeSessionId, encodeSessionId } from "$lib/server/ids";
import { codexSessionsRootPath } from "$lib/server/paths";
import type { Session, SessionDetail, SessionMeta } from "$lib/shared/types";

const isPathWithinSessionsRoot = (targetPath: string) => {
  const normalizedRoot = resolve(codexSessionsRootPath);
  const normalizedTarget = resolve(targetPath);
  return normalizedTarget.startsWith(normalizedRoot);
};

const toIsoOrNull = (value: Date | null) => (value ? value.toISOString() : null);

const toSessionMeta = async (filePath: string, lastModifiedAt: Date | null): Promise<SessionMeta> => {
  const fileContent = await readFile(filePath, "utf-8");
  const parsed = parseCodexSession(fileContent);
  const messages = parsed.turns.flatMap((turn) => {
    const messageList = [...turn.assistantMessages];
    if (turn.userMessage) {
      messageList.push(turn.userMessage);
    }
    return messageList;
  });

  return {
    messageCount: messages.length,
    lastModifiedAt: toIsoOrNull(lastModifiedAt),
    startedAt: parsed.sessionMeta.timestamp,
    firstUserMessage: parsed.turns.find((turn) => turn.userMessage)?.userMessage?.text ?? null,
  };
};

export const getSessions = async (projectId: string): Promise<Session[]> => {
  const workspacePath = decodeProjectId(projectId);
  const records = await listSessionRecords();
  const projectSessions = records.filter((record) => record.workspacePath === workspacePath);

  const sessions = await Promise.all(
    projectSessions.map(async (record) => {
      const meta = await toSessionMeta(record.filePath, record.lastModifiedAt);
      return {
        id: encodeSessionId(record.filePath),
        sessionUuid: record.sessionUuid,
        jsonlFilePath: record.filePath,
        meta,
      } satisfies Session;
    }),
  );

  sessions.sort((a, b) => {
    const aTime = a.meta.lastModifiedAt ? new Date(a.meta.lastModifiedAt).getTime() : 0;
    const bTime = b.meta.lastModifiedAt ? new Date(b.meta.lastModifiedAt).getTime() : 0;
    return bTime - aTime;
  });

  return sessions;
};

export const getSession = async (projectId: string, sessionId: string): Promise<SessionDetail> => {
  const workspacePath = decodeProjectId(projectId);
  const sessionPath = decodeSessionId(sessionId);

  if (!isPathWithinSessionsRoot(sessionPath)) {
    throw new Error(`Session path is outside codex sessions root: ${sessionPath}`);
  }

  const header = await readSessionHeader(sessionPath);
  if (header?.workspacePath !== workspacePath) {
    throw new Error("Session does not belong to the requested project");
  }

  const sessionStats = await stat(sessionPath);
  const fileContent = await readFile(sessionPath, "utf-8");
  const parsed = parseCodexSession(fileContent);
  const meta = await toSessionMeta(sessionPath, sessionStats.mtime);

  return {
    id: sessionId,
    sessionUuid: parsed.sessionMeta.sessionUuid,
    jsonlFilePath: sessionPath,
    meta,
    turns: parsed.turns,
    sessionMeta: parsed.sessionMeta,
  };
};

export const getSessionTitle = (session: Session) => {
  if (session.meta.firstUserMessage) {
    return session.meta.firstUserMessage;
  }
  return basename(session.jsonlFilePath);
};
