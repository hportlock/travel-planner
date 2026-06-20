import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { googleLogin } from '../api/client';

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

const CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCredential = (resp: GoogleCredentialResponse) => {
      if (!resp.credential) {
        setError('No credential returned from Google.');
        return;
      }
      googleLogin(resp.credential)
        .then(() => navigate('/'))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed'));
    };

    const init = () => {
      const gid = window.google?.accounts.id;
      if (!gid || !buttonRef.current) return;
      gid.initialize({ client_id: CLIENT_ID, callback: handleCredential });
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
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-[400px] rounded-card border-[3px] border-white bg-coral px-7 py-9 text-center text-white shadow-[0_16px_36px_rgba(190,80,110,0.32)]">
        <div className="mb-2 text-[40px]">✈︎</div>
        <h1 className="font-display text-[26px] font-extrabold">Travel Plan</h1>
        <p className="mt-1 text-[14px] font-semibold opacity-95">Sign in to plan and share your trips.</p>
      </div>

      <div className="mt-6 flex justify-center" ref={buttonRef} />

      {error ? <p className="mt-4 font-semibold text-ember">{error}</p> : null}

      <p className="mt-6 max-w-[400px] text-center text-[12.5px] font-semibold text-[#8a6f4c]">
        Note: set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> in the client environment to enable
        Google sign-in. The current build uses a placeholder client id.
      </p>
    </div>
  );
}
