type AuthState = {
  access: unknown | null;
  session: unknown | null;
};

export async function loadAuthStateSafely(
  loadAuthState: () => Promise<AuthState>,
): Promise<AuthState> {
  try {
    return await loadAuthState();
  } catch {
    console.warn("Failed to load auth state; treating request as anonymous.");

    return {
      access: null,
      session: null,
    };
  }
}
