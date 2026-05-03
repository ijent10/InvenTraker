export function dedupeQuestions(input) {
    const seen = new Set();
    const output = [];
    for (const entry of input) {
        if (!entry)
            continue;
        const normalized = entry.trim();
        if (!normalized)
            continue;
        const key = normalized.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        output.push(normalized);
    }
    return output;
}
export function topGlobalDrivers(input) {
    const scoreByKey = new Map();
    const add = (driver) => {
        const existing = scoreByKey.get(driver.key);
        if (!existing) {
            scoreByKey.set(driver.key, {
                totalImpact: driver.impact,
                count: 1,
                sample: driver
            });
            return;
        }
        existing.totalImpact += driver.impact;
        existing.count += 1;
    };
    for (const row of input.orderRecommendations) {
        for (const driver of row.topContributingFactors)
            add(driver);
    }
    for (const row of input.productionRecommendations) {
        for (const driver of row.topContributingFactors)
            add(driver);
    }
    return [...scoreByKey.values()]
        .map(({ totalImpact, count, sample }) => ({
        ...sample,
        impact: Number((totalImpact / Math.max(1, count)).toFixed(3))
    }))
        .sort((left, right) => right.impact - left.impact)
        .slice(0, 8);
}
export function collectRecommendationQuestions(input) {
    const questions = [
        ...input.orderRecommendations.flatMap((row) => row.questions ?? []),
        ...input.productionRecommendations.flatMap((row) => row.questions ?? [])
    ];
    return dedupeQuestions(questions);
}
