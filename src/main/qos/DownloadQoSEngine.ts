import { DownloadItem, Priority } from '../../shared/types';

export type QoSTier = 'CRITICAL' | 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW' | 'BACKGROUND';

export interface QoSPolicyRule {
  id: string;
  name: string;
  condition: (item: DownloadItem, now: Date) => boolean;
  assignedTier: QoSTier;
}

export class DownloadQoSEngine {
  private static readonly TIER_WEIGHTS: Record<QoSTier, number> = {
    CRITICAL: 10,
    URGENT: 8,
    HIGH: 4,
    NORMAL: 2,
    LOW: 1,
    BACKGROUND: 0.5,
  };

  private customPolicies: QoSPolicyRule[] = [
    {
      id: 'qos_business_hours',
      name: 'Work / Document priority during business hours (9 AM - 6 PM)',
      condition: (item, now) => {
        const hour = now.getHours();
        return hour >= 9 && hour <= 18 && (item.category === 'document' || item.category === 'archive');
      },
      assignedTier: 'HIGH',
    },
    {
      id: 'qos_large_media_background',
      name: 'Large media (> 10GB) placed in Background tier by default',
      condition: (item) => item.totalBytes > 10 * 1024 * 1024 * 1024 && item.priority === 'low',
      assignedTier: 'BACKGROUND',
    },
  ];

  public evaluateQoSTier(item: DownloadItem): QoSTier {
    const now = new Date();

    // Check custom policies
    for (const p of this.customPolicies) {
      if (p.condition(item, now)) {
        return p.assignedTier;
      }
    }

    // Default mapping from item priority
    switch (item.priority) {
      case 'urgent': return 'URGENT';
      case 'high': return 'HIGH';
      case 'low': return 'LOW';
      case 'normal':
      default:
        return 'NORMAL';
    }
  }

  public getTierWeight(tier: QoSTier): number {
    return DownloadQoSEngine.TIER_WEIGHTS[tier] || 2;
  }
}
