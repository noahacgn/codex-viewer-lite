import { getSessionDetail } from "$lib/client/api";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params }) => {
  return {
    session: await getSessionDetail(fetch, params.projectId, params.sessionId),
    projectId: params.projectId,
  };
};
