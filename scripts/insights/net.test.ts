import { describe, expect, it } from "vitest";
import { createSafeFetch, type Fetcher } from "./net";

interface Call {
  url: string;
  init: RequestInit;
}

/** A fake network: answers by URL and records every request that would have left the machine. */
function network(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetch: Fetcher = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`unexpected request to ${url}`);
    return route();
  };
  return { calls, fetch };
}

const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });

describe("createSafeFetch", () => {
  it("fetches an allowlisted https host and returns the body", async () => {
    const net = network({ "https://feeds.example.org/rss": () => new Response("<rss/>") });
    const safeFetch = createSafeFetch({ hosts: ["feeds.example.org"], fetch: net.fetch });
    const response = await safeFetch("https://feeds.example.org/rss");
    expect(await response.text()).toBe("<rss/>");
    expect(net.calls.map((c) => [c.url, c.init.redirect, c.init.credentials])).toEqual([
      ["https://feeds.example.org/rss", "manual", "omit"],
    ]);
  });

  it("refuses a host outside the allowlist, plain http and URL credentials without sending anything", async () => {
    const net = network({});
    const safeFetch = createSafeFetch({ hosts: ["feeds.example.org"], fetch: net.fetch });
    await expect(safeFetch("https://evil.example.com/")).rejects.toThrow("host not allowlisted: evil.example.com");
    await expect(safeFetch("https://feeds.example.org.evil.com/")).rejects.toThrow("host not allowlisted");
    await expect(safeFetch("http://feeds.example.org/rss")).rejects.toThrow("not https: http:");
    await expect(safeFetch("https://user:pass@feeds.example.org/rss")).rejects.toThrow(/credentials/);
    await expect(safeFetch("https://feeds.example.org:8443/rss")).rejects.toThrow("host not allowlisted");
    expect(net.calls).toEqual([]);
  });

  it("follows a redirect to an allowlisted host only", async () => {
    const net = network({
      "https://a.example.org/old": redirect("https://b.example.org/new"),
      "https://b.example.org/new": () => new Response("moved"),
      "https://a.example.org/leak": redirect("https://evil.example.com/collect"),
      "https://a.example.org/downgrade": redirect("http://b.example.org/new"),
      "https://a.example.org/userinfo": redirect("https://user:pass@b.example.org/new"),
    });
    const safeFetch = createSafeFetch({ hosts: ["a.example.org", "b.example.org"], fetch: net.fetch });
    expect(await (await safeFetch("https://a.example.org/old")).text()).toBe("moved");
    await expect(safeFetch("https://a.example.org/leak")).rejects.toThrow("host not allowlisted: evil.example.com");
    await expect(safeFetch("https://a.example.org/downgrade")).rejects.toThrow("not https");
    await expect(safeFetch("https://a.example.org/userinfo")).rejects.toThrow("credentials in URL");
    expect(net.calls.map((c) => c.url)).toEqual([
      "https://a.example.org/old",
      "https://b.example.org/new",
      "https://a.example.org/leak",
      "https://a.example.org/downgrade",
      "https://a.example.org/userinfo",
    ]);
  });

  it("stops after too many redirects", async () => {
    const net = network({ "https://a.example.org/loop": redirect("/loop") });
    const safeFetch = createSafeFetch({ hosts: ["a.example.org"], fetch: net.fetch, maxRedirects: 2 });
    await expect(safeFetch("https://a.example.org/loop")).rejects.toThrow("too many redirects");
    expect(net.calls).toHaveLength(3);
  });

  it("rejects a body over the size cap, declared or streamed", async () => {
    const net = network({
      "https://a.example.org/declared": () => new Response("x", { headers: { "content-length": "999999" } }),
      "https://a.example.org/streamed": () => new Response("x".repeat(2000)),
      "https://a.example.org/small": () => new Response("x".repeat(1000)),
    });
    const safeFetch = createSafeFetch({ hosts: ["a.example.org"], fetch: net.fetch, maxBytes: 1000 });
    await expect(safeFetch("https://a.example.org/declared")).rejects.toThrow("body over 1000 bytes");
    await expect(safeFetch("https://a.example.org/streamed")).rejects.toThrow("body over 1000 bytes");
    expect((await (await safeFetch("https://a.example.org/small")).text()).length).toBe(1000);
  });

  it("sends no cookie and returns no set-cookie", async () => {
    const net = network({
      "https://a.example.org/": () => new Response("ok", { headers: { "set-cookie": "session=1", "content-type": "text/xml" } }),
    });
    const safeFetch = createSafeFetch({ hosts: ["a.example.org"], fetch: net.fetch });
    const response = await safeFetch("https://a.example.org/", { headers: { cookie: "session=1", accept: "text/xml" } });
    const sent = new Headers(net.calls[0].init.headers);
    expect([sent.get("cookie"), sent.get("accept")]).toEqual([null, "text/xml"]);
    expect([response.headers.get("set-cookie"), response.headers.get("content-type")]).toEqual([null, "text/xml"]);
  });

  it("forwards a POST body, as the Mistral SDK sends it", async () => {
    const net = network({ "https://api.example.org/v1/conversations": () => new Response('{"ok":true}') });
    const safeFetch = createSafeFetch({ hosts: ["api.example.org"], fetch: net.fetch });
    const request = new Request("https://api.example.org/v1/conversations", { method: "POST", body: '{"model":"m"}' });
    expect(await (await safeFetch(request)).json()).toEqual({ ok: true });
    expect([net.calls[0].init.method, new TextDecoder().decode(net.calls[0].init.body as ArrayBuffer)]).toEqual([
      "POST",
      '{"model":"m"}',
    ]);
  });

  it("aborts a request that outlives the timeout", async () => {
    const hang: Fetcher = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    const safeFetch = createSafeFetch({ hosts: ["a.example.org"], fetch: hang, timeoutMs: 20 });
    await expect(safeFetch("https://a.example.org/slow")).rejects.toThrow(/timeout|aborted/i);
  });
});
