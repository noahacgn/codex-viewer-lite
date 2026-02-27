import { error } from "@sveltejs/kit";
import type { Project, Session, SessionDetail } from "$lib/shared/types";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const fetchJson = async <T>(fetcher: Fetcher, path: string): Promise<T> => {
  const response = await fetcher(path);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unknown error" }));
    throw error(response.status, body.error ?? `Request failed: ${path}`);
  }
  return (await response.json()) as T;
};

export const getProjects = async (fetcher: Fetcher) => {
  const data = await fetchJson<{ projects: Project[] }>(fetcher, "/api/projects");
  return data.projects;
};

export const getProjectWithSessions = async (fetcher: Fetcher, projectId: string) => {
  return await fetchJson<{ project: Project; sessions: Session[] }>(fetcher, `/api/projects/${projectId}`);
};

export const getSessionDetail = async (fetcher: Fetcher, projectId: string, sessionId: string) => {
  const path = `/api/projects/${projectId}/sessions/${sessionId}`;
  const data = await fetchJson<{ session: SessionDetail }>(fetcher, path);
  return data.session;
};
