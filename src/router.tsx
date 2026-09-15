import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent, AppNotFoundComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  basepath: import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, ""),
  routeTree,
  defaultErrorComponent: AppErrorComponent,
  defaultNotFoundComponent: AppNotFoundComponent,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
