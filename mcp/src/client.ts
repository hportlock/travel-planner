/**
 * Thin REST client used by the MCP tools. Transport-agnostic: tools call this
 * interface, so the same tools.ts works under stdio now and an HTTP transport
 * later. Authenticates with a PAT (Authorization: Bearer).
 */
export interface RestClientLike {
  get(path: string): Promise<any>;
  post(path: string, body?: unknown): Promise<any>;
  patch(path: string, body?: unknown): Promise<any>;
  del(path: string): Promise<any>;
}

export class RestClient implements RestClientLike {
  constructor(
    private baseUrl: string,
    private pat: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.pat}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? safeParse(text) : null;
    if (!res.ok) {
      const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
      throw new Error(`${method} ${path} failed: ${msg}`);
    }
    return json;
  }

  get(path: string) {
    return this.request('GET', path);
  }
  post(path: string, body?: unknown) {
    return this.request('POST', path, body ?? {});
  }
  patch(path: string, body?: unknown) {
    return this.request('PATCH', path, body ?? {});
  }
  del(path: string) {
    return this.request('DELETE', path);
  }
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function clientFromEnv(): RestClient {
  const base = process.env.TRAVEL_API_URL || 'http://localhost:3001';
  const pat = process.env.TRAVEL_PAT || '';
  return new RestClient(base, pat);
}
