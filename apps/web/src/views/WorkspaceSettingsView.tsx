import { useState, useEffect, type FormEvent } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import { InviteMemberModal } from '../components/workspace/InviteMemberModal';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import {
  Check,
  Lock,
  Users,
  UserPlus,
  Upload,
  Download,
  GitBranch,
  Archive,
  LogOut,
} from 'lucide-react';

interface WorkspaceSettingsViewProps {
  onNavigate?: (path: string) => void;
}

const SWATCHES = [
  'oklch(0.52 0.13 265)', // Indigo / Purple
  'oklch(0.55 0.12 160)', // Teal / Emerald
  'oklch(0.58 0.13 55)',  // Amber / Gold
  'oklch(0.55 0.15 25)',  // Coral / Red
  'oklch(0.52 0.12 320)', // Rose / Magenta
  'oklch(0.5 0.02 250)',  // Slate
];

export function WorkspaceSettingsView({ onNavigate }: WorkspaceSettingsViewProps) {
  const {
    activeWorkspaceId,
    activeWorkspace,
    isManager,
    workspaceColor,
    updateWorkspace,
    archiveWorkspace,
    leaveWorkspace,
  } = useWorkspace();
  const { addToast } = useToast();

  const isPersonal = activeWorkspace?.workspace_type === 'PERSONAL';

  const [name, setName] = useState(activeWorkspace?.name || '');
  const [color, setColor] = useState(activeWorkspace?.color || workspaceColor);
  const [description, setDescription] = useState(activeWorkspace?.description || '');
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name);
      setColor(activeWorkspace.color || workspaceColor);
      setDescription(activeWorkspace.description || '');
    }
  }, [activeWorkspace, workspaceColor]);

  const handleSaveGeneral = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId || !name.trim()) return;

    setIsSaving(true);
    try {
      await updateWorkspace(activeWorkspaceId, {
        name: name.trim(),
        color,
        description: isPersonal ? null : description.trim() || null,
      });
      addToast({
        title: 'Settings saved',
        description: 'Workspace details updated successfully.',
        type: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Failed to save settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmLeave = async () => {
    if (!activeWorkspaceId) return;
    setIsLeaving(true);
    try {
      await leaveWorkspace(activeWorkspaceId);
      addToast({
        title: 'Left workspace',
        description: `You have left ${activeWorkspace?.name || 'the workspace'}.`,
        type: 'info',
      });
      setIsLeaveOpen(false);
      onNavigate?.('/dashboard');
    } catch (err) {
      addToast({
        title: 'Failed to leave workspace',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsLeaving(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!activeWorkspaceId) return;
    setIsArchiving(true);
    try {
      await archiveWorkspace(activeWorkspaceId);
      addToast({
        title: 'Workspace archived',
        description: `${activeWorkspace?.name || 'Workspace'} was archived.`,
        type: 'warning',
      });
      setIsArchiveOpen(false);
      onNavigate?.('/dashboard');
    } catch (err) {
      addToast({
        title: 'Failed to archive workspace',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div
      className="page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: 0,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Title */}
      <div style={{ padding: '20px 24px 16px' }} className="page-title">
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Workspace settings</h1>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          {isPersonal ? 'Personal · only you' : activeWorkspace?.name || 'Workspace'}
        </div>
      </div>

      <div
        style={{
          background: 'var(--color-surface-1)',
          borderTop: '1px solid var(--color-border)',
          flex: 1,
        }}
      >
        {/* Section 1: General */}
        <div
          className="sgrid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 260px) 1fr',
            gap: '32px',
            padding: '24px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
              General
            </h3>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '12.5px',
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              Name and colour appear in the switcher, sidebar edge and breadcrumb.
            </p>
          </div>

          <form
            onSubmit={handleSaveGeneral}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '560px' }}
          >
            <FormField label="Workspace name" required>
              {({ id }) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isManager && !isPersonal}
                />
              )}
            </FormField>

            <FormField
              label="Colour"
              helpText="Colour is decorative and provides a quick visual cue across workspaces."
            >
              {() => (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {SWATCHES.map((swatch) => {
                    const isSelected = color === swatch;
                    return (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setColor(swatch)}
                        style={{
                          width: '28px',
                          height: '28px',
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
                          transition: 'transform var(--duration-fast)',
                        }}
                        aria-label={`Select color ${swatch}`}
                        aria-pressed={isSelected}
                      >
                        {isSelected && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </FormField>

            {!isPersonal && (
              <FormField label="Description" optional>
                {({ id }) => (
                  <Input
                    id={id}
                    placeholder="e.g. Spring 2026 cohort, job search support"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!isManager}
                  />
                )}
              </FormField>
            )}

            {(isManager || isPersonal) && (
              <div style={{ marginTop: '8px' }}>
                <Button variant="primary" type="submit" isLoading={isSaving}>
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </div>

        {/* Section 2: Members */}
        <div
          className="sgrid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 260px) 1fr',
            gap: '32px',
            padding: '24px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
              Members
            </h3>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '12.5px',
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              {isPersonal
                ? 'Personal workspaces have one member. Create a shared workspace to collaborate.'
                : 'Manage access and roles for this workspace.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {isPersonal ? (
              <Button variant="secondary" onClick={() => onNavigate?.('/workspaces/new')}>
                <Users size={15} />
                <span>Create shared workspace</span>
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => onNavigate?.('/workspace/members')}>
                  <Users size={15} />
                  <span>Manage members</span>
                </Button>
                {isManager && (
                  <Button variant="secondary" onClick={() => setIsInviteOpen(true)}>
                    <UserPlus size={15} />
                    <span>Invite</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Section 3: Data */}
        <div
          className="sgrid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 260px) 1fr',
            gap: '32px',
            padding: '24px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
              Data
            </h3>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '12.5px',
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              Import, export and workflow for this workspace.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => onNavigate?.('/workspace/imports')}>
              <Upload size={15} />
              <span>Import</span>
            </Button>
            <Button variant="secondary" onClick={() => onNavigate?.('/workspace/imports')}>
              <Download size={15} />
              <span>Export workspace data</span>
            </Button>
            {!isPersonal && (
              <Button variant="secondary" onClick={() => onNavigate?.('/workspace/workflow')}>
                <GitBranch size={15} />
                <span>Workflow</span>
              </Button>
            )}
          </div>
        </div>

        {/* Section 4: Danger Zone */}
        <div
          className="sgrid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 260px) 1fr',
            gap: '32px',
            padding: '24px',
            borderBottom: 0,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-danger)',
              }}
            >
              Danger zone
            </h3>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '12.5px',
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              Archiving hides the workspace for everyone. Nothing is deleted.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '560px' }}>
            {isPersonal ? (
              <div
                className="banner neutral small"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-2)',
                  fontSize: '12.5px',
                  color: 'var(--color-text-muted)',
                }}
              >
                <Lock size={15} />
                <span>Your personal workspace can't be archived or left.</span>
              </div>
            ) : (
              <>
                {/* Leave Workspace Card */}
                <div
                  className="card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--color-text)' }}>
                      Leave workspace
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      Remove your membership from this workspace.
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setIsLeaveOpen(true)}>
                    <LogOut size={14} />
                    <span>Leave</span>
                  </Button>
                </div>

                {/* Archive Workspace Card (Managers only) */}
                {isManager && (
                  <div
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-danger-border)',
                      background: 'var(--color-danger-soft)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--color-danger)' }}>
                        Archive workspace
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Members lose access. Restorable by a manager.
                      </div>
                    </div>
                    <Button variant="danger" onClick={() => setIsArchiveOpen(true)}>
                      <Archive size={14} />
                      <span>Archive…</span>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {activeWorkspaceId && (
        <InviteMemberModal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          workspaceId={activeWorkspaceId}
        />
      )}

      {/* Leave Workspace Dialog */}
      <Dialog
        isOpen={isLeaveOpen}
        onClose={() => setIsLeaveOpen(false)}
        title="Leave workspace?"
        description={`Are you sure you want to leave ${activeWorkspace?.name || 'this workspace'}?`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setIsLeaveOpen(false)} disabled={isLeaving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmLeave} isLoading={isLeaving}>
              Leave workspace
            </Button>
          </div>
        }
      >
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text)' }}>
          You will lose access to records in this workspace immediately. Your historical records will
          remain preserved in this workspace under your user ID.
        </div>
      </Dialog>

      {/* Archive Workspace Dialog */}
      <Dialog
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        title="Archive workspace?"
        description={`Are you sure you want to archive ${activeWorkspace?.name || 'this workspace'}?`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setIsArchiveOpen(false)} disabled={isArchiving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmArchive} isLoading={isArchiving}>
              Archive workspace
            </Button>
          </div>
        }
      >
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text)' }}>
          All members will lose access immediately. Applications, contacts, and interviews will remain
          safely stored and can be restored by a manager.
        </div>
      </Dialog>
    </div>
  );
}
