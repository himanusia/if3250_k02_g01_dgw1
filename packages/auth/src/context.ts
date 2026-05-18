import { getAccessForEmail } from "./access.js";
import { auth } from "./index.js";

export async function getAuthContext(headers: Headers) {
  const session = await auth.api.getSession({
    headers,
  });

  const access = await getAccessForEmail(session?.user.email);

  return {
    access,
    session,
  };
}

export type AuthContext = Awaited<ReturnType<typeof getAuthContext>>;
