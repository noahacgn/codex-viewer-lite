import { appendFileSync, mkdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodexReconnectMonitor } from "$lib/server/events/codex-reconnect-monitor";

const createTempLogFile = () => {
  const directory = join(tmpdir(), `codex-viewer-lite-reconnect-${crypto.randomUUID()}`);
  mkdirSync(directory, { recursive: true });
  return {
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
    filePath: join(directory, "codex-tui.log"),
  };
};

describe("CodexReconnectMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T10:00:00.000Z"));
  });

  it("starts from the current file end without replaying historical warnings", () => {
    const { cleanup, filePath } = createTempLogFile();
    writeFileSync(filePath, "stream disconnected - retrying sampling request\n", "utf8");
    const emitReconnectDetected = vi.fn();
    const monitor = new CodexReconnectMonitor({
      bus: { emitReconnectDetected },
      logFilePath: filePath,
      now: () => new Date(),
    });

    monitor.initialize();
    monitor.handleLogChange();

    expect(emitReconnectDetected).not.toHaveBeenCalled();
    cleanup();
  });

  it("detects a newly appended reconnect warning", () => {
    const { cleanup, filePath } = createTempLogFile();
    writeFileSync(filePath, "seed\n", "utf8");
    const emitReconnectDetected = vi.fn();
    const monitor = new CodexReconnectMonitor({
      bus: { emitReconnectDetected },
      logFilePath: filePath,
      now: () => new Date(),
    });

    monitor.initialize();
    appendFileSync(filePath, "stream disconnected - retrying sampling request\n", "utf8");
    const incident = monitor.handleLogChange();

    expect(emitReconnectDetected).toHaveBeenCalledTimes(1);
    expect(incident).toMatchObject({
      detectedAt: "2026-03-11T10:00:00.000Z",
      message: "stream disconnected - retrying sampling request",
      source: "codex-tui.log",
      visibleUntil: "2026-03-11T10:01:00.000Z",
    });
    cleanup();
  });

  it("ignores unrelated log lines", () => {
    const { cleanup, filePath } = createTempLogFile();
    writeFileSync(filePath, "seed\n", "utf8");
    const emitReconnectDetected = vi.fn();
    const monitor = new CodexReconnectMonitor({
      bus: { emitReconnectDetected },
      logFilePath: filePath,
      now: () => new Date(),
    });

    monitor.initialize();
    appendFileSync(filePath, "other warning\n", "utf8");
    const incident = monitor.handleLogChange();

    expect(incident).toBeNull();
    expect(emitReconnectDetected).not.toHaveBeenCalled();
    cleanup();
  });

  it("resets the offset after file truncation and reads the new file from the start", () => {
    const { cleanup, filePath } = createTempLogFile();
    writeFileSync(filePath, "seed\n", "utf8");
    const emitReconnectDetected = vi.fn();
    const monitor = new CodexReconnectMonitor({
      bus: { emitReconnectDetected },
      logFilePath: filePath,
      now: () => new Date(),
    });

    monitor.initialize();
    appendFileSync(filePath, "stream disconnected - retrying sampling request\n", "utf8");
    monitor.handleLogChange();

    truncateSync(filePath, 0);
    vi.setSystemTime(new Date("2026-03-11T10:00:35.000Z"));
    writeFileSync(filePath, "stream disconnected - retrying sampling request\n", "utf8");
    monitor.handleLogChange();

    expect(emitReconnectDetected).toHaveBeenCalledTimes(2);
    expect(monitor.getCurrentIncident()?.detectedAt).toBe("2026-03-11T10:00:35.000Z");
    cleanup();
  });

  it("deduplicates reconnect warnings within the same 30-second incident window", () => {
    const { cleanup, filePath } = createTempLogFile();
    writeFileSync(filePath, "seed\n", "utf8");
    const emitReconnectDetected = vi.fn();
    const monitor = new CodexReconnectMonitor({
      bus: { emitReconnectDetected },
      logFilePath: filePath,
      now: () => new Date(),
    });

    monitor.initialize();
    appendFileSync(filePath, "stream disconnected - retrying sampling request\n", "utf8");
    monitor.handleLogChange();

    vi.setSystemTime(new Date("2026-03-11T10:00:20.000Z"));
    appendFileSync(filePath, "stream disconnected - retrying sampling request\n", "utf8");
    monitor.handleLogChange();

    expect(emitReconnectDetected).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
