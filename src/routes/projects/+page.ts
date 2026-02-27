import type { PageLoad } from "./$types";
import { getProjects } from "$lib/client/api";

export const load: PageLoad = async ({ fetch }) => {
  return {
    projects: await getProjects(fetch)
  };
};
