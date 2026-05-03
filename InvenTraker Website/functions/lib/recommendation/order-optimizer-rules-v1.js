function confidenceForItem(item) {
    let score = 0.35;
    if (item.weeklyUsage > 0)
        score += 0.2;
    if (item.wasteAffectingOrders > 0)
        score += 0.15;
    if (item.expiringBeforeLead > 0)
        score += 0.1;
    if (item.incomingBeforeLead > 0)
        score += 0.1;
    if (item.vendorId)
        score += 0.1;
    if (item.productionDemand > 0)
        score += 0.1;
    return Number(Math.min(0.95, score).toFixed(3));
}
function buildTopFactors(item, demand, wasteRisk) {
    return [
        {
            key: "on_hand",
            label: "On hand inventory",
            value: `${Number(item.onHand.toFixed(3))} ${item.unit}`,
            impact: Number(Math.min(1, Math.max(0.2, item.minQuantity > 0 ? item.onHand / item.minQuantity : 0.2)).toFixed(3)),
            direction: item.onHand < item.minQuantity ? "up" : "down"
        },
        {
            key: "predicted_demand",
            label: "Predicted demand",
            value: `${Number(demand.value.toFixed(3))} ${item.unit}`,
            impact: Number(Math.min(1, Math.max(0.2, demand.value / Math.max(1, item.minQuantity))).toFixed(3)),
            direction: "up"
        },
        {
            key: "waste_risk",
            label: "Waste risk",
            value: `${Number((wasteRisk.probability * 100).toFixed(1))}%`,
            impact: Number(Math.min(1, Math.max(0.2, wasteRisk.probability)).toFixed(3)),
            direction: wasteRisk.probability >= 0.35 ? "down" : "neutral"
        },
        {
            key: "vendor_window",
            label: "Vendor order window",
            value: `${item.nextOrderInDays} day(s)`,
            impact: Number(Math.min(1, Math.max(0.2, (2 - Math.min(2, item.nextOrderInDays)) * 0.35 + 0.2)).toFixed(3)),
            direction: item.nextOrderInDays <= 1 ? "up" : "neutral"
        }
    ];
}
export function runOrderOptimizerRulesV1(input) {
    const rows = [];
    for (const item of input.items) {
        if (item.archived)
            continue;
        const demand = input.demandByItem.get(item.itemId) ?? {
            value: 0,
            unit: item.unit,
            horizonHours: 24
        };
        const wasteRisk = input.wasteRiskByItem.get(item.itemId) ?? {
            probability: 0.05,
            expectedLossValue: 0
        };
        const minimumQuantity = Math.max(0, item.minQuantity + item.productionDemand);
        const projectedQuantity = Math.max(0, item.onHand + item.incomingBeforeLead);
        const shortfallToMinimum = Math.max(0, minimumQuantity - projectedQuantity);
        const dailyDemand = Math.max(0, demand.value);
        const horizonDays = Math.max(1, Math.min(7, item.leadDays + Math.max(1, item.nextOrderInDays)));
        const demandCoverageNeed = dailyDemand * horizonDays;
        const safetyStock = Math.max(Math.max(1, item.qtyPerCase) * 0.5, minimumQuantity * 0.15);
        const targetStock = Math.max(minimumQuantity, demandCoverageNeed + safetyStock);
        let recommendedUnits = Math.max(0, targetStock - projectedQuantity);
        // Keep recommendations conservative for low-signal or waste-heavy rows.
        if (item.weeklyUsage <= 0 && dailyDemand <= 0 && projectedQuantity >= minimumQuantity) {
            recommendedUnits = 0;
        }
        if (item.wasteAffectingOrders > minimumQuantity * 0.2) {
            recommendedUnits *= 0.75;
        }
        if (item.expiringBeforeLead > Math.max(projectedQuantity, 1) * 0.3) {
            recommendedUnits *= 0.65;
        }
        // Prevent runaway over-ordering while still preserving case-pack behavior.
        const extraBufferCap = Math.max(Math.max(1, item.qtyPerCase) * 2, minimumQuantity * 0.5);
        const extraBeyondMinimum = Math.max(0, recommendedUnits - shortfallToMinimum);
        recommendedUnits = shortfallToMinimum + Math.min(extraBeyondMinimum, extraBufferCap);
        // Final guardrail: do not exceed a conservative window based on observed weekly usage.
        // This keeps recommendations practical when signals are noisy.
        const usageWindowCap = item.weeklyUsage > 0
            ? Math.max(item.weeklyUsage * 1.2, minimumQuantity + Math.max(1, item.qtyPerCase))
            : Math.max(minimumQuantity + Math.max(1, item.qtyPerCase), Math.max(1, item.qtyPerCase) * 2);
        const cappedUnits = Math.max(shortfallToMinimum, usageWindowCap);
        recommendedUnits = Math.min(recommendedUnits, cappedUnits);
        const lbsDirect = item.unit === "lbs" && item.caseSize === 1;
        const recommendedQuantity = lbsDirect
            ? Number(Math.max(0, recommendedUnits).toFixed(3))
            : Math.max(0, Math.ceil(recommendedUnits / Math.max(1, item.qtyPerCase)) * Math.max(1, item.qtyPerCase));
        const confidence = confidenceForItem(item);
        const topFactors = buildTopFactors(item, demand, wasteRisk);
        const questions = [];
        if (item.weeklyUsage <= 0) {
            questions.push(`Missing weekly usage for ${item.itemName}; recommendation uses low-confidence defaults.`);
        }
        if (!item.vendorId) {
            questions.push(`No vendor configured for ${item.itemName}; ordering-window urgency may be incomplete.`);
        }
        rows.push({
            itemId: item.itemId,
            itemName: item.itemName,
            unit: item.unit,
            qtyPerCase: Math.max(1, item.qtyPerCase),
            caseInterpretation: lbsDirect ? "direct_units" : "case_rounded",
            recommendedQuantity,
            onHand: Number(item.onHand.toFixed(3)),
            minQuantity: Number(minimumQuantity.toFixed(3)),
            predictedDemand: demand,
            predictedWasteRisk: wasteRisk,
            confidence,
            topContributingFactors: topFactors,
            rationaleSummary: recommendedQuantity > 0
                ? `${item.itemName}: projected ${Number(projectedQuantity.toFixed(2))}, target ${Number(targetStock.toFixed(2))}; ${lbsDirect ? "ordering direct units." : "rounded to case pack."}`
                : `${item.itemName}: projected stock already covers target inventory.`,
            degraded: false,
            fallbackUsed: false,
            questions
        });
    }
    return rows.sort((left, right) => {
        if (right.recommendedQuantity === left.recommendedQuantity) {
            return (left.itemName ?? left.itemId).localeCompare(right.itemName ?? right.itemId);
        }
        return right.recommendedQuantity - left.recommendedQuantity;
    });
}
