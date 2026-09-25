import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { TaskDialog } from './TaskDialog';
import { QueueRow, useQueueActions } from './QueueRow';
import { fetchTasksFor } from '../../api/tasks';
import { buildQueue } from '../../lib/queue';
import type { Task } from '../../types/tasks';
import type { Application, CanonicalWorkflow } from '../../types/applications';

/**
 * ADR-020 "Tasks" entity card in the application drawer: open canonical tasks linked
 * to this application (including its interview reminders), with complete / snooze
 * and "Add task". Tasks belong to the application's owner.
 */
export function ApplicationTasksSection({
  application,
  workflow,
  timeZone,
  version,
  onChanged,
}: {
  application: Application;
  workflow: CanonicalWorkflow | null;
  timeZone: string;
  version: number;
  onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    setError(null);
    fetchTasksFor({ applicationId: application.id })
      .then(setTasks)
      .catch((e: Error) => {
        setTasks([]);
        setError(e.message);
      });
  }, [application.id]);
  useEffect(() => {
    setTasks(null);
    load();
  }, [load, version]);
  const changed = () => {
    load();
    onChanged();
  };
  const actions = useQueueActions({ timeZone, workflow, onChanged: changed });
  const items = buildQueue({ tasks: tasks ?? [], nextActions: [], outcomes: [] }, timeZone);

  return (
    <section aria-labelledby={`app-tasks-${application.id}`} className="int-appcard" data-testid="application-tasks">
      <div className="row" style={{ gap: 8 }}>
        <h3 id={`app-tasks-${application.id}`} className="sec-t" style={{ margin: 0 }}>Tasks {tasks ? `· ${tasks.length}` : ''}</h3>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" leftIcon={<Plus size={13} />} onClick={() => setAdding(true)}>Add task</Button>
      </div>
      {tasks === null ? (
        <div role="status" className="small muted">Loading tasks…</div>
      ) : error ? (
        <div role="alert" className="small danger-t">Could not load tasks: {error}</div>
      ) : items.length === 0 ? (
        <div className="small muted">No open tasks for this application.</div>
      ) : (
        <div className="app-task-list">
          {items.map((i) => <QueueRow key={i.key} item={i} timeZone={timeZone} onComplete={actions.complete} onSnooze={actions.snooze} compact />)}
        </div>
      )}
      <TaskDialog
        isOpen={adding}
        onClose={() => setAdding(false)}
        workspaceId={application.workspace_id}
        ownerId={application.user_id}
        timeZone={timeZone}
        preset={{ applicationId: application.id }}
        onSaved={changed}
      />
      {actions.dialogs}
    </section>
  );
}
