import { useState, useEffect, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { previewWorkspaceInvitation, joinWorkspace, type InvitationPreview } from '../../api/workspace';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { ShieldAlert } from 'lucide-react';

interface JoinWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  onJoined?: (workspaceId: string) => void;
}

export function JoinWorkspaceModal({
  isOpen,
  onClose,
  initialCode = '',
  onJoined,
}: JoinWorkspaceModalProps) {
  const { loadWorkspaces, setActiveWorkspaceId } = useWorkspace();
  const { addToast } = useToast();
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);

  // Clean and format code input
  const handleCodeChange = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setCode(cleaned);
  };

  // Auto-fetch preview when code matches pattern
  useEffect(() => {
    const trimmed = code.trim();
    if (!/^JQI-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(trimmed)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let isCancelled = false;
    setIsLoadingPreview(true);
    setPreviewError(null);

    previewWorkspaceInvitation(trimmed)
      .then((data) => {
        if (!isCancelled) {
          setPreview(data);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : 'Invalid or expired invite code');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingPreview(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [code]);

  const handleJoin = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;

    setIsJoining(true);
    try {
      const res = await joinWorkspace(code.trim());
      addToast({
        title: 'Joined workspace',
        description: `Successfully joined ${preview?.workspace_name || 'workspace'} as ${res.role}.`,
        type: 'success',
      });
      await loadWorkspaces(res.workspace_id);
      setActiveWorkspaceId(res.workspace_id);
      onJoined?.(res.workspace_id);
      onClose();
    } catch (err) {
      addToast({
        title: 'Failed to join workspace',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsJoining(false);
    }
  };

  const initials = preview?.workspace_name
    ? preview.workspace_name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'WS';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Join a workspace"
      description="Enter an invite code provided by a workspace manager."
      maxWidth={440}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          <Button variant="ghost" onClick={onClose} disabled={isJoining}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleJoin}
            isLoading={isJoining}
            disabled={!preview || isJoining}
          >
            Join workspace
          </Button>
        </div>
      }
    >
      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <FormField label="Invite code" required helpText="Format: JQI-XXXX-XXXX">
          {({ id }) => (
            <Input
              id={id}
              className="mono"
              placeholder="JQI-4KDP-7Q2M"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              autoFocus
              maxLength={13}
              style={{ fontSize: '15px', letterSpacing: '0.05em' }}
            />
          )}
        </FormField>

        {isLoadingPreview && (
          <div className="small muted" style={{ textAlign: 'center', padding: '12px' }}>
            Checking invite code…
          </div>
        )}

        {previewError && (
          <div
            className="banner danger small"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-danger-soft)',
              color: 'var(--color-danger)',
              fontSize: '12px',
            }}
          >
            <ShieldAlert size={15} />
            <span>{previewError}</span>
          </div>
        )}

        {preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              className="card row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="ws-tile"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  background: preview.workspace_color || 'oklch(0.50 0.12 160)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>
                  {preview.workspace_name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  You'll join as <b>{preview.role === 'MANAGER' ? 'Manager' : 'User'}</b>
                  {preview.managers?.length > 0 && ` · managed by ${preview.managers.join(', ')}`}
                </div>
              </div>
            </div>

            <div
              className="small muted"
              style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-muted)' }}
            >
              Managers of this workspace will be able to see and edit the records you create{' '}
              <b>in it</b>. They can't see your personal workspace.
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
}
