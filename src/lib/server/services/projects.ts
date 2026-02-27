import { getWorkspaceName, listSessionRecords } from "$lib/server/codex/session-files";
import { encodeProjectId } from "$lib/server/ids";
import { getSessions } from "$lib/server/services/sessions";
import type { Project } from "$lib/shared/types";

const sortProjects = (projects: Project[]) => {
  return projects.sort((a, b) => {
    const aTime = a.meta.lastSessionAt ? new Date(a.meta.lastSessionAt).getTime() : 0;
    const bTime = b.meta.lastSessionAt ? new Date(b.meta.lastSessionAt).getTime() : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    return a.meta.workspaceName.localeCompare(b.meta.workspaceName);
  });
};

export const getProjects = async (): Promise<Project[]> => {
  const sessionRecords = await listSessionRecords();
  const byWorkspace = new Map<
    string,
    {
      sessionCount: number;
      latest: Date | null;
    }
  >();

  for (const record of sessionRecords) {
    if (!record.workspacePath) {
      continue;
    }
    const current = byWorkspace.get(record.workspacePath);
    if (!current) {
      byWorkspace.set(record.workspacePath, {
        sessionCount: 1,
        latest: record.lastModifiedAt,
      });
      continue;
    }

    current.sessionCount += 1;
    if (!current.latest || (record.lastModifiedAt && record.lastModifiedAt > current.latest)) {
      current.latest = record.lastModifiedAt;
    }
  }

  const projects: Project[] = [];
  for (const [workspacePath, aggregate] of byWorkspace.entries()) {
    projects.push({
      id: encodeProjectId(workspacePath),
      workspacePath,
      meta: {
        workspaceName: getWorkspaceName(workspacePath),
        workspacePath,
        lastSessionAt: aggregate.latest ? aggregate.latest.toISOString() : null,
        sessionCount: aggregate.sessionCount,
      },
    });
  }

  return sortProjects(projects);
};

export const getProjectWithSessions = async (projectId: string) => {
  const projects = await getProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found for id: ${projectId}`);
  }
  const sessions = await getSessions(projectId);
  return { project, sessions };
};
