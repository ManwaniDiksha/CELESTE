import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDemoConfig,
  getOwnerSession,
  getPinSession,
  loginDemoOwner,
  loginDemoPin,
  loginWithPin,
  logoutPinSession,
} from '../services/api.js';
import { isSupabaseConfigured, supabase } from '../services/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [pinSession, setPinSession] = useState({
    loading: true,
    authenticated: false,
    scope: null,
    staffSlug: null,
    staff: null,
    expiresAt: null,
    error: null,
  });

  const [ownerAuth, setOwnerAuth] = useState({
    loading: true,
    authenticated: false,
    accessToken: null,
    user: null,
    error: null,
  });

  const [demoConfig, setDemoConfig] = useState({
    loading: true,
    enabled: false,
    hasPinDemo: false,
    hasOwnerDemo: false,
    demoPin: null,
    demoOwnerEmail: null,
  });

  const sessionSeqRef = useRef(0);

  const refreshPinSession = useCallback(async () => {
    const seq = ++sessionSeqRef.current;
    try {
      const res = await getPinSession();
      if (seq !== sessionSeqRef.current) return null;
      const data = res?.data || {};
      const nextState = {
        loading: false,
        authenticated: Boolean(data.authenticated),
        scope: data.scope || null,
        staffSlug: data.staffSlug || null,
        staff: data.staff || null,
        expiresAt: data.expiresAt || null,
        error: null,
      };
      setPinSession(nextState);
      return nextState;
    } catch (err) {
      if (seq !== sessionSeqRef.current) return null;
      const nextState = {
        loading: false,
        authenticated: false,
        scope: null,
        staffSlug: null,
        staff: null,
        expiresAt: null,
        error: err.message || 'Unable to verify session.',
      };
      setPinSession(nextState);
      return nextState;
    }
  }, []);

  const verifyOwnerSessionToken = useCallback(async (session) => {
    if (!session?.access_token) {
      setOwnerAuth({
        loading: false,
        authenticated: false,
        accessToken: null,
        user: null,
        error: null,
      });
      return false;
    }

    if (session.user?.app_metadata?.role !== 'owner') {
      setOwnerAuth({
        loading: false,
        authenticated: false,
        accessToken: null,
        user: session.user || null,
        error: 'This account does not have owner privileges.',
      });
      return false;
    }

    try {
      const verified = await getOwnerSession(session.access_token);
      setOwnerAuth({
        loading: false,
        authenticated: true,
        accessToken: session.access_token,
        user: verified?.data?.user || {
          id: session.user.id,
          email: session.user.email || null,
        },
        error: null,
      });
      return true;
    } catch (err) {
      setOwnerAuth({
        loading: false,
        authenticated: false,
        accessToken: null,
        user: null,
        error: err.message || 'Owner session verification failed.',
      });
      return false;
    }
  }, []);

  useEffect(() => {
    refreshPinSession();
    getDemoConfig()
      .then((res) => {
        const d = res?.data || {};
        setDemoConfig({
          loading: false,
          enabled: Boolean(d.enabled),
          hasPinDemo: Boolean(d.hasPinDemo),
          hasOwnerDemo: Boolean(d.hasOwnerDemo),
          demoPin: d.demoPin || null,
          demoOwnerEmail: d.demoOwnerEmail || null,
        });
      })
      .catch(() => {
        setDemoConfig({
          loading: false,
          enabled: false,
          hasPinDemo: false,
          hasOwnerDemo: false,
          demoPin: null,
          demoOwnerEmail: null,
        });
      });
  }, [refreshPinSession]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setOwnerAuth({
        loading: false,
        authenticated: false,
        accessToken: null,
        user: null,
        error: null,
      });
      return undefined;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      verifyOwnerSessionToken(data?.session || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      verifyOwnerSessionToken(session || null);
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [verifyOwnerSessionToken]);

  const loginPin = useCallback(async ({ pin, scope, staffSlug = null }) => {
    const seq = ++sessionSeqRef.current;
    const res = await loginWithPin({ pin, scope, staffSlug });
    const data = res?.data || {};

    // Verify that the browser stored and returned the HttpOnly session cookie
    // before unlocking protected Reception or Stylist routes.
    const verifiedRes = await getPinSession();
    if (seq !== sessionSeqRef.current) return data;
    const verified = verifiedRes?.data || {};

    const expectedSlug = scope === 'staff' ? (staffSlug || '').trim().toLowerCase() : null;
    if (
      !verified.authenticated ||
      verified.scope !== scope ||
      (scope === 'staff' && verified.staffSlug !== expectedSlug)
    ) {
      setPinSession({
        loading: false,
        authenticated: false,
        scope: null,
        staffSlug: null,
        staff: null,
        expiresAt: null,
        error: null,
      });
      throw new Error(
        'Sign-in succeeded, but your browser did not retain the session cookie. Ensure cookies are enabled and access the app via a matching host.'
      );
    }

    setPinSession({
      loading: false,
      authenticated: true,
      scope: verified.scope,
      staffSlug: verified.staffSlug || null,
      staff: verified.staff || data.staff || null,
      expiresAt: verified.expiresAt || null,
      error: null,
    });
    return verified;
  }, []);

  const invalidatePinSession = useCallback((message = '') => {
    sessionSeqRef.current += 1;
    setPinSession({
      loading: false,
      authenticated: false,
      scope: null,
      staffSlug: null,
      staff: null,
      expiresAt: null,
      error: message || null,
    });
  }, []);

  const logoutPin = useCallback(async () => {
    sessionSeqRef.current += 1;
    try {
      await logoutPinSession();
    } finally {
      setPinSession({
        loading: false,
        authenticated: false,
        scope: null,
        staffSlug: null,
        staff: null,
        expiresAt: null,
        error: null,
      });
    }
  }, []);

  const loginOwner = useCallback(
    async (email, password) => {
      if (!supabase) {
        throw new Error('Supabase Auth is not configured in frontend environment.');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw new Error(error.message || 'Owner sign-in failed.');
      }

      if (data?.user?.app_metadata?.role !== 'owner') {
        await supabase.auth.signOut();
        throw new Error('Access denied: this account does not have the owner role.');
      }

      const ok = await verifyOwnerSessionToken(data.session);
      if (!ok) {
        await supabase.auth.signOut();
        throw new Error('Backend rejected owner session verification.');
      }

      return data;
    },
    [verifyOwnerSessionToken]
  );

  const logoutOwner = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setOwnerAuth({
      loading: false,
      authenticated: false,
      accessToken: null,
      user: null,
      error: null,
    });
  }, []);

  const loginPinDemo = useCallback(async ({ scope, staffSlug = null, pin = null }) => {
    const seq = ++sessionSeqRef.current;
    const res = await loginDemoPin({ scope, staffSlug, pin });
    const data = res?.data || {};
    const verifiedRes = await getPinSession();
    if (seq !== sessionSeqRef.current) return data;
    const verified = verifiedRes?.data || {};

    const expectedSlug = scope === 'staff' ? (staffSlug || '').trim().toLowerCase() : null;
    if (
      !verified.authenticated ||
      verified.scope !== scope ||
      (scope === 'staff' && verified.staffSlug !== expectedSlug)
    ) {
      throw new Error('Demo sign-in succeeded, but your browser did not retain the session cookie.');
    }

    setPinSession({
      loading: false,
      authenticated: true,
      scope: verified.scope,
      staffSlug: verified.staffSlug || null,
      staff: verified.staff || data.staff || null,
      expiresAt: verified.expiresAt || null,
      error: null,
    });
    return verified;
  }, []);

  const loginOwnerDemo = useCallback(async () => {
    if (!supabase) {
      throw new Error('Supabase Auth is not configured in frontend environment.');
    }
    const res = await loginDemoOwner();
    const { access_token, refresh_token } = res?.data || {};
    if (!access_token || !refresh_token) {
      throw new Error('Demo Owner session tokens were not returned.');
    }
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error || !data?.session) {
      throw new Error(error?.message || 'Unable to activate Demo Owner session.');
    }
    const ok = await verifyOwnerSessionToken(data.session);
    if (!ok) {
      await supabase.auth.signOut();
      throw new Error('Backend rejected Demo Owner session verification.');
    }
    return data;
  }, [verifyOwnerSessionToken]);

  const value = useMemo(
    () => ({
      pinSession,
      refreshPinSession,
      loginPin,
      loginPinDemo,
      invalidatePinSession,
      logoutPin,
      ownerAuth,
      loginOwner,
      loginOwnerDemo,
      logoutOwner,
      demoConfig,
    }),
    [
      pinSession,
      refreshPinSession,
      loginPin,
      loginPinDemo,
      invalidatePinSession,
      logoutPin,
      ownerAuth,
      loginOwner,
      loginOwnerDemo,
      logoutOwner,
      demoConfig,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
}
