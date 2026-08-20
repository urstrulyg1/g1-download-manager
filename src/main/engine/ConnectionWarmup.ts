export interface WarmupStepResult {
  workersCount: number;
  measuredThroughputBytesPerSec: number;
  gainPctOverPrevious: number;
  shouldContinueExpansion: boolean;
}

export class ConnectionWarmup {
  private history: { workers: number; speed: number }[] = [];
  private readonly minGainThresholdPct: number;

  constructor(minGainThresholdPct = 3.0) {
    this.minGainThresholdPct = minGainThresholdPct;
  }

  public recordStep(workers: number, speed: number): WarmupStepResult {
    let gainPct = 100;
    if (this.history.length > 0) {
      const prev = this.history[this.history.length - 1];
      if (prev.speed > 0) {
        gainPct = Math.round(((speed - prev.speed) / prev.speed) * 1000) / 10;
      }
    }

    this.history.push({ workers, speed });

    // Stop expansion if gain drops below threshold (e.g. < 3% gain from doubling sockets)
    const shouldContinue = gainPct >= this.minGainThresholdPct && workers < 32;

    return {
      workersCount: workers,
      measuredThroughputBytesPerSec: speed,
      gainPctOverPrevious: gainPct,
      shouldContinueExpansion: shouldContinue,
    };
  }

  public getOptimalWorkers(): number {
    if (this.history.length === 0) return 8;
    return this.history.sort((a, b) => b.speed - a.speed)[0].workers;
  }
}
