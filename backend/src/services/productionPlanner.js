/**
 * Production Planning Service
 *
 * Core logic:
 * 1. For each material required by the product × order quantity:
 *    - If stock >= needed  → available TODAY
 *    - If stock < needed   → available in (today + supplierLeadTime) days
 * 2. Production can only START when ALL materials are available
 *    → productionStart = max(availableDate across all materials)
 * 3. productionDays = ceil(orderQty / product.dailyCapacity)
 *    productionEnd  = productionStart + productionDays
 */

/**
 * Add N calendar days to a date (returns a new Date, no mutation).
 * Used for supplier lead times — suppliers count calendar days.
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add N working days (Mon–Fri) to a date, skipping Saturdays and Sundays.
 * Used for production duration — the factory only works on weekdays.
 * @param {Date} date
 * @param {number} workingDays
 * @returns {Date}
 */
function addWorkingDays(date, workingDays) {
  const result = new Date(date);
  let remaining = workingDays;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) remaining--;
  }
  return result;
}

/**
 * Return today at midnight UTC so all comparisons are day-level.
 */
function today() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate the full production plan for an order.
 *
 * @param {object} product  - Prisma Product with productParts[].part included
 * @param {number} orderQty - How many units to produce
 * @param {Date|null} desiredDeadline - Optional customer deadline
 * @returns {{
 *   productionStartDate: Date,
 *   productionEndDate: Date,
 *   isOnTime: boolean,
 *   partsBreakdown: Array<{
 *     partId: number,
 *     partName: string,
 *     quantityNeeded: number,
 *     quantityInStock: number,
 *     quantityMissing: number,
 *     availableDate: Date,
 *     isShortage: boolean
 *   }>
 * }}
 */
function calculateProductionPlan(product, orderQty, desiredDeadline = null) {
  const baseDate = today();
  const partsBreakdown = [];

  for (const bom of product.productParts) {
    const part = bom.part;
    // ceil because you can't use a fraction of a physical material unit
    // e.g. 100 t700s needing 1 sheet per 5 → ceil(100×1/5) = 20 sheets
    const quantityNeeded = Math.ceil((bom.materialQty * orderQty) / bom.productsPerBatch);

    // How much stock can cover this order (cap at needed so we don't go negative)
    const quantityInStock = Math.min(part.currentStock, quantityNeeded);
    const quantityMissing = Math.max(0, quantityNeeded - part.currentStock);
    const isShortage = quantityMissing > 0;

    // If we're short, we must wait for supplier delivery
    const availableDate = isShortage
      ? addDays(baseDate, part.supplierLeadTime)
      : baseDate;

    partsBreakdown.push({
      partId: part.id,
      partName: part.name,
      quantityNeeded,
      quantityInStock,
      quantityMissing,
      availableDate,
      isShortage,
    });
  }

  // Production starts when the LAST part becomes available
  const productionStartDate =
    partsBreakdown.length === 0
      ? baseDate
      : new Date(
          Math.max(...partsBreakdown.map((p) => p.availableDate.getTime()))
        );

  // How many working days does production take for this order quantity?
  const productionDays = Math.ceil(orderQty / product.dailyCapacity);
  const productionEndDate = addWorkingDays(productionStartDate, productionDays);

  // Can we meet the deadline?
  const isOnTime = desiredDeadline
    ? productionEndDate.getTime() <= new Date(desiredDeadline).getTime()
    : true;

  return {
    productionStartDate,
    productionEndDate,
    isOnTime,
    partsBreakdown,
  };
}

module.exports = { calculateProductionPlan, addDays, addWorkingDays };
