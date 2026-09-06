import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";

import type { NextRequest } from "next/server";

import { POST as claimPanel } from "@/app/api/panels/claim/route";
import { createPendingPanelIdempotent } from "@/lib/db/queries/panels";

import { createTestDatabase, type TestDatabase } from "./support/database";

/**
 * The step after payment: the buyer hands over their URL and category,
 * and the panel is scraped, placed and finalized.
 *
 * The scrape is a real HTTP fetch of the submitted URL, so the test
 * serves a real page over loopback rather than stubbing the scraper —
 * the parsing this exercises is then the parsing production runs.
 */
describe("claiming a panel", () => {
  let database: TestDatabase;
  let server: Server;
  let siteUrl: string;

  before(async () => {
    database = await createTestDatabase();
    server = createServer((request, response) => {
      if (request.url !== "/") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><html><head>
        <title>Studio Marceau</title>
        <meta name="description" content="Agence de design et de stratégie de marque">
      </head><body>bonjour</body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address === "string" || address === null) throw new Error("no test server address");
    siteUrl = `http://127.0.0.1:${address.port}/`;
  });

  after(async () => {
    await database.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await database.reset();
  });

  const claim = (body: unknown) =>
    claimPanel(
      new Request("http://localhost/api/panels/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }) as NextRequest,
    );

  const pendingPanel = (sessionId: string, amountCents = 5000) =>
    createPendingPanelIdempotent(`evt_${sessionId}`, {
      amountCents,
      category: null,
      ownerEmail: null,
      notifyOnOutgrown: false,
      stripeCheckoutSessionId: sessionId,
    });

  it("scrapes, places and finalizes the panel", async () => {
    await pendingPanel("cs_claim_ok");

    const response = await claim({
      sessionId: "cs_claim_ok",
      url: siteUrl,
      category: "design",
    });
    assert.equal(response.status, 200);

    const { panel } = await response.json();
    assert.equal(panel.url, siteUrl);
    assert.equal(panel.title, "Studio Marceau");
    assert.equal(panel.description, "Agence de design et de stratégie de marque");
    assert.equal(panel.category, "design");
    // Placed and sized: this is what makes it show up in the scene.
    assert.equal(typeof panel.positionX, "number");
    assert.equal(typeof panel.positionY, "number");
    assert.ok(panel.size > 0);
  });

  it("rejects a category outside the known list", async () => {
    await pendingPanel("cs_claim_bad_category");

    const response = await claim({
      sessionId: "cs_claim_bad_category",
      url: siteUrl,
      category: "n-importe-quoi",
    });
    assert.equal(response.status, 400);
  });

  it("rejects a malformed URL", async () => {
    await pendingPanel("cs_claim_bad_url");

    const response = await claim({ sessionId: "cs_claim_bad_url", url: "pas-une-url", category: "autre" });
    assert.equal(response.status, 400);
  });

  it("refuses a session with no paid panel behind it", async () => {
    const response = await claim({ sessionId: "cs_never_paid", url: siteUrl, category: "autre" });
    assert.equal(response.status, 404);
  });

  it("is idempotent — a refresh returns the same panel, not a second one", async () => {
    await pendingPanel("cs_claim_twice");

    const first = await (await claim({ sessionId: "cs_claim_twice", url: siteUrl, category: "photo" })).json();
    const second = await (await claim({ sessionId: "cs_claim_twice", url: siteUrl, category: "photo" })).json();

    assert.equal(first.panel.id, second.panel.id);
    assert.equal(second.panel.positionX, first.panel.positionX);
  });

  it("places a second panel clear of the first", async () => {
    await pendingPanel("cs_place_a", 20000);
    await pendingPanel("cs_place_b", 20000);

    const a = (await (await claim({ sessionId: "cs_place_a", url: siteUrl, category: "autre" })).json()).panel;
    const b = (await (await claim({ sessionId: "cs_place_b", url: siteUrl, category: "autre" })).json()).panel;

    const distance = Math.hypot(a.positionX - b.positionX, a.positionY - b.positionY);
    // Panels collide as bounding circles of half their *width*; two
    // touching ones would sit exactly the sum of those radii apart.
    const radii = (a.size * 1.7777 + b.size * 1.7777) / 2;
    assert.ok(distance > radii, `panels overlap: ${distance} <= ${radii}`);
  });
});
