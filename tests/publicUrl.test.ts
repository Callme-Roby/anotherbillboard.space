import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";

import { assertPublicUrl, BlockedUrlError } from "@/lib/scrape/publicUrl";
import { fetchWithLimits } from "@/lib/scrape/fetchWithLimits";

/**
 * The purchase funnel fetches a URL the buyer chose, from inside the
 * deployment. These tests are the ones that say it cannot be pointed at
 * the infrastructure.
 *
 * Under NODE_ENV=test the address check is waived so the rest of the
 * suite can scrape loopback; `SCRAPE_ENFORCE_PUBLIC_HOSTS` closes it
 * back for the block below, which is therefore running exactly the
 * production code path.
 */
describe("blocking non-public URLs", () => {
  before(() => {
    process.env.SCRAPE_ENFORCE_PUBLIC_HOSTS = "1";
  });

  after(() => {
    delete process.env.SCRAPE_ENFORCE_PUBLIC_HOSTS;
  });

  const refused = async (url: string) => {
    await assert.rejects(() => assertPublicUrl(url), BlockedUrlError, `expected ${url} to be refused`);
  };

  it("refuses schemes that are not http(s)", async () => {
    await refused("file:///etc/passwd");
    await refused("data:text/html,<b>x</b>");
    await refused("ftp://example.com/x");
    await refused("gopher://example.com/x");
    await refused("not a url at all");
  });

  it("refuses the cloud metadata endpoint", async () => {
    await refused("http://169.254.169.254/latest/meta-data/iam/security-credentials/");
  });

  it("refuses loopback and private ranges", async () => {
    await refused("http://127.0.0.1/");
    await refused("http://127.13.37.1:8080/");
    await refused("http://10.0.0.5/");
    await refused("http://172.16.0.1/");
    await refused("http://192.168.1.1/");
    await refused("http://100.64.0.1/"); // carrier-grade NAT
    await refused("http://0.0.0.0/");
  });

  it("refuses the IPv6 equivalents, including IPv4-mapped forms", async () => {
    await refused("http://[::1]/");
    await refused("http://[::ffff:127.0.0.1]/");
    await refused("http://[fd00::1]/"); // unique local
    await refused("http://[fe80::1]/"); // link-local
  });

  it("refuses credentials in the URL", async () => {
    await refused("https://example.com@169.254.169.254/");
    await refused("https://user:secret@example.com/");
  });

  it("refuses a hostname that resolves to loopback", async () => {
    // Resolved through the system resolver, not pattern-matched on the
    // string: this is the case a naive "is it 127.0.0.1?" check misses.
    await refused("http://localhost/");
  });

  it("allows a public address", async () => {
    const url = await assertPublicUrl("http://8.8.8.8/robots.txt");
    assert.equal(url.hostname, "8.8.8.8");
  });
});

/**
 * A public host that answers `302 Location: <somewhere private>` is the
 * standard way past a guard that only checks the URL as typed, so the
 * redirect chain is followed by hand and every hop is re-checked.
 */
describe("following redirects safely", () => {
  let server: Server;
  let base: string;

  before(async () => {
    server = createServer((request, response) => {
      switch (request.url) {
        case "/hop":
          response.writeHead(302, { location: "/final" });
          response.end();
          return;
        case "/escape":
          // The scheme check applies even while the address check is
          // waived for tests, so this stands in for a redirect to a
          // private address without needing the door closed here.
          response.writeHead(302, { location: "file:///etc/passwd" });
          response.end();
          return;
        case "/loop":
          response.writeHead(302, { location: "/loop" });
          response.end();
          return;
        case "/final":
          response.writeHead(200, { "content-type": "text/plain" });
          response.end("arrived");
          return;
        default:
          response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address === "string" || address === null) throw new Error("no test server address");
    base = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("still follows an ordinary redirect to its destination", async () => {
    const body = await fetchWithLimits(`${base}/hop`, { timeoutMs: 4000, maxBytes: 1024 });
    assert.equal(body.toString("utf-8"), "arrived");
  });

  it("refuses a redirect that leaves http(s)", async () => {
    await assert.rejects(
      () => fetchWithLimits(`${base}/escape`, { timeoutMs: 4000, maxBytes: 1024 }),
      BlockedUrlError,
    );
  });

  it("gives up on a redirect loop instead of following it forever", async () => {
    await assert.rejects(
      () => fetchWithLimits(`${base}/loop`, { timeoutMs: 4000, maxBytes: 1024 }),
      /Too many redirects/,
    );
  });
});
