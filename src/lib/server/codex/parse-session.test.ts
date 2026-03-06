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

    expect(parsed.firstUserMessage).toContain("TypeScript");
    expect(parsed.sessionMeta.sessionUuid).toBe("session-uuid");
    expect(parsed.turns).toHaveLength(1);

    const firstTurn = parsed.turns[0];
    expect(firstTurn?.userMessage?.text).toContain("TypeScript");
    expect(firstTurn?.assistantMessages).toHaveLength(1);
    expect(firstTurn?.toolCalls[0]?.name).toBe("read_file");
    expect(firstTurn?.toolResults[0]?.output).toContain('"ok":true');
  });

  it("hides permissions and subagent notification messages from the visible timeline", () => {
    const parsed = parseCodexSession(
      [
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-02-27T09:00:00.000Z",
          payload: {
            type: "message",
            role: "developer",
            content: [
              {
                type: "input_text",
                text: "<permissions instructions>\nFilesystem sandboxing defines which files can be read.\n</permissions instructions>",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-02-27T09:00:01.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: '<subagent_notification>\n{"agent_id":"agent-1","status":{"errored":"Interrupted"}}\n</subagent_notification>',
              },
            ],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-02-27T09:00:02.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "真实的第一条用户消息" }],
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-27T09:00:03.000Z",
          payload: {
            type: "agent_message",
            text: "正常的助手回复",
          },
        }),
      ].join("\n"),
    );

    expect(parsed.firstUserMessage).toBe("真实的第一条用户消息");
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.turns[0]?.userMessage?.text).toBe("真实的第一条用户消息");
    expect(parsed.turns[0]?.assistantMessages[0]?.text).toBe("正常的助手回复");

    const visibleText = parsed.turns
      .flatMap((turn) => {
        const texts = turn.assistantMessages.map((message) => message.text);
        if (turn.userMessage) {
          texts.push(turn.userMessage.text);
        }
        return texts;
      })
      .join("\n");

    expect(visibleText).not.toContain("permissions instructions");
    expect(visibleText).not.toContain("subagent_notification");
  });

  it("derives the title from compacted replacement history", () => {
    const parsed = parseCodexSession(
      [
        JSON.stringify({
          type: "compacted",
          timestamp: "2026-02-27T09:00:00.000Z",
          payload: {
            message: "",
            replacement_history: [
              {
                type: "message",
                role: "developer",
                content: [
                  {
                    type: "input_text",
                    text: "<permissions instructions>\nFilesystem sandboxing defines which files can be read.\n</permissions instructions>",
                  },
                ],
              },
              {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: "# AGENTS.md instructions for D:\\\\repo\n\n<INSTRUCTIONS>\nbody\n</INSTRUCTIONS>",
                  },
                ],
              },
              {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "压缩前的首条真实问题" }],
              },
            ],
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-02-27T09:00:01.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "压缩后的后续问题" }],
          },
        }),
      ].join("\n"),
    );

    expect(parsed.firstUserMessage).toBe("压缩前的首条真实问题");
    expect(parsed.turns[0]?.userMessage?.text).toBe("压缩后的后续问题");
  });
});
