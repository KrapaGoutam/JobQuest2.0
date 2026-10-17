// A small, faithful in-memory PostgREST reader for unit tests: select / eq / or(...) / order / limit over plain rows.
// `or(...)` understands the logical grammar the services emit: nested and(...)/or(...), and `col.op.value` leaves with
// op in eq | is (null) | like | not.like (`*` is the wildcard). A NULL column never satisfies like / not.like (SQL semantics).
export type Row = Record<string, unknown>;

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const likeToRegExp = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

export function evalFilter(expr: string, row: Row): boolean {
  const e = expr.trim();
  const group = /^(and|or)\((.*)\)$/.exec(e);
  if (group) {
    const parts = splitTop(group[2]!).map((p) => evalFilter(p, row));
    return group[1] === 'and' ? parts.every(Boolean) : parts.some(Boolean);
  }
  const m = /^([a-z_]+)\.(not\.like|like|eq|is)\.(.*)$/.exec(e);
  if (!m) throw new Error(`unsupported filter: ${e}`);
  const [, col, op, val] = m as unknown as [string, string, string, string];
  const v = row[col];
  switch (op) {
    case 'eq': return v === val;
    case 'is': return val === 'null' ? v === null || v === undefined : false;
    case 'like': return typeof v === 'string' && likeToRegExp(val).test(v);
    case 'not.like': return typeof v === 'string' && !likeToRegExp(val).test(v);
    default: throw new Error(`unsupported op: ${op}`);
  }
}

export interface FakeCall { table: string; eq: Array<[string, unknown]>; or: string[] }

export function fakeReader(tables: Record<string, Row[]>, failTable?: string) {
  const calls: FakeCall[] = [];
  const from = (table: string) => {
    const eq: Array<[string, unknown]> = [];
    const orExprs: string[] = [];
    let order: { col: string; asc: boolean } | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: unknown) => { eq.push([c, v]); return chain; },
      or: (expr: string) => { orExprs.push(expr); return chain; },
      order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return chain; },
      limit: async (n: number) => {
        calls.push({ table, eq: [...eq], or: [...orExprs] });
        if (table === failTable) return { data: null, error: { message: 'boom' } };
        let rows = (tables[table] ?? []).filter((r) => eq.every(([c, v]) => r[c] === v) && orExprs.every((x) => evalFilter(`or(${x})`, r)));
        if (order) { const o = order; rows = [...rows].sort((a, b) => String(a[o.col]).localeCompare(String(b[o.col])) * (o.asc ? 1 : -1)); }
        return { data: rows.slice(0, n), error: null };
      },
      maybeSingle: async () => {
        calls.push({ table, eq: [...eq], or: [...orExprs] });
        const rows = (tables[table] ?? []).filter((r) => eq.every(([c, v]) => r[c] === v));
        return { data: rows[0] ?? null, error: null };
      },
    };
    return chain;
  };
  return { reader: { from }, calls };
}
