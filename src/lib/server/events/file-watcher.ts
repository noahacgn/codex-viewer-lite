import { existsSync, watch, type FSWatcher } from "node:fs";
import { dirname, resolve } from "node:path";
import { encodeProjectId, encodeSessionId } from "$lib/server/ids";
import { readSessionHeader } from "$lib/server/codex/session-files";
import { codexHistoryFilePath, codexSessionsRootPath } from "$lib/server/paths";
import { getSseEventBus } from "$lib/server/events/event-bus";

const withSafePath = (rootPath: string, relativePath: string) => {
  try {
    return resolve(rootPath, relativePath);
  } catch {
    return null;
  }
};

class FileWatcherService {
  private started = false;
  private watchers: FSWatcher[] = [];

  public startWatching() {
    if (this.started) {
      return;
    }
    this.started = true;

    this.watchSessions();
    this.watchHistory();
  }

  private watchSessions() {
    if (!existsSync(codexSessionsRootPath)) {
      return;
    }

    const watcher = watch(
      codexSessionsRootPath,
      { recursive: true },
      (eventType, filename) => {
        if (!filename || !filename.endsWith(".jsonl")) {
          return;
        }
        const fullPath = withSafePath(codexSessionsRootPath, filename);
        if (!fullPath) {
          return;
        }
        void this.handleSessionFileEvent(fullPath, eventType);
      }
    );

    this.watchers.push(watcher);
  }

  private watchHistory() {
    const historyDir = dirname(codexHistoryFilePath);
    if (!existsSync(historyDir)) {
      return;
    }

    const watcher = watch(historyDir, (_eventType, filename) => {
      if (!filename || !filename.endsWith("history.jsonl")) {
        return;
      }
      getSseEventBus().emitProjectChanged(null, "change");
    });

    this.watchers.push(watcher);
  }

  private async handleSessionFileEvent(sessionPath: string, eventType: string) {
    const bus = getSseEventBus();
    const sessionId = encodeSessionId(sessionPath);
    const header = await readSessionHeader(sessionPath);
    const projectId = header?.workspacePath ? encodeProjectId(header.workspacePath) : null;

    bus.emitProjectChanged(projectId, eventType);
    bus.emitSessionChanged(projectId, sessionId, eventType);
  }
}

const globalSymbol = Symbol.for("codex-viewer-lite.file-watcher");
const store = globalThis as unknown as Record<symbol, FileWatcherService | undefined>;

export const getFileWatcherService = () => {
  if (!store[globalSymbol]) {
    store[globalSymbol] = new FileWatcherService();
  }
  return store[globalSymbol]!;
};
