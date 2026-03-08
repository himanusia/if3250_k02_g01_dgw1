import { redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

export async function requireAuth() {
  const session = await getUser();

  if (!session) {
    throw redirect({
      to: "/login",
    });
  }

  return session;
}

export async function redirectIfAuthenticated() {
  const session = await getUser();

  if (session) {
    throw redirect({
      to: "/dashboard",
    });
  }

  return session;
}