import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Thrown when a URL must not be fetched from the server: wrong scheme,
 * unresolvable host, or a host that points somewhere inside the
 * infrastructure rather than at the public internet.
 *
 * Its message is for logs, not for the buyer — see the claim route:
 * echoing *why* a URL was refused turns the endpoint into a probe for
 * what exists on the private network.
 */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

const DNS_TIMEOUT_MS = 3000;

/**
 * Ranges that must never be reachable from a buyer-supplied URL.
 *
 * Loopback and the RFC1918 blocks are the obvious ones; the rest matter
 * just as much in a serverless deployment:
 * - 169.254.0.0/16 carries the cloud metadata endpoint (169.254.169.254),
 *   the classic SSRF payload for stealing instance credentials;
 * - 100.64.0.0/10 (CGNAT) is what several providers use for internal
 *   service meshes;
 * - fc00::/7 and fe80::/10 are the IPv6 equivalents of the two above,
 *   and are easy to forget when the IPv4 list looks complete;
 * - 2001::/23 covers Teredo, which tunnels arbitrary IPv4 destinations.
 *
 * `net.BlockList` handles the parsing, including IPv4-mapped IPv6
 * (`::ffff:127.0.0.1` is checked against the IPv4 rules) — verified
 * against Node 22 rather than assumed. Note that `check()` defaults to
 * `"ipv4"` and silently answers `false` for an IPv6 address when the
 * family is omitted, so every call below passes it explicitly.
 */
const BLOCKED = buildBlockList();

function buildBlockList(): net.BlockList {
  const list = new net.BlockList();

  list.addSubnet("0.0.0.0", 8, "ipv4"); // "this network"
  list.addSubnet("10.0.0.0", 8, "ipv4"); // private
  list.addSubnet("100.64.0.0", 10, "ipv4"); // carrier-grade NAT
  list.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
  list.addSubnet("169.254.0.0", 16, "ipv4"); // link-local + cloud metadata
  list.addSubnet("172.16.0.0", 12, "ipv4"); // private
  list.addSubnet("192.0.0.0", 24, "ipv4"); // IETF protocol assignments
  list.addSubnet("192.0.2.0", 24, "ipv4"); // TEST-NET-1
  list.addSubnet("192.88.99.0", 24, "ipv4"); // 6to4 relay anycast
  list.addSubnet("192.168.0.0", 16, "ipv4"); // private
  list.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
  list.addSubnet("198.51.100.0", 24, "ipv4"); // TEST-NET-2
  list.addSubnet("203.0.113.0", 24, "ipv4"); // TEST-NET-3
  list.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
  list.addSubnet("240.0.0.0", 4, "ipv4"); // reserved, incl. broadcast

  list.addAddress("::", "ipv6"); // unspecified
  list.addAddress("::1", "ipv6"); // loopback
  list.addSubnet("64:ff9b::", 96, "ipv6"); // NAT64
  list.addSubnet("64:ff9b:1::", 48, "ipv6"); // local-use NAT64
  list.addSubnet("100::", 64, "ipv6"); // discard-only
  list.addSubnet("2001::", 23, "ipv6"); // IETF protocol assignments (Teredo)
  list.addSubnet("2001:db8::", 32, "ipv6"); // documentation
  list.addSubnet("fc00::", 7, "ipv6"); // unique local
  list.addSubnet("fe80::", 10, "ipv6"); // link-local
  list.addSubnet("ff00::", 8, "ipv6"); // multicast

  return list;
}

/**
 * The test suite scrapes a throwaway HTTP server on 127.0.0.1 (see
 * tests/claim.test.ts) — the whole point being to exercise the funnel
 * without touching the network. Only `NODE_ENV=test` opens that door,
 * which `next build` and `next start` never set, so it cannot be turned
 * on in a deployed app; and the scheme, credential and redirect checks
 * apply in tests too, since only the address check is waived.
 *
 * A door that is only ever open would leave the address check itself
 * untested, so `SCRAPE_ENFORCE_PUBLIC_HOSTS=1` closes it back: that is
 * how tests/publicUrl.test.ts exercises the production behaviour.
 */
function allowPrivateHosts(): boolean {
  return process.env.NODE_ENV === "test" && process.env.SCRAPE_ENFORCE_PUBLIC_HOSTS !== "1";
}

/**
 * Guards every server-side fetch of a buyer-supplied URL against SSRF.
 *
 * Anyone willing to pay the minimum amount gets to hand this app a URL
 * that it fetches *from the inside* — so without this, the purchase
 * funnel is a request proxy into whatever the deployment can reach
 * (metadata endpoint, database, internal APIs), with the reply visible
 * through the scraped title/description.
 *
 * Two layers: the scheme has to be http(s) (no `file:`, `data:`, `ftp:`,
 * `gopher:`), and every address the host resolves to has to be public.
 * *Every* one, not just the first — a hostname with both a public A
 * record and a loopback AAAA record is a rebinding attempt, and nothing
 * here decides which of the two the socket will pick.
 *
 * Residual risk, stated rather than papered over: a DNS record whose TTL
 * expires between this check and the connection can still swing to a
 * private address. Closing that needs the connection pinned to the
 * address that was validated (a custom `lookup` on an undici dispatcher),
 * which Next's patched `fetch` does not reliably carry through. The
 * window is small, the attacker needs authoritative DNS control, and the
 * payoff is bounded by the byte cap and the scrape output — worth
 * knowing about, not worth an unreliable dispatcher.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError(`Not a valid absolute URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError(`Refusing scheme ${url.protocol} for ${rawUrl}`);
  }

  // Credentials in a URL are never needed for a public homepage, and
  // they are a standard way of confusing naive host parsing
  // (`https://trusted.example@169.254.169.254/`). Nothing here parses
  // the host by hand, but there is no reason to accept them either.
  if (url.username || url.password) {
    throw new BlockedUrlError(`Refusing credentials in URL for ${url.host}`);
  }

  if (allowPrivateHosts()) return url;

  // `URL.hostname` keeps the brackets around an IPv6 literal.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  const literalFamily = net.isIP(hostname);
  if (literalFamily !== 0) {
    assertAddressAllowed(hostname, literalFamily === 6 ? "ipv6" : "ipv4");
    return url;
  }

  const addresses = await resolveHost(hostname);
  if (addresses.length === 0) {
    throw new BlockedUrlError(`Host ${hostname} resolves to nothing`);
  }
  for (const address of addresses) {
    assertAddressAllowed(address.address, address.family === 6 ? "ipv6" : "ipv4");
  }

  return url;
}

function assertAddressAllowed(address: string, family: "ipv4" | "ipv6"): void {
  if (BLOCKED.check(address, family)) {
    throw new BlockedUrlError(`Refusing non-public address ${address}`);
  }
}

async function resolveHost(hostname: string): Promise<Array<{ address: string; family: number }>> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new BlockedUrlError(`DNS lookup timed out for ${hostname}`)), DNS_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error instanceof BlockedUrlError) throw error;
    throw new BlockedUrlError(`DNS lookup failed for ${hostname}: ${String(error)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
