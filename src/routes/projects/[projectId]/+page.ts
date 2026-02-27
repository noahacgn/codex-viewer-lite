import { getProjectWithSessions } from "$lib/client/api";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params }) => {
  return await getProjectWithSessions(fetch, params.projectId);
};
