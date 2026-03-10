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

  it("renders request_user_input as timeline messages and removes duplicate tool entries", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        baseSessionMeta,
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:00.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "先帮我锁一下实施方向" }],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:01.000Z",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "我先问两个问题。" }],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:02.000Z",
          payload: {
            type: "function_call",
            name: "request_user_input",
            arguments: JSON.stringify({
              questions: [
                {
                  header: "使用形态",
                  id: "local_form",
                  question: "“本地自己用”具体更接近哪种形态？",
                  options: [
                    {
                      label: "本地网页 (Recommended)",
                      description: "在浏览器里访问 localhost 或静态页面，保留网站形态。",
                    },
                    {
                      label: "桌面应用",
                      description: "打包成桌面程序。",
                    },
                  ],
                },
                {
                  header: "更新触发",
                  id: "update_trigger",
                  question: "数据更新你希望怎么触发？",
                  options: [
                    {
                      label: "手动更新命令 (Recommended)",
                      description: "显式执行一次 sync/build。",
                    },
                  ],
                },
              ],
            }),
            call_id: "call_request_user_input",
          },
        },
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:03.000Z",
          payload: {
            type: "function_call_output",
            call_id: "call_request_user_input",
            output: JSON.stringify({
              answers: {
                local_form: {
                  answers: ["本地网页 (Recommended)"],
                },
                update_trigger: {
                  answers: ["None of the above", "user_note: 前端你打算怎么实现, 用框架吗"],
                },
              },
            }),
          },
        },
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:04.000Z",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "收到，我继续往下规划。" }],
          },
        },
      ]),
    );

    expect(parsed.firstUserMessage).toBe("先帮我锁一下实施方向");
    expect(parsed.turns[0]?.messages.map((message) => message.kind)).toEqual([
      "user",
      "assistant",
      "user_input_request",
      "user_input_response",
      "assistant",
    ]);

    const requestMessage = parsed.turns[0]?.messages[2];
    expect(requestMessage?.text).toContain("### 使用形态");
    expect(requestMessage?.text).toContain(
      "本地网页 (Recommended): 在浏览器里访问 localhost 或静态页面，保留网站形态。",
    );

    const responseMessage = parsed.turns[0]?.messages[3];
    expect(responseMessage?.text).toContain("### 更新触发");
    expect(responseMessage?.text).toContain("- None of the above");
    expect(responseMessage?.text).toContain("Note: 前端你打算怎么实现, 用框架吗");

    expect(parsed.turns[0]?.toolCalls).toHaveLength(0);
    expect(parsed.turns[0]?.toolResults).toHaveLength(0);
  });

  it("keeps request_user_input in the tool area when the answer payload cannot be parsed", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        baseSessionMeta,
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:00.000Z",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "先问我两个问题" }],
          },
        },
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:02.000Z",
          payload: {
            type: "function_call",
            name: "request_user_input",
            arguments: JSON.stringify({
              questions: [
                {
                  header: "使用形态",
                  id: "local_form",
                  question: "“本地自己用”具体更接近哪种形态？",
                  options: [{ label: "本地网页 (Recommended)" }],
                },
              ],
            }),
            call_id: "call_request_user_input",
          },
        },
        {
          type: "response_item",
          timestamp: "2026-03-08T06:20:03.000Z",
          payload: {
            type: "function_call_output",
            call_id: "call_request_user_input",
            output: '{"answers":',
          },
        },
      ]),
    );

    expect(parsed.turns[0]?.messages).toMatchObject([
      {
        kind: "user",
        text: "先问我两个问题",
      },
      {
        kind: "user_input_request",
      },
    ]);
    expect(parsed.turns[0]?.toolCalls.map((call) => call.name)).toEqual(["request_user_input"]);
    expect(parsed.turns[0]?.toolResults.map((result) => result.output)).toEqual(['{"answers":']);
  });

  it("uses the latest valid token_count snapshot and ignores trailing null info", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        baseSessionMeta,
        {
          type: "event_msg",
          timestamp: "2026-03-09T10:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              model_context_window: 128000,
              last_token_usage: {
                total_tokens: 24000,
              },
            },
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-03-09T10:01:00.000Z",
          payload: {
            type: "token_count",
            info: {
              model_context_window: 200000,
              last_token_usage: {
                total_tokens: 62000,
              },
              rate_limits: {
                primary: {
                  used_percent: 72.5,
                },
              },
            },
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-03-09T10:02:00.000Z",
          payload: {
            type: "token_count",
            info: null,
          },
        },
      ]),
    );

    expect(parsed.latestContext).toEqual({
      remainingPercent: 73,
      usedPercent: 27,
      totalTokens: 62000,
      modelContextWindow: 200000,
      timestamp: "2026-03-09T10:01:00.000Z",
      source: "token_count",
    });
  });

  it("falls back to the latest turn_started context window when no valid token snapshot exists", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        baseSessionMeta,
        {
          type: "event_msg",
          timestamp: "2026-03-09T11:00:00.000Z",
          payload: {
            type: "turn_started",
            model_context_window: 120000,
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-03-09T11:01:00.000Z",
          payload: {
            type: "token_count",
            info: null,
          },
        },
        {
          type: "event_msg",
          timestamp: "2026-03-09T11:02:00.000Z",
          payload: {
            type: "turn_started",
            model_context_window: 150000,
          },
        },
      ]),
    );

    expect(parsed.latestContext).toEqual({
      remainingPercent: 100,
      usedPercent: 0,
      totalTokens: 0,
      modelContextWindow: 150000,
      timestamp: "2026-03-09T11:02:00.000Z",
      source: "turn_started",
    });
  });

  it("returns an unknown token_count snapshot when required fields are missing", () => {
    const parsed = parseCodexSession(
      stringifyLines([
        baseSessionMeta,
        {
          type: "event_msg",
          timestamp: "2026-03-09T12:00:00.000Z",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                total_tokens: 88000,
              },
              last_token_usage: {
                total_tokens: "not-a-number",
              },
              rate_limits: {
                primary: {
                  used_percent: 72.5,
                },
              },
            },
          },
        },
      ]),
    );

    expect(parsed.latestContext).toEqual({
      remainingPercent: null,
      usedPercent: null,
      totalTokens: null,
      modelContextWindow: null,
      timestamp: "2026-03-09T12:00:00.000Z",
      source: "token_count",
    });
  });
});
