/**
 * Drop-in replacement for the small slice of the `supertest` API the test suite
 * uses. The sandbox blocks all socket `listen()`/`connect()`, so real supertest
 * (which binds an ephemeral port) cannot run here. `light-my-request` dispatches
 * requests straight into the Express handler in-memory — no socket involved.
 *
 * Supported surface: request(app).get/post/patch/put/delete(url)
 *   .set(field, value) | .set({...}) , .send(body) , await -> { status, body, headers, text }
 *   request.agent(app) — persists Set-Cookie across calls.
 */
import inject from 'light-my-request';

// The dispatch target light-my-request accepts (an http RequestListener).
// An Express app is assignable to this.
type Dispatch = Parameters<typeof inject>[0];

type Headers = Record<string, string | string[]>;

interface InjectResult {
  status: number;
  statusCode: number;
  headers: Headers;
  body: any;
  text: string;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

class CookieJar {
  private jar = new Map<string, string>();
  store(setCookie: string | string[] | undefined): void {
    if (!setCookie) return;
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of list) {
      const pair = c.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /expires=thu, 01 jan 1970/i.test(c)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  header(): string | undefined {
    if (this.jar.size === 0) return undefined;
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

class Test implements PromiseLike<InjectResult> {
  private headers: Record<string, string> = {};
  private payload: string | undefined;

  constructor(
    private app: Dispatch,
    private method: Method,
    private url: string,
    private jar?: CookieJar,
  ) {}

  set(field: string | Record<string, string>, value?: string): this {
    if (typeof field === 'object') {
      for (const [k, v] of Object.entries(field)) this.headers[k.toLowerCase()] = v;
    } else {
      this.headers[field.toLowerCase()] = value as string;
    }
    return this;
  }

  send(body: unknown): this {
    if (body === undefined) return this;
    if (typeof body === 'string') {
      this.payload = body;
    } else {
      this.payload = JSON.stringify(body);
      if (!this.headers['content-type']) this.headers['content-type'] = 'application/json';
    }
    return this;
  }

  // Not used by the suite but kept for compatibility.
  expect(status: number): this {
    this.expectedStatus = status;
    return this;
  }
  private expectedStatus?: number;

  private async exec(): Promise<InjectResult> {
    const headers: Record<string, string> = { ...this.headers };
    const jarCookie = this.jar?.header();
    if (jarCookie && !headers['cookie']) headers['cookie'] = jarCookie;

    const res = await inject(this.app, {
      method: this.method,
      url: this.url,
      headers,
      payload: this.payload,
    });

    this.jar?.store(res.headers['set-cookie'] as string | string[] | undefined);

    const text = res.payload;
    let body: any = {};
    const ct = String(res.headers['content-type'] ?? '');
    if (text && ct.includes('application/json')) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    } else if (text) {
      body = text;
    }

    const result: InjectResult = {
      status: res.statusCode,
      statusCode: res.statusCode,
      headers: res.headers as Headers,
      body,
      text,
    };

    if (this.expectedStatus !== undefined && result.status !== this.expectedStatus) {
      throw new Error(`expected ${this.expectedStatus}, got ${result.status}`);
    }
    return result;
  }

  then<TResult1 = InjectResult, TResult2 = never>(
    onfulfilled?: ((value: InjectResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

interface Requester {
  get(url: string): Test;
  post(url: string): Test;
  patch(url: string): Test;
  put(url: string): Test;
  delete(url: string): Test;
}

function makeRequester(app: Dispatch, jar?: CookieJar): Requester {
  const mk = (method: Method) => (url: string) => new Test(app, method, url, jar);
  return {
    get: mk('GET'),
    post: mk('POST'),
    patch: mk('PATCH'),
    put: mk('PUT'),
    delete: mk('DELETE'),
  };
}

function request(app: Dispatch): Requester {
  return makeRequester(app);
}

request.agent = function agent(app: Dispatch): Requester {
  return makeRequester(app, new CookieJar());
};

export default request;
