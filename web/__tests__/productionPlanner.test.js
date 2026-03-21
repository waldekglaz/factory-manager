import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateProductionPlan, addDays, addWorkingDays } from "../lib/productionPlanner.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Return a Monday at UTC midnight for deterministic weekend logic */
function monday(offsetDays = 0) {
  const d = new Date("2025-01-06T00:00:00.000Z"); // known Monday
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/** Build a minimal product fixture */
function makeProduct({ finishedStock = 0, dailyCapacity = 10, parts = [] } = {}) {
  return {
    finishedStock,
    dailyCapacity,
    productParts: parts.map((p) => ({
      materialQty:      p.materialQty      ?? 1,
      productsPerBatch: p.productsPerBatch ?? 1,
      scrapFactor:      p.scrapFactor      ?? 0,
      part: {
        id:               p.id               ?? 1,
        name:             p.name             ?? "Part A",
        currentStock:     p.currentStock     ?? 0,
        supplierLeadTime: p.supplierLeadTime ?? 7,
        supplierParts:    p.supplierParts    ?? [],
        locationStocks:   p.locationStocks   ?? [],
      },
    })),
  };
}

// ─── addDays ────────────────────────────────────────────────────────────────

describe("addDays", () => {
  it("adds calendar days across a weekend", () => {
    const fri = new Date("2025-01-03T00:00:00.000Z"); // Friday
    const result = addDays(fri, 3);
    expect(result.toISOString().slice(0, 10)).toBe("2025-01-06"); // Monday
  });

  it("adding 0 days returns the same date", () => {
    const d = new Date("2025-06-15T00:00:00.000Z");
    expect(addDays(d, 0).toISOString().slice(0, 10)).toBe("2025-06-15");
  });

  it("does not mutate the input date", () => {
    const d = new Date("2025-01-06T00:00:00.000Z");
    const original = d.getTime();
    addDays(d, 5);
    expect(d.getTime()).toBe(original);
  });
});

// ─── addWorkingDays ──────────────────────────────────────────────────────────

describe("addWorkingDays", () => {
  it("adds 0 working days — returns same date", () => {
    const d = monday();
    expect(addWorkingDays(d, 0).toISOString().slice(0, 10)).toBe(
      d.toISOString().slice(0, 10)
    );
  });

  it("adds 5 working days from Monday → next Monday", () => {
    const result = addWorkingDays(monday(), 5);
    expect(result.toISOString().slice(0, 10)).toBe("2025-01-13");
  });

  it("adds 1 working day from Friday → Monday (skips weekend)", () => {
    const fri = new Date("2025-01-03T00:00:00.000Z");
    const result = addWorkingDays(fri, 1);
    expect(result.toISOString().slice(0, 10)).toBe("2025-01-06");
  });

  it("adds 2 working days from Thursday → Monday", () => {
    const thu = new Date("2025-01-02T00:00:00.000Z");
    const result = addWorkingDays(thu, 2);
    expect(result.toISOString().slice(0, 10)).toBe("2025-01-06");
  });

  it("does not mutate the input date", () => {
    const d = monday();
    const original = d.getTime();
    addWorkingDays(d, 3);
    expect(d.getTime()).toBe(original);
  });
});

// ─── calculateProductionPlan ─────────────────────────────────────────────────

describe("calculateProductionPlan", () => {
  // Freeze time to a known Monday so all date assertions are deterministic
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(monday()); });
  afterEach(() => { vi.useRealTimers(); });

  // ── Finished goods fulfillment ────────────────────────────────────────────

  describe("finished goods stock", () => {
    it("order fully covered by finished stock — no production needed", () => {
      const product = makeProduct({ finishedStock: 10 });
      const plan = calculateProductionPlan(product, 5);
      expect(plan.fulfilledFromStock).toBe(5);
      expect(plan.productionQty).toBe(0);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(
        monday().toISOString().slice(0, 10)
      );
      expect(plan.productionEndDate.toISOString().slice(0, 10)).toBe(
        monday().toISOString().slice(0, 10)
      );
    });

    it("partial finished stock — only shortfall is produced", () => {
      const product = makeProduct({
        finishedStock: 3,
        dailyCapacity: 10,
        parts: [{ currentStock: 100 }],
      });
      const plan = calculateProductionPlan(product, 10);
      expect(plan.fulfilledFromStock).toBe(3);
      expect(plan.productionQty).toBe(7);
    });

    it("no finished stock — full quantity is produced", () => {
      const product = makeProduct({
        finishedStock: 0,
        dailyCapacity: 10,
        parts: [{ currentStock: 100 }],
      });
      const plan = calculateProductionPlan(product, 4);
      expect(plan.fulfilledFromStock).toBe(0);
      expect(plan.productionQty).toBe(4);
    });
  });

  // ── Parts availability ────────────────────────────────────────────────────

  describe("parts availability", () => {
    it("all parts in stock — production starts today", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 50, materialQty: 2 }],
      });
      const plan = calculateProductionPlan(product, 5); // needs 10, has 50
      expect(plan.partsBreakdown[0].isShortage).toBe(false);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(
        monday().toISOString().slice(0, 10)
      );
    });

    it("part shortage — production starts after supplier lead time", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 0, supplierLeadTime: 5, materialQty: 1 }],
      });
      const plan = calculateProductionPlan(product, 10);
      expect(plan.partsBreakdown[0].isShortage).toBe(true);
      const expected = addDays(monday(), 5).toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(expected);
    });

    it("multiple parts — production starts when the last part is available", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [
          { id: 1, currentStock: 0, supplierLeadTime: 3, materialQty: 1 },
          { id: 2, currentStock: 0, supplierLeadTime: 10, materialQty: 1 },
        ],
      });
      const plan = calculateProductionPlan(product, 5);
      const expected = addDays(monday(), 10).toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(expected);
    });

    it("exact stock match — not counted as shortage", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 10, materialQty: 1 }],
      });
      const plan = calculateProductionPlan(product, 10);
      expect(plan.partsBreakdown[0].quantityMissing).toBe(0);
      expect(plan.partsBreakdown[0].isShortage).toBe(false);
    });

    it("partial stock — quantityInStock and quantityMissing are correct", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 6, materialQty: 1 }],
      });
      const plan = calculateProductionPlan(product, 10);
      const p = plan.partsBreakdown[0];
      expect(p.quantityNeeded).toBe(10);
      expect(p.quantityInStock).toBe(6);
      expect(p.quantityMissing).toBe(4);
    });
  });

  // ── Scrap factor & batch size ─────────────────────────────────────────────

  describe("scrap factor and batch size", () => {
    it("scrap factor inflates quantity needed", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 100, materialQty: 10, scrapFactor: 0.1 }],
      });
      const plan = calculateProductionPlan(product, 1);
      // ceil(10 * 1 / 1 * 1.1) = ceil(11) = 11
      expect(plan.partsBreakdown[0].quantityNeeded).toBe(11);
    });

    it("productsPerBatch divides the required material", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 100, materialQty: 10, productsPerBatch: 5 }],
      });
      const plan = calculateProductionPlan(product, 5);
      // ceil(10 * 5 / 5 * 1) = ceil(10) = 10
      expect(plan.partsBreakdown[0].quantityNeeded).toBe(10);
    });

    it("productsPerBatch > order qty — rounds up to 1 batch", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 100, materialQty: 6, productsPerBatch: 10 }],
      });
      const plan = calculateProductionPlan(product, 3);
      // ceil(6 * 3 / 10 * 1) = ceil(1.8) = 2
      expect(plan.partsBreakdown[0].quantityNeeded).toBe(2);
    });
  });

  // ── Production duration ───────────────────────────────────────────────────

  describe("production duration", () => {
    it("duration is based on dailyCapacity (working days)", () => {
      const product = makeProduct({
        dailyCapacity: 5,
        parts: [{ currentStock: 100, materialQty: 1 }],
      });
      const plan = calculateProductionPlan(product, 10); // 2 working days
      const expectedEnd = addWorkingDays(monday(), 2).toISOString().slice(0, 10);
      expect(plan.productionEndDate.toISOString().slice(0, 10)).toBe(expectedEnd);
    });

    it("fractional days are rounded up (ceil)", () => {
      const product = makeProduct({
        dailyCapacity: 3,
        parts: [{ currentStock: 100, materialQty: 1 }],
      });
      // 7 units / 3 per day = 2.33 → ceil = 3 working days
      const plan = calculateProductionPlan(product, 7);
      const expectedEnd = addWorkingDays(monday(), 3).toISOString().slice(0, 10);
      expect(plan.productionEndDate.toISOString().slice(0, 10)).toBe(expectedEnd);
    });

    it("production end skips weekends", () => {
      // Start on Friday, 1 working day → end on Monday
      const fri = new Date("2025-01-03T00:00:00.000Z");
      vi.setSystemTime(fri);
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 100, materialQty: 1 }],
      });
      const plan = calculateProductionPlan(product, 5); // 1 working day
      expect(plan.productionEndDate.toISOString().slice(0, 10)).toBe("2025-01-06");
    });
  });

  // ── Remote location delivery days ────────────────────────────────────────

  describe("remote location delivery days", () => {
    it("part in remote location only — delays start by delivery days", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{
          currentStock: 20,
          locationStocks: [
            { quantity: 20, location: { isRemote: true, deliveryDays: 3 } },
          ],
        }],
      });
      const plan = calculateProductionPlan(product, 10);
      const expected = addDays(monday(), 3).toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(expected);
    });

    it("part in local location — no delay", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{
          currentStock: 20,
          locationStocks: [
            { quantity: 20, location: { isRemote: false, deliveryDays: 0 } },
          ],
        }],
      });
      const plan = calculateProductionPlan(product, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(
        monday().toISOString().slice(0, 10)
      );
    });

    it("mixed local + remote — uses worst-case remote delay when local insufficient", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{
          currentStock: 20,
          locationStocks: [
            { quantity: 5,  location: { isRemote: false, deliveryDays: 0 } },
            { quantity: 15, location: { isRemote: true,  deliveryDays: 4 } },
          ],
        }],
      });
      const plan = calculateProductionPlan(product, 10); // needs 10, local only 5
      const expected = addDays(monday(), 4).toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(expected);
    });
  });

  // ── Supplier lead time resolution ────────────────────────────────────────

  describe("supplier lead time resolution", () => {
    it("uses shortest supplier lead time when multiple suppliers linked", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{
          currentStock: 0,
          supplierLeadTime: 14,
          supplierParts: [
            { leadTimeOverride: 10, supplier: { defaultLeadTime: 14 } },
            { leadTimeOverride: 5,  supplier: { defaultLeadTime: 14 } },
          ],
        }],
      });
      const plan = calculateProductionPlan(product, 5);
      const expected = addDays(monday(), 5).toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(expected);
    });

    it("falls back to supplier defaultLeadTime when no override set", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{
          currentStock: 0,
          supplierLeadTime: 14,
          supplierParts: [
            { leadTimeOverride: null, supplier: { defaultLeadTime: 6 } },
          ],
        }],
      });
      const plan = calculateProductionPlan(product, 5);
      const expected = addDays(monday(), 6).toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(expected);
    });

    it("falls back to part.supplierLeadTime when no supplierParts configured", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 0, supplierLeadTime: 9, supplierParts: [] }],
      });
      const plan = calculateProductionPlan(product, 5);
      const expected = addDays(monday(), 9).toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(expected);
    });
  });

  // ── On-time status ────────────────────────────────────────────────────────

  describe("on-time status", () => {
    it("isOnTime = true when no deadline given", () => {
      const product = makeProduct({ dailyCapacity: 10, parts: [{ currentStock: 100 }] });
      const plan = calculateProductionPlan(product, 5, null);
      expect(plan.isOnTime).toBe(true);
    });

    it("isOnTime = true when production ends before deadline", () => {
      const product = makeProduct({ dailyCapacity: 10, parts: [{ currentStock: 100 }] });
      const farFuture = addDays(monday(), 30);
      const plan = calculateProductionPlan(product, 5, farFuture);
      expect(plan.isOnTime).toBe(true);
    });

    it("isOnTime = true when production ends exactly on deadline", () => {
      const product = makeProduct({ dailyCapacity: 10, parts: [{ currentStock: 100 }] });
      // 5 units / 10 per day = 1 working day → ends Tuesday
      const deadline = addWorkingDays(monday(), 1);
      const plan = calculateProductionPlan(product, 5, deadline);
      expect(plan.isOnTime).toBe(true);
    });

    it("isOnTime = false when production ends after deadline", () => {
      const product = makeProduct({
        dailyCapacity: 2,
        parts: [{ currentStock: 100 }],
      });
      // 10 units / 2 per day = 5 working days → ends next Monday
      const tightDeadline = addWorkingDays(monday(), 2);
      const plan = calculateProductionPlan(product, 10, tightDeadline);
      expect(plan.isOnTime).toBe(false);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("product with no BOM parts — starts and ends today", () => {
      const product = makeProduct({ dailyCapacity: 10, parts: [] });
      const plan = calculateProductionPlan(product, 5);
      const todayStr = monday().toISOString().slice(0, 10);
      expect(plan.productionStartDate.toISOString().slice(0, 10)).toBe(todayStr);
      expect(plan.partsBreakdown).toHaveLength(0);
    });

    it("order qty of 1 — still produces correct breakdown", () => {
      const product = makeProduct({
        dailyCapacity: 10,
        parts: [{ currentStock: 5, materialQty: 3 }],
      });
      const plan = calculateProductionPlan(product, 1);
      expect(plan.partsBreakdown[0].quantityNeeded).toBe(3);
      expect(plan.partsBreakdown[0].quantityMissing).toBe(0);
    });

    it("returns correct shape with all expected fields", () => {
      const product = makeProduct({ dailyCapacity: 10, parts: [{ currentStock: 100 }] });
      const plan = calculateProductionPlan(product, 5);
      expect(plan).toHaveProperty("productionStartDate");
      expect(plan).toHaveProperty("productionEndDate");
      expect(plan).toHaveProperty("isOnTime");
      expect(plan).toHaveProperty("fulfilledFromStock");
      expect(plan).toHaveProperty("productionQty");
      expect(plan).toHaveProperty("partsBreakdown");
      expect(Array.isArray(plan.partsBreakdown)).toBe(true);
    });
  });
});
