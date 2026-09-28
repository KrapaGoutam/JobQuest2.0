import { useState } from 'react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { ArrowLeft, Info } from 'lucide-react';
import { type ResumeRecord, formatResumeRate } from '../../types/documents';

interface ResumeCompareViewProps {
  resumes: ResumeRecord[];
  initialLeftId?: string;
  initialRightId?: string;
  onBack: () => void;
}

export function ResumeCompareView({
  resumes,
  initialLeftId,
  initialRightId,
  onBack,
}: ResumeCompareViewProps) {
  const [leftId, setLeftId] = useState<string>(
    initialLeftId || resumes[0]?.id || ''
  );
  const [rightId, setRightId] = useState<string>(
    initialRightId || (resumes[1] ? resumes[1].id : resumes[0]?.id || '')
  );

  const leftResume = resumes.find((r) => r.id === leftId) || resumes[0];
  const rightResume = resumes.find((r) => r.id === rightId) || resumes[1] || resumes[0];

  const renderRate = (n?: number, d?: number) => {
    if (n === undefined || d === undefined) return '—';
    const formatted = formatResumeRate(n, d);
    if (formatted.isTooFew) {
      return (
        <span style={{ color: 'var(--color-text-muted)' }}>
          {formatted.ratioText} · <i>{formatted.percentText}</i>
        </span>
      );
    }
    return (
      <span style={{ whiteSpace: 'nowrap' }}>
        <strong>{n}</strong>/{d}{' '}
        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
          {formatted.percentText}
        </span>
      </span>
    );
  };

  const getBaseName = (baseId: string | null | undefined) => {
    if (!baseId) return null;
    const base = resumes.find((r) => r.id === baseId);
    return base ? `${base.name} (${base.version_label})` : 'Parent version';
  };

  const rows: Array<{
    label: string;
    renderLeft: () => React.ReactNode;
    renderRight: () => React.ReactNode;
  }> = [
    {
      label: 'Target role',
      renderLeft: () => leftResume?.target_role || '—',
      renderRight: () => rightResume?.target_role || '—',
    },
    {
      label: 'Category',
      renderLeft: () => leftResume?.category || '—',
      renderRight: () => rightResume?.category || '—',
    },
    {
      label: 'Created',
      renderLeft: () => (
        <span>
          {leftResume?.created_at ? new Date(leftResume.created_at).toLocaleDateString() : '—'}
          {leftResume?.base_resume_id && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', display: 'block' }}>
              ↳ revision of {getBaseName(leftResume.base_resume_id)}
            </span>
          )}
        </span>
      ),
      renderRight: () => (
        <span>
          {rightResume?.created_at ? new Date(rightResume.created_at).toLocaleDateString() : '—'}
          {rightResume?.base_resume_id && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', display: 'block' }}>
              ↳ revision of {getBaseName(rightResume.base_resume_id)}
            </span>
          )}
        </span>
      ),
    },
    {
      label: 'Change summary',
      renderLeft: () => leftResume?.change_summary || '—',
      renderRight: () => rightResume?.change_summary || '—',
    },
    {
      label: 'Applications',
      renderLeft: () => leftResume?.used_count ?? 0,
      renderRight: () => rightResume?.used_count ?? 0,
    },
    {
      label: 'Response rate',
      renderLeft: () =>
        renderRate(leftResume?.responses_count, leftResume?.used_count),
      renderRight: () =>
        renderRate(rightResume?.responses_count, rightResume?.used_count),
    },
    {
      label: 'Reached interview',
      renderLeft: () =>
        renderRate(leftResume?.interviews_count, leftResume?.used_count),
      renderRight: () =>
        renderRate(rightResume?.interviews_count, rightResume?.used_count),
    },
    {
      label: 'Reached offer',
      renderLeft: () =>
        renderRate(leftResume?.offers_count, leftResume?.used_count),
      renderRight: () =>
        renderRate(rightResume?.offers_count, rightResume?.used_count),
    },
    {
      label: 'Rejected',
      renderLeft: () => leftResume?.rejections_count ?? 0,
      renderRight: () => rightResume?.rejections_count ?? 0,
    },
    {
      label: 'Notes / Bullets',
      renderLeft: () =>
        leftResume?.content_text ? (
          <pre
            style={{
              margin: 0,
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              lineHeight: 1.4,
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            {leftResume.content_text}
          </pre>
        ) : (
          '—'
        ),
      renderRight: () =>
        rightResume?.content_text ? (
          <pre
            style={{
              margin: 0,
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              lineHeight: 1.4,
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            {rightResume.content_text}
          </pre>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 4px' }}>
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', paddingLeft: 0 }}
        >
          <ArrowLeft size={16} />
          <span>Back to Resumes</span>
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Compare Versions</h1>
      </div>

      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          background: 'var(--color-surface-1)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr 1fr',
            background: 'var(--color-surface-2)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Attribute
          </div>
          <div style={{ padding: '8px 12px', borderLeft: '1px solid var(--color-border)' }}>
            <Select
              id="compare-left-select"
              aria-label="First resume version to compare"
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.version_label})
                </option>
              ))}
            </Select>
          </div>
          <div style={{ padding: '8px 12px', borderLeft: '1px solid var(--color-border)' }}>
            <Select
              id="compare-right-select"
              aria-label="Second resume version to compare"
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.version_label})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {rows.map((row, idx) => (
          <div
            key={row.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr 1fr',
              borderBottom: idx < rows.length - 1 ? '1px solid var(--color-border)' : 'none',
              background: idx % 2 === 1 ? 'var(--color-surface-subtle, rgba(0,0,0,0.01))' : 'transparent',
            }}
          >
            <div
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
              }}
            >
              {row.label}
            </div>
            <div
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
                borderLeft: '1px solid var(--color-border)',
              }}
            >
              {row.renderLeft()}
            </div>
            <div
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
                borderLeft: '1px solid var(--color-border)',
              }}
            >
              {row.renderRight()}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
          fontSize: '12px',
        }}
      >
        <Info size={16} style={{ flexShrink: 0 }} />
        <span>
          Sample sizes differ, and roles you applied to with each version differ too. Treat differences under ~10 points as noise.
        </span>
      </div>
    </div>
  );
}
