export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  category: 'MEDIA_ANALYZER' | 'PROTOCOL_ADAPTER' | 'EXPORTER' | 'NOTIFIER' | 'STORAGE_PROVIDER';
  permissions: ('network:outbound' | 'filesystem:read' | 'downloads:manage')[];
  minG1dmVersion: string;
  signature?: string;
}

export interface RegisteredPlugin extends PluginManifest {
  status: 'ACTIVE' | 'DISABLED' | 'PERMISSION_DENIED';
  registeredAt: number;
}

export class PluginManager {
  private plugins: Map<string, RegisteredPlugin> = new Map();

  public registerPlugin(manifest: PluginManifest, userApprovedPermissions = true): RegisteredPlugin {
    const plugin: RegisteredPlugin = {
      ...manifest,
      status: userApprovedPermissions ? 'ACTIVE' : 'PERMISSION_DENIED',
      registeredAt: Date.now(),
    };

    this.plugins.set(manifest.id, plugin);
    return plugin;
  }

  public getPlugins(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  public disablePlugin(id: string): void {
    const p = this.plugins.get(id);
    if (p) p.status = 'DISABLED';
  }
}
