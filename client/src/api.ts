export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<T> {
  const { timeout = 10000, ...fetchInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      ...fetchInit,
      signal: controller.signal,
      headers: {
        ...(fetchInit.body && !(fetchInit.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...fetchInit.headers,
      },
    });
  const data = (await res
    .json()
    .catch(() => ({ error: "服务暂时没有响应，请重试。" }))) as unknown as {
    error?: { message?: string } | string;
    message?: string;
  };
  if (!res.ok) {
    const errMsg =
      typeof data.error === "string"
        ? data.error
        : (data.error?.message || data.message || "操作失败，请重试。");
    throw new ApiError(res.status, errMsg);
  }
  return data as unknown as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError(408, "请求超时，请检查网络后重试。");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
