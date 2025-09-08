/** Get user's locale from Accept-Language header, fallback to 'en-US' */
export const getLocale = (request: Request<unknown, unknown>): string =>
  request.headers.get("Accept-Language")?.split(",").at(0)?.trim() || "en-US";
