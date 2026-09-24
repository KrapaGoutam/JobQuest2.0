import { useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

export function WorkspaceSwitcher({ isRail = false }: { isRail?: boolean }) {
  const {
    memberships,
    activeWorkspaceId,
    activeWorkspace,
    activeRole,
    workspaceColor,
    setActiveWorkspaceId,
    createSharedWorkspace,
  } = useWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const initial = activeWorkspace?.name?.charAt(0).toUpperCase() || 'P';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setIsCreating(true);
    await createSharedWorkspace(newWsName.trim());
    setIsCreating(false);
    setIsCreateOpen(false);
    setNewWsName('');
  };

  return (
    <>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label={`Switch workspace. Current: ${activeWorkspace?.name || 'Personal Workspace'}`}
          onClick={() => setIsOpen((prev) => !prev)}
          className="ws-btn focus-ring"
          style={{
            width: isRail ? '44px' : '100%',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            gap: isRail ? 0 : '10px',
            padding: isRail ? 0 : '0 8px',
            justifyContent: isRail ? 'center' : 'flex-start',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-surface-1)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div
            className="ws-tile"
            style={{
              background: workspaceColor,
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '12px',
              flexShrink: 0,
            }}
          >
            {initial}
          </div>

          {!isRail && (
            <>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div className="ell" style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text)' }}>
                  {activeWorkspace?.name || 'Personal Workspace'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {activeRole}
                </div>
              </div>
              <ChevronDown size={14} className="muted" aria-hidden="true" />
            </>
          )}
        </button>

        {isOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 35 }}
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />
            <div
              role="menu"
              aria-label="Workspaces"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                width: isRail ? '220px' : '100%',
                zIndex: 40,
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-popover)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  padding: '4px 8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Workspaces
              </div>

              {memberships.map((m) => {
                const isCurrent = m.workspace_id === activeWorkspaceId;
                return (
                  <button
                    key={m.workspace_id}
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    onClick={() => {
                      setActiveWorkspaceId(m.workspace_id);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: 0,
                      background: isCurrent ? 'var(--color-accent-soft)' : 'transparent',
                      color: isCurrent ? 'var(--color-accent)' : 'var(--color-text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      fontSize: '13px',
                      width: '100%',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }} className="ell">
                      {m.workspaces?.name || 'Workspace'}
                    </span>
                    <span className="pill muted" style={{ fontSize: '10px', height: '18px', padding: '0 6px' }}>
                      {m.role}
                    </span>
                    {isCurrent && <Check size={14} className="primary-t" />}
                  </button>
                );
              })}

              <div className="hr" style={{ margin: '4px 0' }} />

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsCreateOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: 0,
                  background: 'transparent',
                  color: 'var(--color-accent)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                <Plus size={14} />
                <span>Create shared workspace</span>
              </button>
            </div>
          </>
        )}
      </div>

      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create shared workspace"
        description="Shared workspaces allow team members to collaborate on applications and interviews."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} isLoading={isCreating}>
              Create workspace
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate}>
          <FormField label="Workspace name" required>
            {({ id }) => (
              <Input
                id={id}
                placeholder="e.g. Design Career Track"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                autoFocus
                required
              />
            )}
          </FormField>
        </form>
      </Dialog>
    </>
  );
}
