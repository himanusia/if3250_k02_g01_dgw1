type AuthState = {
  whitelist: { role?: string } | null;
  session: unknown | null;
};

export async function loadAuthStateSafely(
  loadAuthState: () => Promise<AuthState>,
): Promise<AuthState> {
  try {
    return await loadAuthState();
  } catch (error) {
    console.error("[auth-state] failed to load auth state; treating as anonymous", error);

    return {
      whitelist: null,
      session: null,
    };
  }
}
