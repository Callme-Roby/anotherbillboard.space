import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import type { NextRequest } from "next/server";
import Stripe from "stripe";

import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { findPanelBySessionId } from "@/lib/db/queries/panels";

import { createTestDatabase, type TestDatabase } from "./support/database";

const WEBHOOK_SECRET = "whsec_test_offline";

/**
 * The webhook, signature and all.
 *
 * Nothing here needs the network: the handler only ever reads the event
 * it was posted, and Stripe's own SDK can both sign a payload
 * (`generateTestHeaderString`) and verify it offline. So the exact code
 * that will run in production against real Stripe deliveries — including
 * the signature check that rejects forgeries — is what runs here.
 */
describe("stripe webhook", () => {
  let database: TestDatabase;
  let stripe: Stripe;

  before(async () => {
    process.env.STRIPE_SECRET_KEY ??= "sk_test_offline";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    database = await createTestDatabase();
  });
  after(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
  });

  const checkoutCompleted = (overrides: {
    eventId: string;
    sessionId: string;
    amountTotal?: number;
    metadata?: Record<string, string>;
  }) => ({
    id: overrides.eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: overrides.sessionId,
        object: "checkout.session",
        amount_total: overrides.amountTotal ?? 5000,
        metadata: overrides.metadata ?? { type: "new_panel" },
      },
    },
  });

  const deliver = (event: unknown, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    return stripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": signature },
        body: payload,
      }) as NextRequest,
    );
  };

  it("creates the pending panel from a signed delivery", async () => {
    const response = await deliver(
      checkoutCompleted({
        eventId: "evt_hook_new",
        sessionId: "cs_hook_new",
        amountTotal: 12500,
        metadata: { type: "new_panel", category: "marketing", ownerEmail: "a@b.fr" },
      }),
    );
    assert.equal(response.status, 200);

    const panel = await findPanelBySessionId("cs_hook_new");
    assert.ok(panel, "the delivery should have created a panel");
    assert.equal(panel.amount, 12500);
    assert.equal(panel.category, "marketing");
    assert.equal(panel.ownerEmail, "a@b.fr");
  });

  it("rejects a forged signature", async () => {
    const response = await deliver(
      checkoutCompleted({ eventId: "evt_forged", sessionId: "cs_forged" }),
      "whsec_the_wrong_secret",
    );
    assert.equal(response.status, 400);
    assert.equal(await findPanelBySessionId("cs_forged"), undefined);
  });

  it("does not pay out twice on a re-delivered event", async () => {
    const event = checkoutCompleted({ eventId: "evt_replay", sessionId: "cs_replay" });

    assert.equal((await deliver(event)).status, 200);
    // Stripe documents that it re-delivers; the second must be a no-op
    // success, not an error and not a second panel.
    assert.equal((await deliver(event)).status, 200);

    const panel = await findPanelBySessionId("cs_replay");
    assert.ok(panel);
    assert.equal(panel.amount, 5000, "the amount must not have been applied twice");
  });

  it("files an unknown category as none rather than inventing one", async () => {
    await deliver(
      checkoutCompleted({
        eventId: "evt_bad_cat",
        sessionId: "cs_bad_cat",
        metadata: { type: "new_panel", category: "ni-connue-ni-valide" },
      }),
    );

    const panel = await findPanelBySessionId("cs_bad_cat");
    assert.ok(panel);
    assert.equal(panel.category, null);
  });

  it("ignores event types it does not handle", async () => {
    const payload = JSON.stringify({
      id: "evt_other",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const response = await stripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }) as NextRequest,
    );
    assert.equal(response.status, 200);
  });
});
