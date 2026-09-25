import { useState, useEffect, useRef } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { DuplicateWarningCard } from './DuplicateWarningCard';
import { UnsavedChangesBar } from './UnsavedChangesBar';
import { validateApplicationFields } from './validation';
import { checkApplicationDuplicate, type CreateApplicationPayload } from '../../api/applications';
import { fetchResumes } from '../../api/documents';
import type { ResumeRecord } from '../../types/documents';
import type {
  ApplicationStage,
  ApplicationPriority,
  WorkArrangement,
  EmploymentType,
  DuplicateCheckResult,
  CanonicalWorkflow,
} from '../../types/applications';

export interface CreateApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  userId: string;
  workflow: CanonicalWorkflow | null;
  onCreated: (payload: CreateApplicationPayload) => Promise<void>;
  onViewExisting?: (appId: string) => void;
}

export function CreateApplicationModal({
  isOpen,
  onClose,
  workspaceId,
  userId,
  workflow,
  onCreated,
  onViewExisting,
}: CreateApplicationModalProps) {
  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [externalJobId, setExternalJobId] = useState('');

  const [stage, setStage] = useState<ApplicationStage>('APPLIED');
  const [priority, setPriority] = useState<ApplicationPriority>('MEDIUM');
  const [location, setLocation] = useState('');
  const [workArrangement, setWorkArrangement] = useState<WorkArrangement>('Remote');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full-time');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');

  // Snapshot
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [skills, setSkills] = useState('');

  // Next action
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  // Documents / Resume selection
  const [availableResumes, setAvailableResumes] = useState<ResumeRecord[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !workspaceId) return;
    fetchResumes(workspaceId, { includeArchived: false })
      .then((records) => {
        setAvailableResumes(records);
        const defaultDoc = records.find((r) => r.is_default && r.document_type === 'RESUME');
        if (defaultDoc) setSelectedResumeId(defaultDoc.id);
      })
      .catch(() => setAvailableResumes([]));
  }, [isOpen, workspaceId]);

  // Duplicate state
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty =
    [companyName, roleTitle, jobUrl, externalJobId, location, salaryMin, salaryMax, tagsInput, notes, jobDescription, requirements, skills, nextAction, nextActionDate]
      .some((v) => v.trim() !== '') ||
    stage !== 'APPLIED' || priority !== 'MEDIUM' || workArrangement !== 'Remote' || employmentType !== 'Full-time' || salaryCurrency !== 'USD';

  /** AC-CREATE-02: closing with unsaved input asks first (Esc, backdrop, ×, Cancel). */
  const requestClose = () => {
    if (submitting) return;
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    handleReset();
    onClose();
  };

  // Debounced duplicate detection
  const checkTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      setDuplicateResult(null);
      setDuplicateError(null);
      setOverrideDuplicate(false);
      return;
    }

    if (!companyName.trim() && !jobUrl.trim() && !externalJobId.trim()) {
      setDuplicateResult(null);
      return;
    }

    window.clearTimeout(checkTimerRef.current);
    checkTimerRef.current = window.setTimeout(async () => {
      try {
        setIsCheckingDuplicate(true);
        setDuplicateError(null);
        const res = await checkApplicationDuplicate(
          workspaceId,
          companyName.trim(),
          roleTitle.trim(),
          jobUrl.trim() || null,
          externalJobId.trim() || null
        );
        setDuplicateResult(res);
      } catch (err: unknown) {
        setDuplicateError((err as Error).message || 'Check failed');
      } finally {
        setIsCheckingDuplicate(false);
      }
    }, 400);

    return () => window.clearTimeout(checkTimerRef.current);
  }, [companyName, roleTitle, jobUrl, externalJobId, workspaceId, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateApplicationFields({ companyName, roleTitle, jobUrl, salaryMin, salaryMax, salaryCurrency });
    if (problem) {
      setValidationError(problem);
      return;
    }

    // If strong duplicate is detected and not overridden, block accidental submit
    if (duplicateResult?.tier === 'STRONG' && !overrideDuplicate) {
      setValidationError('A strong duplicate already exists. Click "Save anyway" in the banner if you intended to create a separate record.');
      return;
    }

    try {
      setSubmitting(true);
      setValidationError(null);

      const parsedMin = salaryMin ? parseFloat(salaryMin) : null;
      const parsedMax = salaryMax ? parseFloat(salaryMax) : null;

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload: CreateApplicationPayload = {
        workspace_id: workspaceId,
        user_id: userId,
        company_name: companyName.trim(),
        role_title: roleTitle.trim(),
        stage,
        priority,
        location: location.trim() || null,
        work_arrangement: workArrangement,
        employment_type: employmentType,
        salary_min: parsedMin,
        salary_max: parsedMax,
        salary_currency: salaryCurrency.trim().toUpperCase(),
        job_url: jobUrl.trim() || null,
        external_job_id: externalJobId.trim() || null,
        tags,
        notes: notes.trim() || null,
        next_action: nextAction.trim() || null,
        next_action_date: nextActionDate || null,
        duplicate_override_flag: overrideDuplicate,
        resume_id: selectedResumeId || null,
        snapshot:
          showSnapshot && (jobDescription || requirements || skills)
            ? {
                job_description: jobDescription.trim() || undefined,
                requirements: requirements.trim() || undefined,
                skills: skills.trim() || undefined,
              }
            : undefined,
      };

      await onCreated(payload);
      handleReset();
      onClose();
    } catch (err: unknown) {
      setValidationError((err as Error).message || 'Failed to create application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCompanyName('');
    setRoleTitle('');
    setJobUrl('');
    setExternalJobId('');
    setStage('APPLIED');
    setPriority('MEDIUM');
    setWorkArrangement('Remote');
    setEmploymentType('Full-time');
    setSalaryCurrency('USD');
    setLocation('');
    setSalaryMin('');
    setSalaryMax('');
    setTagsInput('');
    setNotes('');
    setShowSnapshot(false);
    setJobDescription('');
    setRequirements('');
    setSkills('');
    setNextAction('');
    setNextActionDate('');
    setDuplicateResult(null);
    setDuplicateError(null);
    setOverrideDuplicate(false);
    setValidationError(null);
    setConfirmDiscard(false);
  };

  const stages = workflow?.stages ?? [
    { id: 'SAVED', label: 'Saved' },
    { id: 'PREPARING', label: 'Preparing' },
    { id: 'APPLIED', label: 'Applied' },
    { id: 'ASSESSMENT', label: 'Assessment' },
    { id: 'RECRUITER_SCREEN', label: 'Recruiter Screen' },
    { id: 'INTERVIEW', label: 'Interview' },
    { id: 'FINAL_INTERVIEW', label: 'Final Interview' },
    { id: 'OFFER', label: 'Offer' },
  ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={requestClose}
      title="New Job Application"
      maxWidth={680}
      footer={
        <>
          <Button variant="outline" type="button" onClick={requestClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-application-form" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Application'}
          </Button>
        </>
      }
    >
      <form id="create-application-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
          {confirmDiscard && (
            <UnsavedChangesBar
              onDiscard={() => {
                handleReset();
                onClose();
              }}
              onKeepEditing={() => setConfirmDiscard(false)}
            />
          )}
          {validationError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-danger)',
                color: 'var(--color-danger)',
                fontSize: '13px',
              }}
              role="alert"
            >
              {validationError}
            </div>
          )}

          {/* Core Info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="app-company" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Company Name *
              </label>
              <Input
                id="app-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp"
                required
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="app-role" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Role Title *
              </label>
              <Input
                id="app-role"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="app-job-url" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Job Posting URL
              </label>
              <Input
                id="app-job-url"
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <label htmlFor="app-req-id" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                External Requisition ID
              </label>
              <Input
                id="app-req-id"
                value={externalJobId}
                onChange={(e) => setExternalJobId(e.target.value)}
                placeholder="e.g. REQ-94820"
              />
            </div>
          </div>

          {/* Live Duplicate Warning */}
          {isCheckingDuplicate && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '2px 0' }}>
              Checking for duplicates...
            </div>
          )}
          <DuplicateWarningCard
            checkResult={duplicateResult}
            checkError={duplicateError}
            onViewExisting={onViewExisting}
            onOverride={() => setOverrideDuplicate(true)}
            hasOverridden={overrideDuplicate}
          />

          {/* Pipeline & Pacing */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="app-stage-select" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Initial Stage
              </label>
              <Select
                id="app-stage-select"
                value={stage}
                onChange={(e) => setStage(e.target.value as ApplicationStage)}
              >
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="app-priority-select" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Priority
              </label>
              <Select
                id="app-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as ApplicationPriority)}
              >
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </Select>
            </div>
            <div>
              <label htmlFor="app-arrangement" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Work Arrangement
              </label>
              <Select
                id="app-arrangement"
                value={workArrangement}
                onChange={(e) => setWorkArrangement(e.target.value as WorkArrangement)}
              >
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Onsite">Onsite</option>
              </Select>
            </div>
            <div>
              <label htmlFor="app-employment" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Employment Type
              </label>
              <Select
                id="app-employment"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
              >
                <option value="Full-time">Full-time</option>
                <option value="Contract">Contract</option>
                <option value="Part-time">Part-time</option>
              </Select>
            </div>
            {availableResumes.length > 0 && (
              <div>
                <label htmlFor="app-resume-select" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  Resume Version
                </label>
                <Select
                  id="app-resume-select"
                  value={selectedResumeId}
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                >
                  <option value="">None / Attach later</option>
                  {availableResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.version_label}){r.is_default ? ' ★ Default' : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Location & Compensation */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="app-loc" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Location
              </label>
              <Input
                id="app-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco, CA"
              />
            </div>
            <div>
              <label htmlFor="app-sal-min" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Salary Min
              </label>
              <Input
                id="app-sal-min"
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="120000"
              />
            </div>
            <div>
              <label htmlFor="app-sal-max" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Salary Max
              </label>
              <Input
                id="app-sal-max"
                type="number"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="160000"
              />
            </div>
            <div>
              <label htmlFor="app-sal-curr" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Currency
              </label>
              <Input
                id="app-sal-curr"
                value={salaryCurrency}
                onChange={(e) => setSalaryCurrency(e.target.value)}
                placeholder="USD"
              />
            </div>
          </div>

          {/* Next Action */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="app-next-action" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Next Action (optional)
              </label>
              <Input
                id="app-next-action"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="e.g. Prepare portfolio for technical presentation"
              />
            </div>
            <div>
              <label htmlFor="app-next-action-date" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Due Date
              </label>
              <Input
                id="app-next-action-date"
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
              />
            </div>
          </div>

          {/* Tags & Notes */}
          <div>
            <label htmlFor="app-tags" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Tags (comma separated)
            </label>
            <Input
              id="app-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="frontend, react, typescript, high-growth"
            />
          </div>

          <div>
            <label htmlFor="app-notes" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Notes
            </label>
            <Textarea
              id="app-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Initial recruiter impressions, interview notes, etc."
              rows={2}
            />
          </div>

          {/* Expandable Job Snapshot Capture */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => setShowSnapshot(!showSnapshot)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-brand-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {showSnapshot ? '– Hide Job Posting Snapshot' : '+ Add Job Posting Snapshot (Requirements, Skills, Text)'}
            </button>

            {showSnapshot && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                <div>
                  <label htmlFor="app-snap-skills" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    Key Skills Extracted
                  </label>
                  <Input
                    id="app-snap-skills"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="e.g. React 19, TypeScript, GraphQL, Playwright"
                  />
                </div>
                <div>
                  <label htmlFor="app-snap-reqs" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    Requirements
                  </label>
                  <Textarea
                    id="app-snap-reqs"
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    placeholder="Key qualifications, years of experience..."
                    rows={2}
                  />
                </div>
                <div>
                  <label htmlFor="app-snap-desc" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    Full Job Posting Text
                  </label>
                  <Textarea
                    id="app-snap-desc"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste full job description for future interview preparation..."
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>
      </form>
    </Dialog>
  );
}
