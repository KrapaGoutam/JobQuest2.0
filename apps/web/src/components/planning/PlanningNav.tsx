import { Archive, CalendarDays, GanttChart } from 'lucide-react';

const VIEWS = [
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/timeline', label: 'Timeline', icon: GanttChart },
  { path: '/archive', label: 'Archive', icon: Archive },
] as const;

export function PlanningNav({ currentPath, onNavigate }: { currentPath: string; onNavigate: (path: string) => void }) {
  return (
    <nav className="planning-nav" aria-label="Application planning views">
      {VIEWS.map((view) => {
        const Icon = view.icon;
        const current = currentPath === view.path;
        return (
          <button
            key={view.path}
            type="button"
            className={`planning-nav-item ${current ? 'current' : ''}`}
            aria-current={current ? 'page' : undefined}
            onClick={() => onNavigate(view.path)}
          >
            <Icon size={16} aria-hidden="true" />
            {view.label}
          </button>
        );
      })}
    </nav>
  );
}
