import { getAuthContext } from "@if3250_k02_g01_dgw1/auth/context";

export async function createContext({ req }: { req: Request }) {
  return getAuthContext(req.headers);
}

export type Context = Awaited<ReturnType<typeof createContext>>;
