import { useState } from 'react';

import { toggleTheme } from '../lib/theme';
import { SuccessState } from '../components/ui/states';

export function SettingsPage() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    toggleTheme();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Workspace preferences and account management.
        </p>
      </div>

      <div className="surface-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Appearance</h3>
          <p className="text-sm text-muted-foreground">
            Toggle between light and dark mode across the workspace.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleSave} className="btn-primary px-4 py-2">
            Toggle Theme
          </button>
        </div>
        {saved && <SuccessState message="Theme preference updated." />}
      </div>

      <div className="surface-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Account</h3>
          <p className="text-sm text-muted-foreground">
            User authentication, profile and role management will be wired via the auth feature stage.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Authentication routes are already scaffolded on the backend. Full login,
          session and profile flows will be exposed here once implemented.
        </div>
      </div>
    </div>
  );
}