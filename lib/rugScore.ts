import { isExchange } from "./exchanges";
import { RISK_COLORS } from "./theme";

export interface RugScoreResult {
  score: number;
  label: string;
  color: string;
  factors: { name: string; score: number; weight: number; detail: string }[];
}

export function calculateRugScore(
  holders: { pct: number; cluster?: number; address?: string; isLabeledExchange?: boolean }[],
  clusterCount: number,
  chain: string = "eth"
): RugScoreResult {
  if (!holders.length) return { score: 0, label: "No Data", color: RISK_COLORS.none, factors: [] };

  // Filter out known exchanges (hardcoded + API-labeled)
  const realHolders = holders.filter(h => {
    if (h.isLabeledExchange) return false;
    if (h.address && isExchange(h.address, chain)) return false;
    return true;
  });
  const exchangeCount = holders.length - realHolders.length;

  const factors: { name: string; score: number; weight: number; detail: string }[] = [];

  // 1. Top holder concentration excluding exchanges (weight: 25)
  const top1 = realHolders[0]?.pct || 0;
  let top1Score: number;
  if (top1 > 50) top1Score = 5;
  else if (top1 > 30) top1Score = 20;
  else if (top1 > 20) top1Score = 40;
  else if (top1 > 10) top1Score = 65;
  else if (top1 > 5) top1Score = 85;
  else top1Score = 100;
  factors.push({ name: "Top Holder", score: top1Score, weight: 25, detail: `${top1.toFixed(1)}% held by #1 non-exchange wallet` });

  // 2. Top 10 concentration excluding exchanges (weight: 25)
  const top10 = realHolders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  let top10Score: number;
  if (top10 > 80) top10Score = 5;
  else if (top10 > 60) top10Score = 25;
  else if (top10 > 40) top10Score = 50;
  else if (top10 > 25) top10Score = 75;
  else top10Score = 95;
  factors.push({ name: "Top 10 Concentration", score: top10Score, weight: 25, detail: `${top10.toFixed(1)}% held by top 10 (excl. ${exchangeCount} exchange${exchangeCount !== 1 ? 's' : ''})` });

  // 3. Cluster suspicion (weight: 25)
  let clusterScore: number;
  if (clusterCount >= 6) clusterScore = 10;
  else if (clusterCount >= 4) clusterScore = 30;
  else if (clusterCount >= 3) clusterScore = 50;
  else if (clusterCount >= 2) clusterScore = 70;
  else if (clusterCount === 1) clusterScore = 85;
  else clusterScore = 100;
  factors.push({ name: "Cluster Activity", score: clusterScore, weight: 25, detail: `${clusterCount} cluster${clusterCount !== 1 ? "s" : ""} detected` });

  // 4. Holder distribution (weight: 15)
  const holderCount = realHolders.length;
  let distScore: number;
  if (holderCount < 20) distScore = 15;
  else if (holderCount < 50) distScore = 35;
  else if (holderCount < 100) distScore = 55;
  else if (holderCount < 200) distScore = 75;
  else distScore = 95;
  factors.push({ name: "Holder Count", score: distScore, weight: 15, detail: `${holderCount} holders mapped` });

  // 5. Distribution evenness (weight: 10)
  const top5 = realHolders.slice(0, 5).reduce((s, h) => s + h.pct, 0);
  const bottom50pct = realHolders.slice(Math.floor(realHolders.length / 2)).reduce((s, h) => s + h.pct, 0);
  const ratio = bottom50pct > 0 ? top5 / Math.max(bottom50pct, 0.01) : 100;
  let evenScore: number;
  if (ratio > 50) evenScore = 10;
  else if (ratio > 20) evenScore = 30;
  else if (ratio > 10) evenScore = 50;
  else if (ratio > 5) evenScore = 70;
  else evenScore = 90;
  factors.push({ name: "Distribution", score: evenScore, weight: 10, detail: `Top 5 hold ${top5.toFixed(1)}%` });

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight);

  let labelText: string;
  let color: string;
  if (score >= 80) { labelText = "Low Risk"; color = RISK_COLORS.low; }
  else if (score >= 50) { labelText = "Medium Risk"; color = RISK_COLORS.medium; }
  else if (score >= 25) { labelText = "High Risk"; color = RISK_COLORS.high; }
  else { labelText = "Very High Risk"; color = RISK_COLORS.veryHigh; }

  return { score, label: labelText, color, factors };
}
