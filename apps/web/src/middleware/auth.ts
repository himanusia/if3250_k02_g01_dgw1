import { getAuthContext } from "@if3250_k02_g01_dgw1/auth/context";
import { createMiddleware } from "@tanstack/react-start";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const authContext = await getAuthContext(request.headers);

  return next({
    context: authContext,
  });
});
