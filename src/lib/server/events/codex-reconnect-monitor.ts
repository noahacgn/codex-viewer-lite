import { closeSync, openSync, readSync, type Stats, statSync } from "node:fs";
import { getSseEventBus } from "$lib/server/events/event-bus";
import { codexTuiLogPath } from "$lib/server/paths";
import type { CodexReconnectSource } from "$lib/shared/types";

const RECONNECT_WARNING_TEXT = "stream disconnected - retrying sampling request";
const INCIDENT_DEDUP_WINDOW_MS = 30_000;
const INCIDENT_VISIBLE_WINDOW_MS = 60_000;

export type CodexReconnectIncident = {
  message: string;
  source: CodexReconnectSource;
  detectedAt: string;
  visibleUntil: string;
};

type ReconnectEventBus = {
  emitReconnectDetected: (message: string, source: CodexReconnectSource, detectedAt?: string) => void;
};

type CodexReconnectMonitorOptions = {
  logFilePath?: string;
  bus?: ReconnectEventBus;
  now?: () => Date;
};

type FileStat = Pick<Stats, "dev" | "ino" | "size">;

const buildFileKey = (fileStat: FileStat) => `${fileStat.dev}:${fileStat.ino}`;

const isNodeError = (error: unknown): error is NodeJS.ErrnoException => {
  return error instanceof Error && "code" in error;
};

/**
 * Tracks reconnect warnings from the global Codex CLI TUI log without replaying historical lines.
 */
export class CodexReconnectMonitor {
  private readonly bus: ReconnectEventBus;
  private readonly logFilePath: string;
  private readonly now: () => Date;

  private currentIncident: CodexReconnectIncident | null = null;
  private initialized = false;
  private offset = 0;
  private pendingLine = "";
  private trackedFileKey: string | null = null;

  public constructor(options: CodexReconnectMonitorOptions = {}) {
    this.bus = options.bus ?? getSseEventBus();
    this.logFilePath = options.logFilePath ?? codexTuiLogPath;
    this.now = options.now ?? (() => new Date());
  }

  public initialize() {
    if (this.initialized) {
      return;
    }
    const fileStat = this.readFileStat();
    this.offset = fileStat?.size ?? 0;
    this.pendingLine = "";
    this.trackedFileKey = fileStat ? buildFileKey(fileStat) : null;
    this.initialized = true;
  }

  public getCurrentIncident() {
    if (!this.currentIncident) {
      return null;
    }
    if (Date.parse(this.currentIncident.visibleUntil) <= this.now().getTime()) {
      this.currentIncident = null;
      return null;
    }
    return { ...this.currentIncident };
  }

  public handleLogChange() {
    this.initialize();
    const fileStat = this.readFileStat();
    if (!fileStat) {
      this.resetTrackedFile();
      return null;
    }
    if (this.shouldResetTrackedOffset(fileStat)) {
      this.offset = 0;
      this.pendingLine = "";
    }
    if (fileStat.size <= this.offset) {
      this.offset = fileStat.size;
      this.trackedFileKey = buildFileKey(fileStat);
      return null;
    }
    const chunk = this.readAppendedChunk(fileStat.size);
    this.offset = fileStat.size;
    this.trackedFileKey = buildFileKey(fileStat);
    return this.processChunk(chunk);
  }

  private createIncident(nowMs: number) {
    const detectedAt = new Date(nowMs).toISOString();
    return {
      detectedAt,
      message: RECONNECT_WARNING_TEXT,
      source: "codex-tui.log" as const,
      visibleUntil: new Date(nowMs + INCIDENT_VISIBLE_WINDOW_MS).toISOString(),
    };
  }

  private processChunk(chunk: string) {
    const lines = `${this.pendingLine}${chunk}`.split(/\r?\n/u);
    this.pendingLine = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.includes(RECONNECT_WARNING_TEXT)) {
        continue;
      }
      return this.recordIncident();
    }
    return null;
  }

  private recordIncident() {
    const activeIncident = this.getCurrentIncident();
    const nowMs = this.now().getTime();
    if (activeIncident && nowMs - Date.parse(activeIncident.detectedAt) < INCIDENT_DEDUP_WINDOW_MS) {
      return activeIncident;
    }
    const incident = this.createIncident(nowMs);
    this.currentIncident = incident;
    this.bus.emitReconnectDetected(incident.message, incident.source, incident.detectedAt);
    return incident;
  }

  private readAppendedChunk(nextFileSize: number) {
    const bytesToRead = nextFileSize - this.offset;
    const buffer = Buffer.alloc(bytesToRead);
    let fd: number | null = null;

    try {
      fd = openSync(this.logFilePath, "r");
      readSync(fd, buffer, 0, bytesToRead, this.offset);
      return buffer.toString("utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        this.resetTrackedFile();
        return "";
      }
      throw new Error(`Failed to read appended bytes from ${this.logFilePath}: ${(error as Error).message}`);
    } finally {
      if (fd !== null) {
        closeSync(fd);
      }
    }
  }

  private readFileStat() {
    try {
      return statSync(this.logFilePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw new Error(`Failed to stat ${this.logFilePath}: ${(error as Error).message}`);
    }
  }

  private resetTrackedFile() {
    this.offset = 0;
    this.pendingLine = "";
    this.trackedFileKey = null;
  }

  private shouldResetTrackedOffset(fileStat: FileStat) {
    return fileStat.size < this.offset || buildFileKey(fileStat) !== this.trackedFileKey;
  }
}

const globalSymbol = Symbol.for("codex-viewer-lite.codex-reconnect-monitor");
const store = globalThis as unknown as Record<symbol, CodexReconnectMonitor | undefined>;

export const getCodexReconnectMonitor = () => {
  if (!store[globalSymbol]) {
    store[globalSymbol] = new CodexReconnectMonitor();
  }
  const monitor = store[globalSymbol];
  if (!monitor) {
    throw new Error("Failed to initialize Codex reconnect monitor");
  }
  return monitor;
};
