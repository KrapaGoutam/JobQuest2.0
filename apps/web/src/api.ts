/** Same-origin calls to the Node façade. Adds the double-submit CSRF header. */
export interface PublicSession { access_token: string; expires_at?: number; token_type: 'bearer' }
export interface PublicUser { id: string; username: string; display_name: string | null; active_workspace_id: string | null }

function csrf(): string {
  const m = document.cookie.match(/(?:^|; )jq_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

export async function api<T>(path: string, body?: unknown, accessToken?: string, method = body === undefined ? 'GET' : 'POST'): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = { 'x-jq-csrf': csrf() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}
