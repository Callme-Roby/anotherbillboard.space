/**
 * Fetch with a hard timeout and a hard byte cap, enforced during
 * streaming rather than trusted from `Content-Length` (a malicious or
 * misconfigured server can omit or lie about it). Used for every
 * external URL this app fetches at purchase time — the target site and
 * its favicon are both attacker-controlled input in the sense that
 * anyone willing to pay the minimum purchase amount can point them
 * anywhere.
 */
export async function fetchWithLimits(
  url: string,
  options: { timeoutMs: number; maxBytes: number; headers?: HeadersInit },
): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: options.headers,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: HTTP ${response.status} for ${url}`);
    }

    const declaredLength = response.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > options.maxBytes) {
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
