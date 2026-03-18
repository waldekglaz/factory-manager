/**
 * Production Planning Service
 *
 * Core logic:
 * 1. Check finished goods stock — if enough exists, no production needed.
 *    If partial, only produce the shortfall.
 * 2. For each material in the BOM × effective production quantity:
 *    - Apply scrap factor: order slightly more to account for waste
 *    - If local stock >= needed  → available TODAY
 *    - If total stock >= needed but some is in remote locations
 *                                → available in (today + max remote deliveryDays)
 *    - If total stock < needed   → available in (today + supplierLeadTime)
 *      Uses shortest lead time across all linked suppliers, falls back to part.supplierLeadTime
 * 3. productionStart = max(availableDate across all materials)
 * 4. productionDays  = ceil(productionQty / product.dailyCapacity)
 *    productionEnd   = productionStart + productionDays (working days Mon–Fri only)
 */

/** Add N calendar days (for supplier lead times — suppliers count calendar days). */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add N working days (Mon–Fri), skipping weekends.
 * Used for production duration — the factory only works weekdays.
 */
function addWorkingDays(date, workingDays) {
  if (workingDays === 0) return new Date(date);
  const result = new Date(date);
  let remaining = workingDays;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) remaining--;
  }
  return result;
}

/** Today at midnight UTC — all comparisons are day-level. */
function today() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolve the best lead time for a part.
 * If the part has linked suppliers (via supplierParts), use the shortest lead time.
 * Falls back to part.supplierLeadTime if no suppliers are configured.
 */
function getLeadTime(part) {
  if (part.supplierParts && part.supplierParts.length > 0) {
    const times = part.supplierParts.map(
      (sp) => sp.leadTimeOverride ?? sp.supplier?.defaultLeadTime ?? part.supplierLeadTime
    );
    return Math.min(...times);
  }
  return part.supplierLeadTime;
}

/**
 * Calculate the full production plan for an order.
 *
 * @param {object} product    - Prisma Product with productParts[].part included
 *                              (part may optionally include supplierParts[].supplier)
 * @param {number} orderQty   - How many units to produce
 * @param {Date|null} desiredDeadline
 * @returns {{
 *   productionStartDate: Date,
 *   productionEndDate: Date,
 *   isOnTime: boolean,
 *   fulfilledFromStock: number,   // units covered by finished goods (no production needed)
 *   productionQty: number,        // units that actually need to be manufactured
 *   partsBreakdown: Array<{
 *     partId, partName, quantityNeeded, quantityInStock,
 *     quantityMissing, availableDate, isShortage
 *   }>
 * }}
 */
function calculateProductionPlan(product, orderQty, desiredDeadline = null) {
  const baseDate = today();

  // ── Finished goods check ──────────────────────────────────────────────────
  // If we already have finished units in the warehouse, use them first.
  const finishedStock    = product.finishedStock ?? 0;
  const fulfilledFromStock = Math.min(finishedStock, orderQty);
  const productionQty    = orderQty - fulfilledFromStock; // units we actually need to manufacture

  // ── Parts breakdown (only for units that need to be produced) ────────────
  const partsBreakdown = [];

  if (productionQty > 0) {
    for (const bom of product.productParts) {
      const part = bom.part;
      const scrap = bom.scrapFactor ?? 0;

      // How many units of this material are needed for productionQty?
      // scrapFactor pads the quantity: 0.05 means order 5% extra.
      const quantityNeeded = Math.ceil(
        (bom.materialQty * productionQty) / bom.productsPerBatch * (1 + scrap)
      );

      const quantityInStock = Math.min(part.currentStock, quantityNeeded);
      const quantityMissing = Math.max(0, quantityNeeded - part.currentStock);
      const isShortage      = quantityMissing > 0;

      let availableDate;
      if (isShortage) {
        // Not enough stock anywhere — need to order from supplier
        availableDate = addDays(baseDate, getLeadTime(part));
      } else if (part.locationStocks && part.locationStocks.length > 0) {
        // Enough total stock — check how much is local vs remote
        const localStock = part.locationStocks
          .filter((ls) => !ls.location?.isRemote)
          .reduce((sum, ls) => sum + ls.quantity, 0);

        if (localStock >= quantityNeeded) {
          // All needed stock is on-site
          availableDate = baseDate;
        } else {
          // Need to pull from remote location(s) — wait for the longest delivery time
          const remoteWithStock = part.locationStocks.filter(
            (ls) => ls.location?.isRemote && ls.quantity > 0
          );
          const maxDeliveryDays = remoteWithStock.length > 0
            ? Math.max(...remoteWithStock.map((ls) => ls.location.deliveryDays ?? 0))
            : 0;
          availableDate = addDays(baseDate, maxDeliveryDays);
        }
      } else {
        // No location data — treat all stock as local (legacy / unassigned)
        availableDate = baseDate;
      }

      partsBreakdown.push({
        partId:          part.id,
        partName:        part.name,
        quantityNeeded,
        quantityInStock,
        quantityMissing,
        availableDate,
        isShortage,
      });
    }
  }

  // ── Production window ─────────────────────────────────────────────────────
  let productionStartDate, productionEndDate;

  if (productionQty === 0) {
    // Entirely from stock — available immediately
    productionStartDate = baseDate;
    productionEndDate   = baseDate;
  } else {
    // Production starts when the LAST material becomes available
    productionStartDate =
      partsBreakdown.length === 0
        ? baseDate
        : new Date(Math.max(...partsBreakdown.map((p) => p.availableDate.getTime())));

    const productionDays = Math.ceil(productionQty / product.dailyCapacity);
    productionEndDate    = addWorkingDays(productionStartDate, productionDays);
  }

  const isOnTime = desiredDeadline
    ? productionEndDate.getTime() <= new Date(desiredDeadline).getTime()
    : true;

  return {
    productionStartDate,
    productionEndDate,
    isOnTime,
    fulfilledFromStock,
    productionQty,
    partsBreakdown,
  };
}

module.exports = { calculateProductionPlan, addDays, addWorkingDays };
