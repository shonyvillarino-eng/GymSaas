export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

const envApiUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE;
export const API_BASE = envApiUrl ? `${envApiUrl.replace(/\/$/, '')}/api/v1` : '/api/v1';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let body: ApiError | undefined;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = undefined;
    }
    throw new ApiRequestError(res.status, body?.error ?? 'Request failed', body?.details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiRequestError extends Error {
  status: number;
  details?: Record<string, string[]>;

  constructor(status: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

/** Human-readable message for forms: merges backend field details when present. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const details = Object.values(error.details ?? {}).flat().join(' ');
    return details ? `${error.message}: ${details}` : error.message;
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
}