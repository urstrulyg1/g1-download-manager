export interface RiskSample {
  timestamp: number;
  riskScorePct: number; // 0 - 100
  dominantRiskFactor: 'STALL' | 'THROTTLING' | 'STORAGE' | 'NETWORK_RESETS' | 'NONE';
  preventionTriggered: boolean;
  explanation: string;
}

export class PredictiveRiskEngine {
  private riskHistory: Map<string, RiskSample[]> = new Map();

  public evaluateRisk(
    downloadId: string,
    retryCount: number,
    isStalled: boolean,
    isThrottled: boolean,
    storageFreeMb: number
  ): RiskSample {
    let score = 5;
    let factor: RiskSample['dominantRiskFactor'] = 'NONE';
    let explanation = 'Download risk is minimal.';

    if (storageFreeMb < 1024) {
      score += 65;
      factor = 'STORAGE';
      explanation = 'Critical risk of storage exhaustion.';
    } else if (isThrottled || retryCount >= 2) {
      score += 45;
      factor = 'THROTTLING';
      explanation = 'Elevated risk of server rate limiting.';
    } else if (isStalled) {
      score += 35;
      factor = 'STALL';
      explanation = 'Stall detected on active socket.';
    }

    const sample: RiskSample = {
      timestamp: Date.now(),
      riskScorePct: Math.min(100, score),
      dominantRiskFactor: factor,
      preventionTriggered: score > 50,
      explanation,
    };

    const list = this.riskHistory.get(downloadId) || [];
    list.push(sample);
    if (list.length > 20) list.shift();
    this.riskHistory.set(downloadId, list);

    return sample;
  }

  public getRiskTrend(downloadId: string): RiskSample[] {
    return this.riskHistory.get(downloadId) || [];
  }
}
