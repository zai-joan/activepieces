import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { authenticationSession } from '@/lib/authentication-session';

/**
 * Where to send someone once their session is saved.
 *
 * Only a path within this app is accepted. Anything that could leave the
 * origin — an absolute URL, a protocol-relative "//host", a backslash that
 * some browsers normalise to a slash — falls back to the dashboard, so the
 * `redirect` parameter can never be used to bounce a signed-in visitor to
 * somewhere else.
 */
function safeRedirect(raw: string | null): string {
  if (!raw) return '/flows';
  if (!raw.startsWith('/')) return '/flows';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/flows';
  return raw;
}

const AuthenticatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const response = searchParams.get('response');
  const redirect = safeRedirect(searchParams.get('redirect'));

  useEffect(() => {
    if (response) {
      const decodedResponse = JSON.parse(response);
      authenticationSession.saveResponse(decodedResponse, false);
      navigate(redirect, { replace: true });
    }
  }, [response, redirect]);

  return <>Please wait...</>;
};

export default AuthenticatePage;
