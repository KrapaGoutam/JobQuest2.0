import { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import type {
  Application,
  ApplicationPriority,
  WorkArrangement,
  EmploymentType,
} from '../../types/applications';

export interface EditApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: Application | null;
  onSave: (applicationId: string, updates: Partial<Application>) => Promise<void>;
}

export function EditApplicationModal({
  isOpen,
  onClose,
  application,
  onSave,
}: EditApplicationModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [externalJobId, setExternalJobId] = useState('');
  const [priority, setPriority] = useState<ApplicationPriority>('MEDIUM');
  const [location, setLocation] = useState('');
  const [workArrangement, setWorkArrangement] = useState<WorkArrangement>('Remote');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full-time');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (application) {
      setCompanyName(application.company_name || '');
      setRoleTitle(application.role_title || '');
      setJobUrl(application.job_url || '');
      setExternalJobId(application.external_job_id || '');
      setPriority(application.priority || 'MEDIUM');
      setLocation(application.location || '');
      setWorkArrangement(application.work_arrangement || 'Remote');
      setEmploymentType(application.employment_type || 'Full-time');
      setSalaryMin(application.salary_min !== null && application.salary_min !== undefined ? String(application.salary_min) : '');
      setSalaryMax(application.salary_max !== null && application.salary_max !== undefined ? String(application.salary_max) : '');
      setSalaryCurrency(application.salary_currency || 'USD');
      setNextAction(application.next_action || '');
      setNextActionDate(application.next_action_date || '');
      setTagsInput((application.tags || []).join(', '));
      setNotes(application.notes || '');
      setError(null);
    }
  }, [application, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!application) return;
    if (!companyName.trim()) {
      setError('Company name is required');
      return;
    }
    if (!roleTitle.trim()) {
      setError('Role title is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const parsedMin = salaryMin ? parseFloat(salaryMin) : null;
      const parsedMax = salaryMax ? parseFloat(salaryMax) : null;

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const updates: Partial<Application> = {
        company_name: companyName.trim(),
        role_title: roleTitle.trim(),
        job_url: jobUrl.trim() || null,
        external_job_id: externalJobId.trim() || null,
        priority,
        location: location.trim() || null,
        work_arrangement: workArrangement,
        employment_type: employmentType,
        salary_min: parsedMin,
        salary_max: parsedMax,
        salary_currency: salaryCurrency,
        next_action: nextAction.trim() || null,
        next_action_date: nextActionDate || null,
        tags,
        notes: notes.trim() || null,
      };

      await onSave(application.id, updates);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to update application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Application"
      maxWidth={680}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-application-form" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form id="edit-application-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
          {error && (
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
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="edit-company" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Company Name *
              </label>
              <Input
                id="edit-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="edit-role" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Role Title *
              </label>
              <Input
                id="edit-role"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="edit-job-url" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Job Posting URL
              </label>
              <Input
                id="edit-job-url"
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-req-id" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                External Requisition ID
              </label>
              <Input
                id="edit-req-id"
                value={externalJobId}
                onChange={(e) => setExternalJobId(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="edit-priority" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Priority
              </label>
              <Select
                id="edit-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as ApplicationPriority)}
              >
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </Select>
            </div>
            <div>
              <label htmlFor="edit-arrangement" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Work Arrangement
              </label>
              <Select
                id="edit-arrangement"
                value={workArrangement}
                onChange={(e) => setWorkArrangement(e.target.value as WorkArrangement)}
              >
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Onsite">Onsite</option>
              </Select>
            </div>
            <div>
              <label htmlFor="edit-employment" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Employment Type
              </label>
              <Select
                id="edit-employment"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
              >
                <option value="Full-time">Full-time</option>
                <option value="Contract">Contract</option>
                <option value="Part-time">Part-time</option>
              </Select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="edit-loc" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Location
              </label>
              <Input
                id="edit-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-sal-min" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Salary Min
              </label>
              <Input
                id="edit-sal-min"
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-sal-max" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Salary Max
              </label>
              <Input
                id="edit-sal-max"
                type="number"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-sal-curr" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Currency
              </label>
              <Input
                id="edit-sal-curr"
                value={salaryCurrency}
                onChange={(e) => setSalaryCurrency(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="edit-next-action" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Next Action
              </label>
              <Input
                id="edit-next-action"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-next-date" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Due Date
              </label>
              <Input
                id="edit-next-date"
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-tags" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Tags (comma separated)
            </label>
            <Input
              id="edit-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="edit-notes" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Notes
            </label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
      </form>
    </Dialog>
  );
}
