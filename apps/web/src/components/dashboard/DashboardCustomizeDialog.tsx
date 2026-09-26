import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import {
  DASHBOARD_WIDGETS,
  createDefaultDashboardLayout,
  type DashboardSize,
  type DashboardType,
  type DashboardWidgetLayout,
} from '../../lib/dashboard';

interface DashboardCustomizeDialogProps {
  isOpen: boolean;
  type: DashboardType;
  layout: DashboardWidgetLayout[];
  onClose: () => void;
  onSave: (layout: DashboardWidgetLayout[]) => Promise<void>;
}

function reindex(layout: DashboardWidgetLayout[]) {
  return layout.map((item, position) => ({ ...item, position }));
}

export function DashboardCustomizeDialog({ isOpen, type, layout, onClose, onSave }: DashboardCustomizeDialogProps) {
  const [draft, setDraft] = useState(layout);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setDraft(layout.map((item) => ({ ...item })));
  }, [isOpen, layout]);

  const update = (widgetId: string, change: Partial<DashboardWidgetLayout>) => {
    setDraft((current) => current.map((item) => item.widgetId === widgetId ? { ...item, ...change } : item));
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    setDraft((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return reindex(next);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(reindex(draft));
      onClose();
    } catch {
      // The parent reports the failure through the shared toast system. Keep the
      // dialog open so the user's draft is not lost and a retry is possible.
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = draft.filter((item) => item.enabled).length;
  const allEnabled = enabledCount === draft.length;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Customize dashboard"
      description="Choose visible widgets, their order, and grid width. Arrow buttons provide full keyboard parity."
      maxWidth={760}
      footer={(
        <>
          <Button variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={() => setDraft(createDefaultDashboardLayout(type))}>Reset defaults</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={saving} onClick={() => void save()}>Save layout</Button>
        </>
      )}
    >
      <div className="dash-customize-summary">
        <Checkbox
          label={`Show all widgets (${draft.length})`}
          checked={allEnabled}
          onChange={() => setDraft((current) => current.map((item) => ({ ...item, enabled: !allEnabled })))}
        />
        <span className="small muted" role="status" aria-live="polite">{enabledCount} visible</span>
      </div>
      <div className="dash-customize-list" data-testid="dashboard-customize-list">
        {draft.map((item, index) => {
          const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === item.widgetId)!;
          return (
            <div className="dash-customize-row" key={item.widgetId}>
              <Checkbox
                checked={item.enabled}
                aria-label={`Show ${definition.name}`}
                onChange={(event) => update(item.widgetId, { enabled: event.target.checked })}
              />
              <div className="grow">
                <b>{definition.name}</b>
                <div className="small muted">{definition.tier} · {definition.kind} · <code>{definition.id}</code></div>
              </div>
              <label className="sr-only" htmlFor={`dash-size-${item.widgetId}`}>Width for {definition.name}</label>
              <Select
                id={`dash-size-${item.widgetId}`}
                value={item.width}
                onChange={(event) => update(item.widgetId, { width: Number(event.target.value) as DashboardSize })}
                aria-label={`Width for ${definition.name}`}
              >
                <option value={1}>1 column</option>
                <option value={2}>2 columns</option>
                <option value={3}>3 columns</option>
              </Select>
              <Button variant="ghost" size="sm" aria-label={`Move ${definition.name} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
              <Button variant="ghost" size="sm" aria-label={`Move ${definition.name} down`} disabled={index === draft.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
