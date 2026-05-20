const GENERIC_LOGIN_ERROR_MESSAGE = "Login gagal. Coba lagi atau hubungi administrator.";

export function getLoginErrorMessage(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const error = params.get("error");

  if (!error) {
    return null;
  }

  return error.trim() || GENERIC_LOGIN_ERROR_MESSAGE;
}
