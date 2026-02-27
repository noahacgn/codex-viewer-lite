import type { PageLoad } from "./$types";
import { getProjectWithSessions } from "$lib/client/api";

export const load: PageLoad = async ({ fetch, params }) => {
  return await getProjectWithSessions(fetch, params.projectId);
};
