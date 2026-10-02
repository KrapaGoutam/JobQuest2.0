import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Search } from "lucide-react";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import {
  DASHBOARD_WIDGETS,
  createDefaultDashboardLayout,
  type DashboardPlacement,
  type DashboardSize,
  type DashboardType,
  type DashboardWidgetLayout,
} from "../../lib/dashboard";

interface DashboardCustomizeDialogProps {
  isOpen: boolean;
  type: DashboardType;
  layout: DashboardWidgetLayout[];
  onClose: () => void;
  onSave: (layout: DashboardWidgetLayout[]) => Promise<void>;
}
const PLACEMENTS: Array<{ id: "all" | DashboardPlacement; label: string }> = [
  { id: "all", label: "All" },
  { id: "pulse", label: "Pulse" },
  { id: "work", label: "Today’s work" },
  { id: "progress", label: "Progress" },
  { id: "widgets", label: "Widgets" },
];
const reindex = (layout: DashboardWidgetLayout[]) =>
  layout.map((item, position) => ({ ...item, position }));

export function DashboardCustomizeDialog({
  isOpen,
  type,
  layout,
  onClose,
  onSave,
}: DashboardCustomizeDialogProps) {
  const [draft, setDraft] = useState(layout);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<"all" | DashboardPlacement>("all");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setDraft(layout.map((item) => ({ ...item })));
      setQuery("");
      setPlacement("all");
    }
  }, [isOpen, layout]);
  const definitions = useMemo(
    () => new Map(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget])),
    [],
  );
  const visible = draft
    .map((item, index) => ({
      item,
      index,
      definition: definitions.get(item.widgetId)!,
    }))
    .filter(
      ({ definition }) =>
        (placement === "all" || definition.placement === placement) &&
        (!query ||
          `${definition.name} ${definition.id}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
  const update = (widgetId: string, change: Partial<DashboardWidgetLayout>) =>
    setDraft((current) =>
      current.map((item) =>
        item.widgetId === widgetId ? { ...item, ...change } : item,
      ),
    );
  const move = (index: number, delta: -1 | 1) =>
    setDraft((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return reindex(next);
    });
  const save = async () => {
    setSaving(true);
    try {
      await onSave(reindex(draft));
      onClose();
    } catch {
      /* parent toast retains the draft */
    } finally {
      setSaving(false);
    }
  };
  const enabledCount = draft.filter((item) => item.enabled).length;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Customize dashboard"
      description="Show, size, and order the information in your cockpit. Changes preview here and save to this workspace."
      maxWidth={880}
      footer={
        <>
          <Button
            variant="ghost"
            leftIcon={<RotateCcw size={14} />}
            onClick={() => setDraft(createDefaultDashboardLayout(type))}
          >
            Reset defaults
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={saving}
            onClick={() => void save()}
          >
            Save layout
          </Button>
        </>
      }
    >
      <div className="customize-toolbar">
        <div className="customize-search">
          <Search size={15} aria-hidden="true" />
          <Input
            aria-label="Search widgets"
            placeholder="Search widgets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="small muted" role="status" aria-live="polite">
          {enabledCount} of {draft.length} visible
        </span>
      </div>
      <div
        className="customize-filters"
        role="group"
        aria-label="Filter widgets by placement"
      >
        {PLACEMENTS.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={placement === item.id}
            onClick={() => setPlacement(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="customize-preview" aria-label="Dashboard preview">
        <span>Pulse</span>
        <span>Today’s work</span>
        <span>Progress</span>
        <span>Your widgets</span>
      </div>
      <div className="dash-customize-summary">
        <Checkbox
          label={`Show all widgets (${draft.length})`}
          checked={enabledCount === draft.length}
          onChange={() =>
            setDraft((current) =>
              current.map((item) => ({
                ...item,
                enabled: enabledCount !== draft.length,
              })),
            )
          }
        />
      </div>
      <div
        className="dash-customize-list"
        data-testid="dashboard-customize-list"
      >
        {visible.map(({ item, index, definition }) => (
          <div className="dash-customize-row" key={item.widgetId}>
            <Checkbox
              checked={item.enabled}
              aria-label={`Show ${definition.name}`}
              onChange={(event) =>
                update(item.widgetId, { enabled: event.target.checked })
              }
            />
            <div className="grow">
              <b>{definition.name}</b>
              <div className="small muted">
                {definition.placement} · {definition.kind}
              </div>
            </div>
            <div
              className="width-switch"
              role="group"
              aria-label={`Width for ${definition.name}`}
            >
              {([1, 2, 3] as DashboardSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={item.width === size}
                  onClick={() => update(item.widgetId, { width: size })}
                >
                  {size}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${definition.name} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${definition.name} down`}
              disabled={index === draft.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={14} />
            </Button>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="empty-copy">No widgets match this filter.</p>
        )}
      </div>
    </Dialog>
  );
}
