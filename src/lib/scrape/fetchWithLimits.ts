import { assertPublicUrl, BlockedUrlError } from "./publicUrl";

/** Enough for the redirect chains real sites use (apex → www → https). */
const MAX_REDIRECTS = 5;

/**
 * Fetch with a hard timeout, a hard byte cap enforced during streaming
 * rather than trusted from `Content-Length` (a malicious or
 * misconfigured server can omit or lie about it), and an SSRF guard on
 * every hop. Used for every external URL this app fetches at purchase
 * time — the target site and its favicon are both attacker-controlled
 * input in the sense that anyone willing to pay the minimum purchase
 * amount can point them anywhere.
 *
 * Redirects are followed by hand instead of by `redirect: "follow"`,
 * for the reason that makes SSRF guards leak: checking only the URL the
 * buyer typed is useless when a perfectly public host can answer `302
 * Location: http://169.254.169.254/`. Every hop goes through
 * `assertPublicUrl`, and the timeout covers the whole chain rather than
 * resetting on each hop.
 */
export async function fetchWithLimits(
  url: string,
  options: { timeoutMs: number; maxBytes: number; headers?: HeadersInit },
): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const hop = (to: URL) =>
      fetch(to, {
        signal: controller.signal,
        headers: options.headers,
        redirect: "manual",
      });

    let target = await assertPublicUrl(url);
    let response = await hop(target);

    for (let followed = 0; ; followed++) {
      const location = response.headers.get("location");
      if (!isRedirect(response.status) || !location) break;

      if (followed >= MAX_REDIRECTS) {
        await release(response);
        throw new Error(`Too many redirects (over ${MAX_REDIRECTS}) starting from ${url}`);
      }

      // Node hands back the real 3xx response (not a browser's opaque
      // redirect), so the body is a live stream holding the socket —
      // release it before the next hop.
      await release(response);

      let next: URL;
      try {
        next = new URL(location, target);
      } catch {
        throw new BlockedUrlError(`Redirect to an unparseable location from ${target.href}`);
      }
      target = await assertPublicUrl(next.href);
      response = await hop(target);
    }

    if (isRedirect(response.status)) {
      await release(response);
      throw new Error(`Redirect without a usable Location for ${target.href}`);
    }

    if (!response.ok) {
      await release(response);
      throw new Error(`Fetch failed: HTTP ${response.status} for ${target.href}`);
    }

    const declaredLength = response.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > options.maxBytes) {
      await release(response);
      throw new Error(`Response declares ${declaredLength} bytes, over the ${options.maxBytes} limit`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > options.maxBytes) {
        throw new Error(`Response exceeded the ${options.maxBytes}-byte limit`);
      }
      return buffer;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        await reader.cancel();
        throw new Error(`Response exceeded the ${options.maxBytes}-byte limit`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Frees the socket held by a response body this function won't read. */
async function release(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}
