export function runWasteRiskRulesV1(item) {
    const onHand = Math.max(0, item.onHand);
    const wasteRatio = item.wasteAffectingOrders / Math.max(1, onHand);
    const expiringRatio = item.expiringBeforeLead / Math.max(1, onHand);
    const demandCoverage = Math.max(0, onHand - item.minQuantity) / Math.max(1, item.minQuantity || 1);
    const probability = Math.min(0.95, Math.max(0.03, wasteRatio * 0.45 + expiringRatio * 0.4 + Math.min(0.2, demandCoverage * 0.05)));
    const expectedLossValue = Math.max(0, onHand * item.price * probability * 0.25);
    return {
        probability: Number(probability.toFixed(3)),
        expectedLossValue: Number(expectedLossValue.toFixed(2))
    };
}
