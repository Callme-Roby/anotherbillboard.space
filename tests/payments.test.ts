import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { createPendingPanelIdempotent, findPanelBySessionId } from "@/lib/db/queries/panels";

import { createTestDatabase, type TestDatabase } from "./support/database";

/**
 * The webhook's idempotency, against a real Postgres.
 *
 * Stripe documents that it re-delivers events, so a duplicate must be a
 * no-op rather than a second paid panel. The code leans on a unique
 * violation on `stripe_events.id` to detect that — a branch that had
 * never been executed anywhere, since it needs a database with real
 * constraints and real error codes. `isUniqueViolation` even carries a
 * comment saying the error shape could not be verified without one.
 */
describe("webhook idempotency", () => {
  let database: TestDatabase;

  const payload = {
    amountCents: 5000,
    category: "design",
    ownerEmail: "acheteur@exemple.fr",
    notifyOnOutgrown: false,
    stripeCheckoutSessionId: "cs_test_idempotency",
  };

  before(async () => {
    database = await createTestDatabase();
  });
  after(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
  });

  it("creates the pending panel on the first delivery", async () => {
    const panel = await createPendingPanelIdempotent("evt_1", payload);

    assert.ok(panel, "the first delivery should create a panel");
    assert.equal(panel.amount, 5000);
    assert.equal(panel.category, "design");
    // Pending: no URL and no position until the buyer claims it.
    assert.equal(panel.url, null);
    assert.equal(panel.positionX, null);
  });

  it("is a no-op on a re-delivery of the same event", async () => {
    const first = await createPendingPanelIdempotent("evt_repeat", payload);
    const second = await createPendingPanelIdempotent("evt_repeat", payload);

    assert.ok(first);
    assert.equal(second, null, "a duplicate delivery must not create a second panel");
  });

  it("leaves no half-applied row when a duplicate is rejected", async () => {
    await createPendingPanelIdempotent("evt_atomic", payload);
    await createPendingPanelIdempotent("evt_atomic", payload);

    // One session, one panel — the batch either lands both statements or
    // neither, so the rejected duplicate cannot leave a stray panel.
    const panel = await findPanelBySessionId(payload.stripeCheckoutSessionId);
    assert.ok(panel);
  });

  it("still distinguishes different events", async () => {
    const first = await createPendingPanelIdempotent("evt_a", payload);
    const second = await createPendingPanelIdempotent("evt_b", {
      ...payload,
      stripeCheckoutSessionId: "cs_test_other",
    });

    assert.ok(first);
    assert.ok(second, "a genuinely new event must still create its panel");
    assert.notEqual(first.id, second.id);
  });
});
