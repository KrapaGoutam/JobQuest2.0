import { describe, expect, it, vi } from 'vitest';
import { remainingBulkSelection, runSequentialBulk } from '../../apps/web/src/lib/applicationBulk';

describe('PL-4A page-scoped bulk application operations', () => {
  it('runs the existing per-record mutation sequentially', async () => {
    const order: string[] = [];
    const operation = vi.fn(async (id: string) => {
      order.push(`start:${id}`);
      await Promise.resolve();
      order.push(`finish:${id}`);
    });

    const result = await runSequentialBulk(['a', 'b', 'c'], operation);

    expect(order).toEqual(['start:a', 'finish:a', 'start:b', 'finish:b', 'start:c', 'finish:c']);
    expect(result).toEqual({ succeededIds: ['a', 'b', 'c'], failures: [] });
  });

  it('reports partial failure by record without pretending the batch is atomic', async () => {
    const result = await runSequentialBulk(['ok-1', 'bad', 'ok-2'], async (id) => {
      if (id === 'bad') throw new Error('NOT_AUTHORIZED');
    });

    expect(result.succeededIds).toEqual(['ok-1', 'ok-2']);
    expect(result.failures).toEqual([{ id: 'bad', message: 'NOT_AUTHORIZED' }]);
  });

  it('retains failed and ineligible selections for a clear retry path', () => {
    expect(remainingBulkSelection({
      succeededIds: ['archived'],
      failures: [{ id: 'failed', message: 'ALREADY_ARCHIVED' }],
    }, ['ineligible', 'failed'])).toEqual(['ineligible', 'failed']);
  });
});
