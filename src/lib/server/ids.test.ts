import { describe, expect, it } from "vitest";
import { decodeProjectId, decodeSessionId, encodeProjectId, encodeSessionId } from "$lib/server/ids";

describe("path id codec", () => {
  it("encodes and decodes project path with utf-8 safely", () => {
    const source = "D:\\项目\\codex-viewer-lite";
    const encoded = encodeProjectId(source);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(decodeProjectId(encoded)).toBe(source);
  });

  it("encodes and decodes session path with nested jsonl filename", () => {
    const source = "C:\\Users\\alice\\.codex\\sessions\\2026\\02\\abc123.jsonl";
    const encoded = encodeSessionId(source);
    expect(decodeSessionId(encoded)).toBe(source);
  });
});
