export type CodexMessage = {
  id: string;
  text: string;
  timestamp: string | null;
  source: "response_item" | "event_msg";
};

export type CodexToolCall = {
  id: string;
  name: string;
  arguments: string | null;
  callId: string | null;
  timestamp: string | null;
};

export type CodexToolResult = {
  id: string;
  callId: string | null;
  output: string | null;
  timestamp: string | null;
};

export type CodexReasoning = {
  id: string;
  summary: string | null;
  text: string | null;
  timestamp: string | null;
  encrypted: boolean;
};

export type CodexSessionTurn = {
  id: string;
  userMessage: CodexMessage | null;
  assistantMessages: CodexMessage[];
  reasonings: CodexReasoning[];
  toolCalls: CodexToolCall[];
  toolResults: CodexToolResult[];
};

export type CodexSessionMeta = {
  sessionUuid: string | null;
  cwd: string | null;
  instructions: string | null;
  originator: string | null;
  cliVersion: string | null;
  timestamp: string | null;
};

export type SessionMeta = {
  messageCount: number;
  lastModifiedAt: string | null;
  startedAt: string | null;
  firstUserMessage: string | null;
};

export type Session = {
  id: string;
  sessionUuid: string | null;
  jsonlFilePath: string;
  meta: SessionMeta;
};

export type SessionDetail = Session & {
  turns: CodexSessionTurn[];
  sessionMeta: CodexSessionMeta;
};

export type ProjectMeta = {
  workspaceName: string;
  workspacePath: string;
  lastSessionAt: string | null;
  sessionCount: number;
};

export type Project = {
  id: string;
  workspacePath: string;
  meta: ProjectMeta;
};

export type SseEvent =
  | {
      type: "connected";
      id: string;
      timestamp: string;
      message: string;
    }
  | {
      type: "heartbeat";
      id: string;
      timestamp: string;
    }
  | {
      type: "project_changed";
      id: string;
      timestamp: string;
      data: {
        projectId: string | null;
        fileEventType: string;
      };
    }
  | {
      type: "session_changed";
      id: string;
      timestamp: string;
      data: {
        projectId: string | null;
        sessionId: string | null;
        fileEventType: string;
      };
    };
