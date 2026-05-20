const LIGHT_THEME_PATHS = new Set(["/", "/dashboard", "/campaigns", "/login", "/whitelist"]);

export function getDocumentThemeClass(pathname: string) {
  return LIGHT_THEME_PATHS.has(pathname) ? "digiTheme" : "dark";
}
