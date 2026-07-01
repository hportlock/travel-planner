import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { googleLogin, getConfig } from '../api/client';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (resp: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Validates a `returnTo` redirect target. Allows a relative path or an
 * absolute URL on the current origin only (the OAuth /authorize endpoint is
 * same-origin as the SPA in production); rejects anything else to avoid an
 * open redirect.
 */
function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Fetch the Google client id from the server at runtime (no build-time var).
  useEffect(() => {
    getConfig()
      .then((c) => setClientId(c.googleClientId))
      .catch(() => setClientId(null))
      .finally(() => setConfigLoaded(true));
  }, []);

  // Once we have a client id, load the Google script and render the button.
  useEffect(() => {
    if (!clientId) return;

    const handleCredential = (resp: GoogleCredentialResponse) => {
      if (!resp.credential) {
        setError('No credential returned from Google.');
        return;
      }
      googleLogin(resp.credential)
        .then(() => {
          // Honor ?returnTo — used by the MCP OAuth /authorize flow, which
          // bounces unauthenticated users here and expects a redirect back to
          // the (server-side) authorize URL once a session exists. Only allow
          // safe absolute-path or same-origin targets.
          const returnTo = new URLSearchParams(window.location.search).get('returnTo');
          const dest = safeReturnTo(returnTo);
          if (dest) window.location.assign(dest);
          else navigate('/');
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed'));
    };

    const init = () => {
      const gid = window.google?.accounts.id;
      if (!gid || !buttonRef.current) return;
      gid.initialize({ client_id: clientId, callback: handleCredential });
      gid.renderButton(buttonRef.current, { theme: 'outline', size: 'large', shape: 'pill' });
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing && window.google) {
      init();
      return;
    }

    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);
    return () => script.removeEventListener('load', init);
  }, [clientId, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-[400px] rounded-card border-[3px] border-white bg-coral px-7 py-9 text-center text-white shadow-[0_16px_36px_rgba(190,80,110,0.32)]">
        <div className="mb-2 text-[40px]">✈︎</div>
        <h1 className="font-display text-[26px] font-extrabold">Travel Plan</h1>
        <p className="mt-1 text-[14px] font-semibold opacity-95">Sign in to plan and share your trips.</p>
      </div>

      <div className="mt-6 flex justify-center" ref={buttonRef} />

      {error ? <p className="mt-4 font-semibold text-ember">{error}</p> : null}

      {configLoaded && !clientId ? (
        <p className="mt-6 max-w-[400px] text-center text-[12.5px] font-semibold text-[#8a6f4c]">
          Google sign-in isn’t configured. Set <code className="font-mono">GOOGLE_CLIENT_ID</code> on the server
          (root <code className="font-mono">.env</code> in dev, or <code className="font-mono">dokku config:set</code> in prod).
        </p>
      ) : null}
    </div>
  );
}
