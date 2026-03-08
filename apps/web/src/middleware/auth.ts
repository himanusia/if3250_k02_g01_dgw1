import { auth } from "@if3250_k02_g01_dgw1/auth";
import { getAccessForEmail } from "@if3250_k02_g01_dgw1/auth/access";
import { createMiddleware } from "@tanstack/react-start";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const access = await getAccessForEmail(session?.user.email);

  return next({
    context: { access, session },
  });
});
