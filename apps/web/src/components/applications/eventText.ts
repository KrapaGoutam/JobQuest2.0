import type { ApplicationEvent, CanonicalWorkflow } from '../../types/applications';

const CLOSURE_LABELS: Record<string, string> = {
  OFFER_DECLINED: 'Offer declined',
  GENERAL_WITHDRAWAL: 'Withdrew',
  COMPENSATION_MISMATCH: 'Compensation mismatch',
  LOCATION_UNSUITABLE: 'Location unsuitable',
  OTHER: 'Other',
};

function stageName(workflow: CanonicalWorkflow | null, id: unknown): string {
  const s = String(id ?? '');
  return workflow?.stages.find((x) => x.id === s)?.label ?? s;
}

function outcomeName(workflow: CanonicalWorkflow | null, id: unknown): string {
  const s = String(id ?? '');
  return workflow?.outcomes.find((x) => x.id === s)?.label ?? s;
}

/** Human-readable timeline text for an application_events row (Gate 02B §4.3 Timeline tab). */
export function describeEvent(ev: ApplicationEvent, workflow: CanonicalWorkflow | null): { label: string; detail: string } {
  const p = ev.payload ?? {};
  switch (ev.event_type) {
    case 'CREATED':
      return { label: 'Application created', detail: p.stage ? `Initial stage: ${stageName(workflow, p.stage)}` : '' };
    case 'CAPTURED':
      return { label: 'Job posting snapshot captured', detail: '' };
    case 'STAGE_CHANGED':
      return {
        label: `Stage: ${stageName(workflow, p.from_stage)} → ${stageName(workflow, p.to_stage)}`,
        detail: p.notes ? String(p.notes) : '',
      };
    case 'OUTCOME_CHANGED': {
      const parts: string[] = [];
      if (p.closure_reason) parts.push(`Reason: ${CLOSURE_LABELS[String(p.closure_reason)] ?? String(p.closure_reason)}`);
      if (p.closure_notes) parts.push(String(p.closure_notes));
      return { label: `Closed: ${outcomeName(workflow, p.outcome)}`, detail: parts.join(' — ') };
    }
    case 'KEEP_ACTIVE':
      return { label: 'Reviewed application (Keep Active)', detail: 'Inactivity timer reset; stage and state unchanged.' };
    case 'ARCHIVED':
      return { label: 'Archived', detail: '' };
    case 'RESTORED':
      return { label: 'Restored from archive', detail: '' };
    default:
      return { label: ev.event_type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), detail: '' };
  }
}
