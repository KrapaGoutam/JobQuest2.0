import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Switch } from '../components/ui/Switch';
import { StatusBadge, CountBadge } from '../components/ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardBody, CardBand } from '../components/ui/Card';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { Dialog } from '../components/ui/Dialog';
import { Drawer } from '../components/ui/Drawer';
import { Dropdown } from '../components/ui/Dropdown';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeletonRows } from '../components/ui/Table';
import { Avatar } from '../components/ui/Avatar';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { InlineEdit } from '../components/ui/InlineEdit';
import { FormField } from '../components/ui/FormField';
import { StagePips } from '../components/ui/StagePips';
import { PriorityBars } from '../components/ui/PriorityBars';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useToast } from '../context/ToastContext';
import {
  Sparkles,
  Plus,
  Trash2,
  MoreVertical,
  CheckCircle,
  AlertTriangle,
  Info,
  Calendar,
} from 'lucide-react';

export function DesignSystemShowcase() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('buttons');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [inlineValue, setInlineValue] = useState('Senior Product Designer');
  const [sortCol, setSortCol] = useState<'company' | 'stage'>('company');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: 'company' | 'stage') => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Design System Showcase</h1>
            <StatusBadge variant="accent">Direction D Hybrid</StatusBadge>
          </div>
          <p className="muted" style={{ margin: '4px 0 0 0' }}>
            Production-grade reusable component inventory and semantic design token baseline.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ThemeToggle />
          <Button
            variant="primary"
            leftIcon={<Sparkles size={14} />}
            onClick={() => {
              addToast({
                title: 'Showcase Alert',
                description: 'Component showcase is fully interactive and accessible.',
                type: 'success',
              });
            }}
          >
            Trigger Toast
          </Button>
        </div>
      </div>

      {/* Tabs navigation */}
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} id="showcase-tabs">
        <TabList aria-label="Component categories">
          <Tab id="buttons">Buttons & Actions</Tab>
          <Tab id="forms">Form Controls</Tab>
          <Tab id="badges">Badges & Indicators</Tab>
          <Tab id="tables">Table Primitives</Tab>
          <Tab id="overlays">Dialogs & Drawers</Tab>
          <Tab id="feedback">Cards, States & Feedback</Tab>
          <Tab id="tokens">Design Tokens</Tab>
        </TabList>

        {/* Tab 1: Buttons */}
        <TabPanel id="buttons">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Button Variants</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <Button variant="primary">Primary Action</Button>
                <Button variant="secondary">Secondary Action</Button>
                <Button variant="outline">Outline Action</Button>
                <Button variant="ghost">Ghost Action</Button>
                <Button variant="danger">Destructive Action</Button>
                <Button variant="danger-outline">Destructive Outline</Button>
                <Button variant="link">Link Button</Button>
                <Button variant="primary" disabled>Disabled Action</Button>
                <Button variant="primary" isLoading>Loading State</Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Button Sizes & Icons</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <Button size="sm" leftIcon={<Plus size={13} />}>Small Action</Button>
                <Button size="md" leftIcon={<Plus size={14} />}>Medium Action</Button>
                <Button size="lg" leftIcon={<Plus size={16} />}>Large Action</Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Icon Buttons</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <IconButton icon={<Plus size={15} />} aria-label="Add item" />
                <IconButton icon={<Sparkles size={15} />} aria-label="AI Assist" variant="primary" />
                <IconButton icon={<Trash2 size={15} />} aria-label="Delete item" variant="danger" />
                <IconButton icon={<MoreVertical size={15} />} aria-label="More options" variant="ghost" />
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 2: Form Controls */}
        <TabPanel id="forms">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Text Inputs & Textareas</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <FormField label="Full Name" required helpText="Your legal or preferred name">
                  {({ id }) => <Input id={id} placeholder="e.g. Maya Lin" />}
                </FormField>

                <FormField label="Email Address" error="Please enter a valid work email">
                  {({ id }) => <Input id={id} defaultValue="invalid-email" isError />}
                </FormField>

                <FormField label="Disabled Input">
                  {({ id }) => <Input id={id} defaultValue="Read-only system account" disabled />}
                </FormField>

                <FormField label="Job Description Notes" optional helpText="Markdown notes and keywords">
                  {({ id }) => <Textarea id={id} placeholder="Paste requirements and questions..." />}
                </FormField>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Select, Checkbox & Switch</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                <FormField label="Application Stage">
                  {({ id }) => (
                    <Select
                      id={id}
                      options={[
                        { value: 'SAVED', label: 'Saved' },
                        { value: 'PREPARING', label: 'Preparing' },
                        { value: 'APPLIED', label: 'Applied' },
                        { value: 'SCREENING', label: 'Screening' },
                        { value: 'INTERVIEW', label: 'Interview' },
                        { value: 'OFFER', label: 'Offer' },
                      ]}
                      defaultValue="APPLIED"
                    />
                  )}
                </FormField>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
                  <Checkbox
                    id="cb-demo"
                    label="Auto-archive after 90 days"
                    checked={checkboxChecked}
                    onChange={(e) => setCheckboxChecked(e.target.checked)}
                  />
                  <Checkbox
                    id="cb-disabled"
                    label="Disabled locked checkbox"
                    checked={true}
                    disabled
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
                  <Switch
                    id="sw-demo"
                    label="Real-time notifications"
                    checked={switchChecked}
                    onCheckedChange={setSwitchChecked}
                  />
                  <Switch
                    id="sw-disabled"
                    label="Manager broadcast (Disabled)"
                    checked={false}
                    disabled
                  />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inline Edit (CR-002)</CardTitle>
              </CardHeader>
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="muted">Role Title:</span>
                  <InlineEdit
                    label="Role Title"
                    value={inlineValue}
                    onSave={setInlineValue}
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 3: Badges & Indicators */}
        <TabPanel id="badges">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Status Pills & Stage Badges</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <StatusBadge stage="SAVED" />
                <StatusBadge stage="PREPARING" />
                <StatusBadge stage="APPLIED" />
                <StatusBadge stage="SCREENING" />
                <StatusBadge stage="INTERVIEW" />
                <StatusBadge stage="OFFER" />
                <StatusBadge stage="ACCEPTED" />
                <StatusBadge outcome="WITHDRAWN" />
                <StatusBadge outcome="REJECTED" />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Semantic Variant Pills</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <StatusBadge variant="accent">Accent Pill</StatusBadge>
                <StatusBadge variant="success">Success Pill</StatusBadge>
                <StatusBadge variant="warning">Warning Pill</StatusBadge>
                <StatusBadge variant="danger">Danger Pill</StatusBadge>
                <StatusBadge variant="info">Info Pill</StatusBadge>
                <StatusBadge variant="muted">Muted Pill</StatusBadge>
                <CountBadge count={42} />
                <CountBadge count={5} variant="danger" />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stage Pips & Priority Bars</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <b>Stage Pips (5 Steps)</b>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StagePips stage="SAVED" />
                    <span>Saved (1/5)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StagePips stage="APPLIED" />
                    <span>Applied (2/5)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StagePips stage="SCREENING" />
                    <span>Screening (3/5)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StagePips stage="INTERVIEW" />
                    <span>Interview (4/5)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StagePips stage="OFFER" />
                    <span>Offer (5/5)</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <b>Priority Bars (1..3)</b>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <PriorityBars priority="high" />
                    <span>High Priority (3 bars)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <PriorityBars priority="medium" />
                    <span>Medium Priority (2 bars)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <PriorityBars priority="low" />
                    <span>Low Priority (1 bar)</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 4: Table Primitives */}
        <TabPanel id="tables">
          <Card>
            <CardHeader action={<Button size="sm">Export CSV</Button>}>
              <CardTitle>Dense Applications Table (44px Rows)</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead style={{ width: '40px' }}>
                    <Checkbox id="th-all" aria-label="Select all rows" />
                  </TableHead>
                  <TableHead
                    sortable
                    sortDirection={sortCol === 'company' ? sortDir : null}
                    onSort={() => handleSort('company')}
                  >
                    Company & Role
                  </TableHead>
                  <TableHead
                    sortable
                    sortDirection={sortCol === 'stage' ? sortDir : null}
                    onSort={() => handleSort('stage')}
                  >
                    Stage
                  </TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Next Action</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                <TableRow isSelected>
                  <TableCell>
                    <Checkbox id="row-1" aria-label="Select Stripe" checked readOnly />
                  </TableCell>
                  <TableCell>
                    <div>
                      <b>Stripe</b> · Senior Staff Frontend
                      <div className="muted xs">San Francisco, CA · Hybrid</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StagePips stage="INTERVIEW" />
                      <StatusBadge stage="INTERVIEW" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <PriorityBars priority="high" />
                      <span className="small">High</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-danger)' }}>
                      <Calendar size={13} />
                      <span className="small b">System Design Interview (Today)</span>
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    <Dropdown
                      trigger={({ onClick, ref, ...props }) => (
                        <IconButton ref={ref} onClick={onClick} icon={<MoreVertical size={14} />} aria-label="Row actions" variant="ghost" size="sm" {...props} />
                      )}
                      items={[
                        { id: 'view', label: 'View Details', onClick: () => {} },
                        { id: 'stage', label: 'Move to Offer', onClick: () => {} },
                        'separator',
                        { id: 'archive', label: 'Archive Application', isDanger: true, onClick: () => {} },
                      ]}
                    />
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell>
                    <Checkbox id="row-2" aria-label="Select Figma" />
                  </TableCell>
                  <TableCell>
                    <div>
                      <b>Figma</b> · Design Systems Lead
                      <div className="muted xs">New York, NY · Remote</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StagePips stage="APPLIED" />
                      <StatusBadge stage="APPLIED" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <PriorityBars priority="medium" />
                      <span className="small">Medium</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="muted small">Follow-up in 3 days</span>
                  </TableCell>
                  <TableCell align="right">
                    <Dropdown
                      trigger={({ onClick, ref, ...props }) => (
                        <IconButton ref={ref} onClick={onClick} icon={<MoreVertical size={14} />} aria-label="Row actions" variant="ghost" size="sm" {...props} />
                      )}
                      items={[
                        { id: 'view', label: 'View Details', onClick: () => {} },
                        { id: 'stage', label: 'Move to Interview', onClick: () => {} },
                      ]}
                    />
                  </TableCell>
                </TableRow>

                {/* Shimmer loading skeleton preview */}
                <TableSkeletonRows colSpan={6} rows={2} />
              </TableBody>
            </Table>
          </Card>
        </TabPanel>

        {/* Tab 5: Overlays */}
        <TabPanel id="overlays">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Accessible Dialog & Drawer Controls</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
                  Open Modal Dialog
                </Button>
                <Button variant="outline" onClick={() => setIsDrawerOpen(true)}>
                  Open Slide-in Drawer
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Toast Notification Triggers</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  leftIcon={<CheckCircle size={14} className="success-t" />}
                  onClick={() => addToast({ title: 'Success', description: 'Record updated successfully.', type: 'success' })}
                >
                  Success Toast
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<Info size={14} className="info-t" />}
                  onClick={() => addToast({ title: 'Information', description: 'New features available in active workspace.', type: 'info' })}
                >
                  Info Toast
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<AlertTriangle size={14} className="warning-t" />}
                  onClick={() => addToast({ title: 'Follow-up Due', description: '2 follow-ups recommended today.', type: 'warning' })}
                >
                  Warning Toast
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<AlertTriangle size={14} className="danger-t" />}
                  onClick={() => addToast({ title: 'Error', description: 'Network timeout during direct query.', type: 'danger' })}
                >
                  Danger Toast
                </Button>
              </CardBody>
            </Card>

            {/* Modal Dialog Instance */}
            <Dialog
              isOpen={isDialogOpen}
              onClose={() => setIsDialogOpen(false)}
              title="Application Settings"
              description="Configure automatic archival and stage progression rules"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
                    Close
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setIsDialogOpen(false);
                      addToast({ title: 'Preferences saved', type: 'success' });
                    }}
                  >
                    Save Preferences
                  </Button>
                </>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <FormField label="Default Job Source">
                  {({ id }) => <Input id={id} defaultValue="LinkedIn" />}
                </FormField>
                <Checkbox id="dlg-cb" label="Email me daily digest of overdue tasks" defaultChecked />
              </div>
            </Dialog>

            {/* Side Drawer Instance */}
            <Drawer
              isOpen={isDrawerOpen}
              onClose={() => setIsDrawerOpen(false)}
              title="Application Preview Rail"
              description="Stripe · Senior Staff Frontend Engineer"
              footer={
                <Button variant="primary" style={{ width: '100%' }} onClick={() => setIsDrawerOpen(false)}>
                  Done
                </Button>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StatusBadge stage="INTERVIEW" />
                  <span className="muted small">Applied 12 days ago</span>
                </div>
                <CardBand type="warning">
                  <span>Follow-up interview scheduled for tomorrow at 2:00 PM</span>
                </CardBand>
                <div>
                  <b>Salary Target:</b> $220k - $250k base + equity
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Screening passed with hiring manager. Preparing architecture portfolio for panel session.
                </p>
              </div>
            </Drawer>
          </div>
        </TabPanel>

        {/* Tab 6: Feedback & States */}
        <TabPanel id="feedback">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Banners & Bands</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <CardBand type="danger">
                  Long waiting: 4 applications have had no activity for over 30 days.
                </CardBand>
                <CardBand type="warning">
                  Follow-up recommended today for Anthropic and Figma.
                </CardBand>
                <CardBand type="neutral">
                  System maintenance scheduled for Saturday 02:00 UTC.
                </CardBand>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Empty State</CardTitle>
              </CardHeader>
              <CardBody>
                <EmptyState
                  title="No active interviews"
                  description="When you advance applications to the interview stage, your schedule and prep notes will appear here."
                  action={<Button variant="primary">Schedule Interview</Button>}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Avatars & Skeleton Loading</CardTitle>
              </CardHeader>
              <CardBody style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <Avatar name="Sarah Connor" size="sm" />
                <Avatar name="Sarah Connor" size="md" />
                <Avatar name="Sarah Connor" size="lg" />
                <Avatar name="Sarah Connor" size="xl" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Skeleton height={16} width="60%" />
                  <Skeleton height={12} width="85%" />
                  <Skeleton height={12} width="40%" />
                </div>
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 7: Tokens */}
        <TabPanel id="tokens">
          <Card>
            <CardHeader>
              <CardTitle>Semantic Token Swatches</CardTitle>
            </CardHeader>
            <CardBody style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              {[
                { name: '--color-canvas', value: 'var(--color-canvas)', label: 'Canvas' },
                { name: '--color-surface-1', value: 'var(--color-surface-1)', label: 'Surface 1' },
                { name: '--color-surface-2', value: 'var(--color-surface-2)', label: 'Surface 2' },
                { name: '--color-surface-3', value: 'var(--color-surface-3)', label: 'Surface 3' },
                { name: '--color-text', value: 'var(--color-text)', label: 'Text Primary' },
                { name: '--color-text-muted', value: 'var(--color-text-muted)', label: 'Text Muted' },
                { name: '--color-accent', value: 'var(--color-accent)', label: 'Accent / Primary' },
                { name: '--color-accent-soft', value: 'var(--color-accent-soft)', label: 'Accent Soft' },
                { name: '--color-success', value: 'var(--color-success)', label: 'Success' },
                { name: '--color-warning', value: 'var(--color-warning)', label: 'Warning' },
                { name: '--color-danger', value: 'var(--color-danger)', label: 'Danger' },
                { name: '--color-info', value: 'var(--color-info)', label: 'Info' },
              ].map((token) => (
                <div
                  key={token.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      background: token.value,
                      border: '1px solid var(--color-border-strong)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>{token.label}</div>
                    <code style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{token.name}</code>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </TabPanel>
      </Tabs>
    </div>
  );
}
