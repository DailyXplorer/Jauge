/**
 * The only way the insights job reaches the network. Each fetcher is bound to an exact host allowlist:
 * https only, redirects followed only to allowlisted hosts, a timeout, a body size cap, and no cookies
 * in either direction.
 */

export type Fetcher = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

export interface SafeFetchOptions {
  hosts: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** The underlying fetch; tests pass a stub. */
  fetch?: Fetcher;
}

export class BlockedFetchError extends Error {
  override name = "BlockedFetchError";
}

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

export function createSafeFetch({
  hosts,
  timeoutMs = 10_000,
  maxBytes = 2 * 1024 * 1024,
  maxRedirects = 3,
  fetch: baseFetch = fetch,
}: SafeFetchOptions): Fetcher {
  const allowed = new Set(hosts);
  const check = (url: URL) => {
    if (url.protocol !== "https:") throw new BlockedFetchError(`not https: ${url.protocol}`);
    if (url.username || url.password) throw new BlockedFetchError("credentials in URL");
    if (!allowed.has(url.hostname) || (url.port && url.port !== "443")) {
      throw new BlockedFetchError(`host not allowlisted: ${url.host}`);
    }
  };

  return async (input, init) => {
    const request = new Request(input, init);
    let url = new URL(request.url);
    check(url);
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);

    for (let redirects = 0; ; redirects++) {
      const response = await baseFetch(url, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        credentials: "omit",
        signal,
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        if (body !== undefined) throw new BlockedFetchError("redirect on a request with a body");
        if (redirects >= maxRedirects) throw new BlockedFetchError("too many redirects");
        url = new URL(location, url);
        check(url);
        continue;
      }
      return readCapped(response, maxBytes);
    }
  };
}

async function readCapped(response: Response, maxBytes: number): Promise<Response> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new BlockedFetchError(`body over ${maxBytes} bytes`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new BlockedFetchError(`body over ${maxBytes} bytes`);
      chunks.push(chunk);
    }
  }
  const headers = new Headers(response.headers);
  for (const name of ["set-cookie", "content-encoding", "content-length"]) headers.delete(name);
  return new Response(NULL_BODY_STATUS.has(response.status) ? null : Buffer.concat(chunks), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
