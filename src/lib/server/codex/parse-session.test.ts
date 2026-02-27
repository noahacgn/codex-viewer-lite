import { describe, expect, it } from "vitest";
import { parseCodexSession } from "$lib/server/codex/parse-session";

const fixture = [
  JSON.stringify({
    type: "session_meta",
    timestamp: "2026-02-27T09:00:00.000Z",
    payload: {
      id: "session-uuid",
      cwd: "D:/IdeaProjects/codex-viewer-lite",
      timestamp: "2026-02-27T09:00:00.000Z",
      instructions: "Respond in markdown",
    },
  }),
  JSON.stringify({
    type: "response_item",
    timestamp: "2026-02-27T09:00:01.000Z",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "请给我一段 TypeScript 代码" }],
    },
  }),
  JSON.stringify({
    type: "response_item",
    timestamp: "2026-02-27T09:00:02.000Z",
    payload: {
      type: "function_call",
      name: "read_file",
      arguments: '{"path":"src/main.ts"}',
      call_id: "call_1",
    },
  }),
  JSON.stringify({
    type: "response_item",
    timestamp: "2026-02-27T09:00:03.000Z",
    payload: {
      type: "function_call_output",
      output: '{"ok":true}',
      call_id: "call_1",
    },
  }),
  JSON.stringify({
    type: "event_msg",
    timestamp: "2026-02-27T09:00:04.000Z",
    payload: {
      type: "agent_message",
      text: "```ts\\nconsole.log('hello')\\n```",
    },
  }),
].join("\n");

describe("parseCodexSession", () => {
  it("builds turns with user/assistant messages and tool events", () => {
    const parsed = parseCodexSession(fixture);

    expect(parsed.sessionMeta.sessionUuid).toBe("session-uuid");
    expect(parsed.turns).toHaveLength(1);

    const firstTurn = parsed.turns[0];
    expect(firstTurn?.userMessage?.text).toContain("TypeScript");
    expect(firstTurn?.assistantMessages).toHaveLength(1);
    expect(firstTurn?.toolCalls[0]?.name).toBe("read_file");
    expect(firstTurn?.toolResults[0]?.output).toContain('"ok":true');
  });
});
