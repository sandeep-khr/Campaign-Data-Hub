export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiUrl(
  path: string,
  parameters: Record<string, string | undefined> = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value) query.set(key, value);
  }
  return `/api/${path}${query.size ? `?${query}` : ""}`;
}

export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}). Please try again.`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) {
        message = body.detail
          .map((item: { msg: string }) => item.msg)
          .join(" ");
      }
    } catch {
      /* A proxy or server may return an error without a JSON body. */
    }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}
