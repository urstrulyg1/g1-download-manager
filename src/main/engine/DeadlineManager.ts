import { DownloadItem } from '../../shared/types';

export interface DeadlineEvaluation {
  downloadId: string;
  deadlineTimestamp: number;
  projectedCompletionTimestamp: number;
  status: 'ON_TRACK' | 'RISK_DEFICIT' | 'CRITICAL_MISSED' | 'COMPLETED';
  marginMinutes: number;
  requiredSpeedBytesPerSec: number;
  currentSpeedBytesPerSec: number;
  advice: string;
}

export class DeadlineManager {
  public static evaluateDeadline(item: DownloadItem, deadlineTimestamp: number): DeadlineEvaluation {
    const now = Date.now();

    if (item.status === 'completed') {
      return {
        downloadId: item.id,
        deadlineTimestamp,
        projectedCompletionTimestamp: item.completedAt || now,
        status: 'COMPLETED',
        marginMinutes: Math.round((deadlineTimestamp - (item.completedAt || now)) / 60000),
        requiredSpeedBytesPerSec: 0,
        currentSpeedBytesPerSec: 0,
        advice: 'Download successfully completed before deadline.',
      };
    }

    const remainingBytes = Math.max(0, item.totalBytes - item.downloadedBytes);
    const availableTimeSec = Math.max(1, (deadlineTimestamp - now) / 1000);

    const requiredSpeed = Math.ceil(remainingBytes / availableTimeSec);
    const effectiveSpeed = item.avgSpeed > 0 ? item.avgSpeed : item.speed > 0 ? item.speed : 100 * 1024;

    const projectedRemainingSec = Math.ceil(remainingBytes / effectiveSpeed);
    const projectedCompletion = now + projectedRemainingSec * 1000;
    const marginSec = (deadlineTimestamp - projectedCompletion) / 1000;
    const marginMinutes = Math.round(marginSec / 60);

    let status: 'ON_TRACK' | 'RISK_DEFICIT' | 'CRITICAL_MISSED' = 'ON_TRACK';
    let advice = `On track: Projected completion at ${new Date(projectedCompletion).toLocaleTimeString()} with ${marginMinutes} minutes margin.`;

    if (marginSec < -300) {
      status = 'CRITICAL_MISSED';
      const requiredMb = (requiredSpeed / 1024 / 1024).toFixed(1);
      advice = `Deadline deficit: Projected completion is ${Math.abs(marginMinutes)} minutes late (${new Date(projectedCompletion).toLocaleTimeString()}). Need ${requiredMb} MB/s to finish on time.`;
    } else if (marginSec < 60) {
      status = 'RISK_DEFICIT';
      advice = `Tight deadline: Estimated completion is very close to deadline (${new Date(projectedCompletion).toLocaleTimeString()}).`;
    }

    return {
      downloadId: item.id,
      deadlineTimestamp,
      projectedCompletionTimestamp: projectedCompletion,
      status,
      marginMinutes,
      requiredSpeedBytesPerSec: requiredSpeed,
      currentSpeedBytesPerSec: effectiveSpeed,
      advice,
    };
  }
}
