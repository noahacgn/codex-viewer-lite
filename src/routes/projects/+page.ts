import { getProjects } from "$lib/client/api";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  return {
    projects: await getProjects(fetch),
  };
};
