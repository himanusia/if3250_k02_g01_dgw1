import { redirect } from "@tanstack/react-router";

import { getAuthState } from "../functions/get-auth-state";

export async function requireAdminWhitelist() {
  const authState = await getAuthState();

  if (!authState.session) {
    throw redirect({
      to: "/login",
    });
  }

  if (authState.whitelist?.role !== "admin") {
    throw redirect({
      to: "/unauthorized",
    });
  }

  return authState;
}