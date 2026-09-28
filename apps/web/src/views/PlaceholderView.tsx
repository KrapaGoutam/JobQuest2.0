import { type ReactNode } from 'react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Sparkles } from 'lucide-react';

export interface PlaceholderViewProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  milestoneOwner?: string;
  actionText?: string;
  onAction?: () => void;
}

export function PlaceholderView({
  title,
  subtitle,
  icon,
  milestoneOwner = 'Milestone 4+',
  actionText,
  onAction,
}: PlaceholderViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{title}</h1>
            <StatusBadge variant="muted">{milestoneOwner}</StatusBadge>
          </div>
          <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
            {subtitle}
          </p>
        </div>

        {actionText && (
          <Button variant="primary" onClick={onAction}>
            {actionText}
          </Button>
        )}
      </div>

      <Card>
        <CardBody style={{ padding: '48px 24px' }}>
          <EmptyState
            icon={icon}
            title={`${title} Module`}
            description={`This module's UI layout and domain logic will be fully integrated during ${milestoneOwner}. The Direction D shell and design tokens are ready.`}
            action={
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Sparkles size={14} className="primary-t" />}
                onClick={() => {
                  window.location.hash = '#/design-system';
                }}
              >
                Inspect Reusable Design System
              </Button>
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}
