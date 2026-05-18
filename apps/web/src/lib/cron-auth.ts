export function isAuthorizedCronRequest(request: Request, configuredSecret: string) {
  const secret = configuredSecret.trim();

  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  return scheme === "Bearer" && token === secret;
}
