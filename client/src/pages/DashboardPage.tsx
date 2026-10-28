import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { ErrorState, LoadingState } from '../components/ui/states';

interface HealthData {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

export function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<HealthData>('/health');
      setHealth(data);
    } catch (e) {
      setHealth(null);
      setError(e instanceof Error ? e.message : 'Failed to reach API');
    } finally {
      setLoading(false);
    }
  };

  // Fire once on mount
  useEffect(() => {
    void checkHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Multi-tenant gym management platform — architecture scaffolding.
        </p>
      </div>

      {/* API health */}
      <div className="surface-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Backend connectivity</h3>
            <p className="text-sm text-muted-foreground">
              Live health check against GET /api/v1/health
            </p>
          </div>
          <button onClick={checkHealth} className="btn-outline px-4 py-2">
            Refresh
          </button>
        </div>

        {loading ? (
          <LoadingState label="Checking API health…" />
        ) : error ? (
          <ErrorState
            title="Backend unreachable"
            message={error}
            onRetry={checkHealth}
          />
        ) : health ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <span className="text-muted-foreground">Status: </span>
                <span className="font-medium text-primary">{health.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Service: </span>
                <span className="font-medium">{health.service}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Version: </span>
                <span className="font-medium">{health.version}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Time: </span>
                <span className="font-medium">{new Date(health.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Placeholder for future stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {['Active Members', 'Monthly Revenue', 'Routines Assigned'].map((label) => (
          <div key={label} className="surface-card p-5 flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold">
              <span className="text-muted-foreground/50">—</span>
            </p>
            <p className="text-xs text-muted-foreground">Populated in next stage</p>
          </div>
        ))}
      </div>
    </div>
  );
}