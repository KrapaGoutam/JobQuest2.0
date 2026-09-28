export interface MigrationReport {
  metadata: {
    started_at: string;
    target_workspace_id: string;
    target_workspace_name: string;
    dry_run: boolean;
    validate_only: boolean;
    duration_ms?: number;
  };
  counts: Record<string, {
    source: number;
    eligible: number;
    migrated: number;
    skipped: number;
    errors: number;
  }>;
  fk_integrity: Record<string, number>;
  sample_hashes: Record<string, string>;
  claim_codes: Array<{ legacy_user_id: number; hint: string }>;
  pin_hashes_migrated: number;
  errors: Array<string | Error | Record<string, unknown>>;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export interface RunMigrationOptions {
  source: string | Record<string, unknown>;
  targetUrl: string;
  workspaceId?: string;
  workspaceName?: string;
  dryRun?: boolean;
  validateOnly?: boolean;
  confirmNonProduction?: boolean;
  reportPath?: string | null;
}

export interface RollbackOptions {
  targetUrl: string;
  workspaceId: string;
  confirmNonProduction?: boolean;
}

export declare const DEFAULT_MIGRATED_WORKSPACE_ID: string;
export declare const DEFAULT_MIGRATED_WORKSPACE_NAME: string;

export declare function assertSafeTarget(url: string, confirmNonProduction: boolean): void;
export declare function mapLegacyStage(stageStr: string): {
  stage: string;
  status: string;
  outcome: string | null;
  closureReason: string | null;
  eventType: string;
};
export declare function mapLegacyNoteType(rawType: string | null | undefined): string;
export declare function mapLegacyRecurrence(raw: string | null | undefined): string | null;
export declare function normalizeLegacyTimestamp(dateStr: string | null | undefined): string | null;
export declare function mapLegacyStatus(rawStatus: string): {
  stage: string;
  status: string;
  outcome: string | null;
  closureReason: string | null;
  eventType: string;
};
export declare function mapLegacyUser(u: Record<string, any>): {
  username: string;
  cleanUsername: string;
  fullName: string;
  email: string | null;
  themePref: string;
  weekStart: number;
  role: string;
};
export declare function mapLegacyApplication(a: Record<string, any>, existingTags?: string[]): {
  companyName: string;
  roleTitle: string;
  stage: string;
  status: string;
  outcome: string | null;
  closureReason: string | null;
  eventType: string;
  workArrangement: string | null;
  employmentType: string | null;
  location: string | null;
  jobUrl: string | null;
  externalJobId: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  priority: string;
  notes: string | null;
  tags: string[];
  appliedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  hasSnapshot: boolean;
  jobDescription: string | null;
};
export declare function mapLegacyTask(t: Record<string, any>): Record<string, any>;
export declare function mapLegacyReminder(f: Record<string, any>): Record<string, any>;
export declare function mapLegacyNote(n: Record<string, any>): Record<string, any>;
export declare function mapLegacyResume(r: Record<string, any>): Record<string, any>;
export declare function runProductionPreflight(options: { targetUrl: string }): Promise<{
  success: boolean;
  readOnly: boolean;
  checks: Array<{ name: string; status: string; detail: string }>;
  timestamp: string;
}>;
export declare function runMigration(options: RunMigrationOptions): Promise<MigrationReport>;
export declare function rollbackMigration(options: RollbackOptions): Promise<{ success: boolean; workspace_id: string; message: string }>;
