import { describe, expect, it } from "vitest";
import { parseCodexSession } from "$lib/server/codex/parse-session";

const baseSessionMeta = {
  type: "session_meta",
  timestamp: "2026-02-27T09:00:00.000Z",
  payload: {
    id: "session-uuid",
    cwd: "D:/IdeaProjects/codex-viewer-lite",
    timestamp: "2026-02-27T09:00:00.000Z",
    instructions: "Respond in markdown",
  },
};

const stringifyLines = (lines: unknown[]) => {
  return lines.map((line) => JSON.stringify(line)).join("\n");
};

describe("parseCodexSession", () => {
  it("builds an ordered message timeline with visible subagent messages", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        baseSessionMeta,
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:01.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "请帮我检查这个仓库" }],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:02.000Z",
          payload: {
            type: "function_call",
            name: "spawn_agent",
            arguments: '{"agent_type":"worker","fork_context":false,"message":"检查 lint 错误并汇报结果"}',
            call_id: "call_spawn",
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:03.000Z",
          payload: {
            type: "function_call_output",
            call_id: "call_spawn",
            output: '{"agent_id":"agent-1","nickname":"Plato"}',
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-02-27T09:00:04.000Z",
          payload: {
            type: "agent_message",
            text: "我先让子代理检查一下。",
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:05.000Z",
          payload: {
            type: "function_call",
            name: "wait",
            arguments: '{"ids":["agent-1"],"timeout_ms":30000}',
            call_id: "call_wait",
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:06.000Z",
          payload: {
            type: "function_call_output",
            call_id: "call_wait",
            output: '{"status":"running"}',
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:07.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: '<subagent_notification>\n{"agent_id":"agent-1","status":{"completed":"- lint 已通过\\n- 未发现格式问题"}}\n</subagent_notification>',
              },
            ],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:08.000Z",
          payload: {
            type: "function_call",
            name: "close_agent",
            arguments: '{"id":"agent-1"}',
            call_id: "call_close",
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:09.000Z",
          payload: {
            type: "function_call_output",
            call_id: "call_close",
            output: '{"status":"completed"}',
          },
        },
      ]),
    );

    expect(parsed.firstUserMessage).toBe("请帮我检查这个仓库");
    expect(parsed.sessionMeta.sessionUuid).toBe("session-uuid");
    expect(parsed.turns).toHaveLength(1);

    const firstTurn = parsed.turns[0];
    expect(firstTurn?.messages).toMatchObject([
      {
        kind: "user",
        text: "请帮我检查这个仓库",
      },
      {
        kind: "subagent_prompt",
        text: "检查 lint 错误并汇报结果",
        agentId: "agent-1",
        agentNickname: "Plato",
      },
      {
        kind: "assistant",
        text: "我先让子代理检查一下。",
      },
      {
        kind: "subagent_response",
        text: "- lint 已通过\n- 未发现格式问题",
        agentId: "agent-1",
        status: "completed",
      },
    ]);

    expect(firstTurn?.toolCalls.map((call) => call.name)).toEqual(["wait", "close_agent"]);
    expect(firstTurn?.toolResults.map((result) => result.output)).toEqual([
      '{"status":"running"}',
      '{"status":"completed"}',
    ]);
  });

  it("shows errored subagent notifications without affecting the title", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        {
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
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:01.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: '<subagent_notification>\n{"agent_id":"agent-2","status":{"errored":"Interrupted"}}\n</subagent_notification>',
              },
            ],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:02.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "真实的第一条用户消息" }],
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-02-27T09:00:03.000Z",
          payload: {
            type: "agent_message",
            text: "正常的助手回复",
          },
        },
      ]),
    );

    expect(parsed.firstUserMessage).toBe("真实的第一条用户消息");
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.turns[0]?.messages).toMatchObject([
      {
        kind: "subagent_response",
        text: "Interrupted",
        agentId: "agent-2",
        status: "errored",
      },
      {
        kind: "user",
        text: "真实的第一条用户消息",
      },
      {
        kind: "assistant",
        text: "正常的助手回复",
      },
    ]);

    const visibleText = parsed.turns[0]?.messages.map((message) => message.text).join("\n") ?? "";
    expect(visibleText).not.toContain("permissions instructions");
    expect(visibleText).not.toContain("subagent_notification");
  });

  it("derives the title from compacted replacement history", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        {
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
        },
        {
          type: "response_item",
          timestamp: "2026-02-27T09:00:01.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "压缩后的后续问题" }],
          },
        },
      ]),
    );

    expect(parsed.firstUserMessage).toBe("压缩前的首条真实问题");
    expect(parsed.turns[0]?.messages[0]?.text).toBe("压缩后的后续问题");
  });
});
