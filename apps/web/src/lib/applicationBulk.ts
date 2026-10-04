export interface BulkFailure {
  id: string;
  message: string;
}

export interface BulkOperationResult {
  succeededIds: string[];
  failures: BulkFailure[];
}

function safeErrorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message;
  return message && message.length < 200 ? message : 'Operation failed';
}

/**
 * Existing application lifecycle RPCs are atomic per record, not as a batch.
 * Run them sequentially and retain the identity of every failed record so the
 * UI can report partial success honestly and leave failures selected for retry.
 */
export async function runSequentialBulk(
  ids: readonly string[],
  operation: (id: string) => Promise<unknown>,
): Promise<BulkOperationResult> {
  const succeededIds: string[] = [];
  const failures: BulkFailure[] = [];

  for (const id of ids) {
    try {
      await operation(id);
      succeededIds.push(id);
    } catch (error: unknown) {
      failures.push({ id, message: safeErrorMessage(error) });
    }
  }

  return { succeededIds, failures };
}

export function remainingBulkSelection(
  result: BulkOperationResult,
  skippedIds: readonly string[] = [],
): string[] {
  return [...new Set([...skippedIds, ...result.failures.map((failure) => failure.id)])];
}
