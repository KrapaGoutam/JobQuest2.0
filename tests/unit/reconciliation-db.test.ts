import { expect, test, describe } from 'vitest';
import { safeQuery } from '../../scripts/reconciliation/db';
import { Client } from 'pg';

describe('Reconciliation DB Safety', () => {
  const dummyClient = {} as Client;
  
  test('15. read-only SQL guard rejects INSERT', async () => {
    await expect(safeQuery(dummyClient, 'INSERT INTO users (id) VALUES (1)')).rejects.toThrow('MUTATION DETECTED');
  });

  test('16. read-only SQL guard rejects UPDATE', async () => {
    await expect(safeQuery(dummyClient, 'UPDATE users SET id = 1')).rejects.toThrow('MUTATION DETECTED');
  });

  test('17. read-only SQL guard rejects DELETE', async () => {
    await expect(safeQuery(dummyClient, 'DELETE FROM users')).rejects.toThrow('MUTATION DETECTED');
  });
  
  test('15. read-only SQL guard allows SELECT', async () => {
    const mockClient = {
      query: async () => ({ rows: [] })
    } as any;
    const res = await safeQuery(mockClient, 'SELECT * FROM users');
    expect(res).toEqual([]);
  });
});
