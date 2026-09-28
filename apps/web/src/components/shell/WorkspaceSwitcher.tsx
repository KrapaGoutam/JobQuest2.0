import { useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ChevronDown, Plus, Check, Ticket, ShieldCheck } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { JoinWorkspaceModal } from '../workspace/JoinWorkspaceModal';

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
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [selectedColor, setSelectedColor] = useState('oklch(0.55 0.12 160)');
  const [isCreating, setIsCreating] = useState(false);

  const initial = activeWorkspace?.name?.charAt(0).toUpperCase() || 'P';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setIsCreating(true);
    await createSharedWorkspace(newWsName.trim(), selectedColor);
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

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsJoinOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: 0,
                  background: 'transparent',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                <Ticket size={14} className="muted" />
                <span>Join a workspace…</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Create Workspace Dialog (Mockup W7) */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create workspace"
        maxWidth={480}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setIsCreateOpen(false);
                setIsJoinOpen(true);
              }}
              style={{
                background: 'none',
                border: 0,
                color: 'var(--color-accent)',
                fontSize: '12.5px',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                textDecoration: 'underline',
              }}
            >
              Have an invite code? Join instead
            </button>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} isLoading={isCreating}>
              Create workspace
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Workspace name" required>
            {({ id }) => (
              <Input
                id={id}
                placeholder="e.g. Northside Bootcamp · Fall"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                autoFocus
                required
              />
            )}
          </FormField>

          <FormField label="Colour">
            {() => (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {[
                  'oklch(0.50 0.13 265)',
                  'oklch(0.50 0.12 160)',
                  'oklch(0.52 0.13 55)',
                  'oklch(0.50 0.15 25)',
                  'oklch(0.50 0.12 320)',
                ].map((swatch) => {
                  const isSelected = selectedColor === swatch;
                  return (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setSelectedColor(swatch)}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        background: swatch,
                        border: 0,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        outline: isSelected ? '2px solid var(--color-text)' : 'none',
                        outlineOffset: '2px',
                      }}
                      aria-label={`Select color ${swatch}`}
                    >
                      {isSelected && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            )}
          </FormField>

          <div
            className="banner info small"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-2)',
              fontSize: '12px',
              color: 'var(--color-text-muted)',
              lineHeight: 1.45,
            }}
          >
            <ShieldCheck size={16} className="info-t" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              You'll be this workspace's <b>Manager</b>. Next, invite members with a code. Your personal
              workspace stays separate.
            </span>
          </div>
        </form>
      </Dialog>

      {/* Join Workspace Modal (Mockup W8) */}
      <JoinWorkspaceModal
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
      />
    </>
  );
}
