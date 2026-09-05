import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { AuthUser, Channel } from '../types.js';
import { ApiClient, ApiRequestError } from './client.js';

interface SessionState {
  user: AuthUser | null;
  token: string | null;
  /** True until the stored token has been read and validated. */
  isRestoring: boolean;
}

interface ApiContextValue extends SessionState {
  client: ApiClient;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  register: (input: {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    businessName?: string;
    iceNumber?: string;
  }) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export interface ApiProviderProps {
  baseUrl: string;
  channel: Channel;
  children: ReactNode;
}

/**
 * SecureStore keys are namespaced per channel so the wholesale and retail apps
 * can be installed side by side without sharing a session.
 */
const tokenKey = (channel: Channel) => `qri3a.${channel}.token`;

export function ApiProvider({ baseUrl, channel, children }: ApiProviderProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ user: null, token: null, isRestoring: true });

  // The client is built once and reads the token through a ref, so rotating the
  // token never rebuilds the client (and never invalidates every query).
  const tokenRef = useRef<string | null>(null);
  const signOutRef = useRef<() => void>(() => undefined);

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        channel,
        getToken: () => tokenRef.current,
        onUnauthorized: () => signOutRef.current(),
      }),
    [baseUrl, channel],
  );

  const persistToken = useCallback(
    async (token: string | null) => {
      tokenRef.current = token;
      try {
        if (token) await SecureStore.setItemAsync(tokenKey(channel), token);
        else await SecureStore.deleteItemAsync(tokenKey(channel));
      } catch (error) {
        // A device without a secure enclave (or a rooted emulator) can refuse.
        // The session still works for this launch; it just won't survive one.
        console.warn('[api] could not persist session token:', (error as Error).message);
      }
    },
    [channel],
  );

  const signOut = useCallback(async () => {
    await persistToken(null);
    setState({ user: null, token: null, isRestoring: false });
    // Anything cached under this session belongs to the signed-out user.
    queryClient.clear();
  }, [persistToken, queryClient]);

  signOutRef.current = () => {
    void signOut();
  };

  // Restore a stored session on cold start and confirm it is still valid.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let stored: string | null = null;
      try {
        stored = await SecureStore.getItemAsync(tokenKey(channel));
      } catch {
        stored = null;
      }

      if (!stored) {
        if (!cancelled) setState({ user: null, token: null, isRestoring: false });
        return;
      }

      tokenRef.current = stored;
      try {
        const { user } = await client.me();
        if (!cancelled) setState({ user, token: stored, isRestoring: false });
      } catch (error) {
        // An expired token is a normal cold-start outcome; a network blip is
        // not, and must not silently sign the user out.
        const isAuthFailure = error instanceof ApiRequestError && error.isAuthError;
        if (isAuthFailure) {
          await persistToken(null);
          if (!cancelled) setState({ user: null, token: null, isRestoring: false });
        } else if (!cancelled) {
          setState({ user: null, token: stored, isRestoring: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [channel, client, persistToken]);

  const adoptSession = useCallback(
    async (payload: { user: AuthUser; token: string }) => {
      await persistToken(payload.token);
      setState({ user: payload.user, token: payload.token, isRestoring: false });
      await queryClient.invalidateQueries();
      return payload.user;
    },
    [persistToken, queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => adoptSession(await client.login(email, password)),
    [adoptSession, client],
  );

  const register = useCallback(
    async (input: Parameters<ApiClient['register']>[0]) => adoptSession(await client.register(input)),
    [adoptSession, client],
  );

  const refreshUser = useCallback(async () => {
    if (!tokenRef.current) return;
    const { user } = await client.me();
    setState((previous) => ({ ...previous, user }));
  }, [client]);

  const value = useMemo<ApiContextValue>(
    () => ({
      ...state,
      client,
      isSignedIn: Boolean(state.user),
      signIn,
      register,
      signOut,
      refreshUser,
    }),
    [state, client, signIn, register, signOut, refreshUser],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const context = useContext(ApiContext);
  if (!context) throw new Error('useApi must be used inside an <ApiProvider>');
  return context;
}

export function useApiClient(): ApiClient {
  return useApi().client;
}
