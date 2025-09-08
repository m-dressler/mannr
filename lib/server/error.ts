/**
 * Custom error class for API errors with HTTP status codes
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public toastKey?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Creates an appropriate error response based on the request type
 * - For API requests (Accept: application/json): Returns JSON error
 * - For form submissions: Redirects with error toast
 *
 * Note: Error toast keys must be defined in the page's language file with data-type="error"
 */
export const createErrorResponse = (
  error: ApiError | Error,
  request: Request,
): Response => {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error.message;

  // Check if this is an API request (JSON expected)
  const acceptsJson = request.headers.get("Accept")?.includes(
    "application/json",
  );

  if (acceptsJson) {
    // API request - return JSON
    return Response.json({ message }, { status });
  } else {
    // Form submission - redirect with toast
    // The toast key should correspond to a <data name="key" data-type="error"> element
    const url = new URL(request.url);

    // Use custom toast key if provided, otherwise use generic error
    const toastKey = error instanceof ApiError && error.toastKey
      ? error.toastKey
      : "generic";

    url.searchParams.set("toast", toastKey);

    return Response.redirect(url.toString(), 303);
  }
};

/**
 * Creates an appropriate success response based on the request type
 * - For API requests (Accept: application/json): Returns JSON with data
 * - For form submissions: Redirects with success toast
 */
export const createSuccessResponse = (
  request: Request,
  data?: Record<string, unknown>,
  toastKey?: string,
): Response => {
  const acceptsJson = request.headers.get("Accept")?.includes(
    "application/json",
  );

  if (acceptsJson) {
    // API request - return JSON
    return Response.json({ success: true, ...data });
  } else {
    // Form submission - redirect with toast
    const url = new URL(request.url);
    if (toastKey) {
      url.searchParams.set("toast", toastKey);
    }
    return Response.redirect(url.toString(), 303);
  }
};

/**
 * Higher-order function that wraps a PagesFunction handler to automatically
 * catch and handle errors using createErrorResponse
 *
 * @example
 * export const onRequestPost = forwardErrors(async (ctx) => {
 *   // Your handler code that can throw ApiError
 *   throw new ApiError("Not found", 404, "not_found");
 * });
 */
export const forwardErrors = <
  Env = unknown,
  Params extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
>(
  fn: PagesFunction<Env, Params, Data>,
): PagesFunction<Env, Params, Data> => {
  return async (context) => {
    try {
      return await fn(context);
    } catch (error) {
      return createErrorResponse(error as Error, context.request);
    }
  };
};
