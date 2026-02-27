const toBase64Url = (value: string) => {
  return Buffer.from(value, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf-8");
};

export const encodeProjectId = (workspacePath: string) => toBase64Url(workspacePath);
export const encodeSessionId = (sessionPath: string) => toBase64Url(sessionPath);

export const decodeProjectId = (projectId: string) => {
  try {
    return fromBase64Url(projectId);
  } catch (error) {
    throw new Error(`Invalid projectId: ${projectId}`, { cause: error });
  }
};

export const decodeSessionId = (sessionId: string) => {
  try {
    return fromBase64Url(sessionId);
  } catch (error) {
    throw new Error(`Invalid sessionId: ${sessionId}`, { cause: error });
  }
};
