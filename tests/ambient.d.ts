declare module '*migrate-legacy-data.mjs' {
  export interface MigrationReport {
    metadata: {
      started_at: string;
      target_workspace_id: string;
      target_workspace_name: string;
      dry_run: boolean;
      validate_only: boolean;
      duration_ms?: number;
    };
    counts: Record<string, any>;
    fk_integrity: Record<string, number>;
    sample_hashes: Record<string, string>;
    claim_codes: Array<{ legacy_user_id: number; hint: string }>;
    pin_hashes_migrated: number;
    errors: any[];
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  }

  export interface RunMigrationOptions {
    source: string | Record<string, any>;
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

  export const DEFAULT_MIGRATED_WORKSPACE_ID: string;
  export const DEFAULT_MIGRATED_WORKSPACE_NAME: string;

  export function assertSafeTarget(url: string, confirmNonProduction: boolean): void;
  export function mapLegacyStage(stageStr: string): {
    stage: string;
    status: string;
    outcome: string | null;
    closureReason: string | null;
    eventType: string;
  };
  export function mapLegacyNoteType(rawType: string | null | undefined): string;
  export function mapLegacyRecurrence(raw: string | null | undefined): string | null;
  export function parseLegacyDate(dateStr: string | null | undefined): string | null;
  export function generateClaimCode(): { token: string; hint: string; hash: string };
  export function runMigration(options: RunMigrationOptions): Promise<MigrationReport>;
  export function rollbackMigration(options: RollbackOptions): Promise<{ success: boolean; workspace_id: string; message: string }>;
}
