const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  code: string;
  details?: unknown;
  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; meta?: ApiSuccess<T>["meta"] }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  // CSV export and similar non-JSON responses bypass the envelope entirely.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) throw new ApiError("Request failed", "UNKNOWN");
    return { data: (await res.blob()) as unknown as T };
  }

  const body = (await res.json()) as ApiSuccess<T> | ApiFailure;

  if (!body.success) {
    throw new ApiError(body.error.message, body.error.code, body.error.details);
  }
  return { data: body.data, meta: body.meta };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
