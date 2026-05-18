import { getWhitelistForEmail } from "./whitelist.js";
import { auth } from "./index.js";

export async function getAuthContext(headers: Headers) {
  const session = await auth.api.getSession({
    headers,
  });

  const whitelist = await getWhitelistForEmail(session?.user.email);

  return {
    whitelist,
    session,
  };
}

export type AuthContext = Awaited<ReturnType<typeof getAuthContext>>;
