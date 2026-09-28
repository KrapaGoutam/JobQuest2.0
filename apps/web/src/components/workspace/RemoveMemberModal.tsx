import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { removeWorkspaceMember, type WorkspaceMemberDetailed } from '../../api/workspace';
import { Lightbulb } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface RemoveMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  member: WorkspaceMemberDetailed | null;
  onMemberRemoved?: () => void;
  onSuspendInstead?: (member: WorkspaceMemberDetailed) => void;
}

export function RemoveMemberModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  member,
  onMemberRemoved,
  onSuspendInstead,
}: RemoveMemberModalProps) {
  const { addToast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);

  if (!member) return null;

  const displayName = member.display_name || member.username;
  const joinedDate = new Date(member.joined_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeWorkspaceMember(workspaceId, member.user_id);
      addToast({
        title: 'Member removed',
        description: `${displayName} was removed from ${workspaceName}.`,
        type: 'success',
      });
      onMemberRemoved?.();
      onClose();
    } catch (err) {
      addToast({
        title: 'Failed to remove member',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Remove ${displayName}?`}
      description={`@${member.username} · ${member.role === 'MANAGER' ? 'Manager' : 'User'} · joined ${joinedDate}`}
      maxWidth={520}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          <Button variant="ghost" onClick={onClose} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRemove} isLoading={isRemoving}>
            Remove member
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <ul
          style={{
            margin: 0,
            paddingLeft: '20px',
            lineHeight: 1.7,
            fontSize: '13px',
            color: 'var(--color-text)',
          }}
        >
          <li>
            {displayName} loses access to <b>{workspaceName}</b> immediately.
          </li>
          <li>
            Their <b>{member.applications_count} applications</b>, contacts and history{' '}
            <b>stay in this workspace</b>, still owned by {displayName}.
          </li>
          <li>Their browser-extension tokens for this workspace are revoked.</li>
          <li>Their personal workspace and other memberships aren't affected.</li>
        </ul>

        <div
          className="banner neutral small"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-2)',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
          }}
        >
          <Lightbulb size={15} style={{ flexShrink: 0 }} />
          <span>
            To pause access and keep them listed,{' '}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSuspendInstead?.(member);
              }}
              style={{
                background: 'none',
                border: 0,
                color: 'var(--color-accent)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
              }}
            >
              suspend
            </button>{' '}
            instead.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
