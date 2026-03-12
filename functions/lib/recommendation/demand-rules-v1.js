export function runDemandRulesV1(item) {
    const weeklyUsage = Math.max(0, item.weeklyUsage);
    const baseDaily = weeklyUsage > 0 ? weeklyUsage / 7 : Math.max(0, item.minQuantity * 0.08);
    const productionDaily = Math.max(0, item.productionDemand) * 0.55;
    const urgencyFactor = item.nextOrderInDays <= 1 ? 1.1 : 1;
    const leadFactor = item.leadDays >= 3 ? 1.05 : 1;
    const horizonHours = Math.max(24, (Math.max(item.leadDays, 1) + 1) * 24);
    const horizonDays = horizonHours / 24;
    const value = (baseDaily + productionDaily) * urgencyFactor * leadFactor * horizonDays;
    return {
        value: Number(Math.max(0, value).toFixed(3)),
        unit: item.unit,
        horizonHours
    };
}
