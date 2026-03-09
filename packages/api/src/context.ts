import { auth } from "@if3250_k02_g01_dgw1/auth";
import { getAccessForEmail } from "@if3250_k02_g01_dgw1/auth/access";

export async function createContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  const access = await getAccessForEmail(session?.user.email);

  return {
    access,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
