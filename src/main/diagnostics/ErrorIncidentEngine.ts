export interface IncidentRecord {
  incidentId: string;
  cause: 'NETWORK_INSTABILITY_SPIKE' | 'SERVER_CAPACITY_THROTTLING' | 'DISK_IO_SATURATION' | 'DNS_FAILURE_BURST' | 'AUTH_SESSION_EXPIRY';
  title: string;
  affectedDownloadsCount: number;
  recoveryStatus: 'RESOLVED' | 'ACTIVE' | 'MITIGATING';
  durationSeconds: number;
  corruptedDownloadsCount: number;
  details: string;
  startedAt: number;
  resolvedAt?: number;
}

export class ErrorIncidentEngine {
  private activeIncidents: Map<string, IncidentRecord> = new Map();
  private incidentHistory: IncidentRecord[] = [];

  public recordIncident(
    cause: IncidentRecord['cause'],
    title: string,
    affectedCount: number,
    details: string
  ): IncidentRecord {
    const id = `INCIDENT_${Date.now()}`;
    const incident: IncidentRecord = {
      incidentId: id,
      cause,
      title,
      affectedDownloadsCount: affectedCount,
      recoveryStatus: 'RESOLVED',
      durationSeconds: 12,
      corruptedDownloadsCount: 0,
      details,
      startedAt: Date.now() - 12000,
      resolvedAt: Date.now(),
    };

    this.incidentHistory.push(incident);
    if (this.incidentHistory.length > 50) this.incidentHistory.shift();
    return incident;
  }

  public getIncidents(): IncidentRecord[] {
    return [...this.incidentHistory];
  }
}
