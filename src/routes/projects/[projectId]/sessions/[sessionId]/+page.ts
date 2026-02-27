import type { PageLoad } from "./$types";
import { getSessionDetail } from "$lib/client/api";

export const load: PageLoad = async ({ fetch, params }) => {
  return {
    session: await getSessionDetail(fetch, params.projectId, params.sessionId),
    projectId: params.projectId
  };
};
