/**
 * Authentication context for MediVault mobile app
 * Handles token storage and auth state management
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';
import { sdk, User } from './sdk';

const AUTH_TOKEN_KEY = 'medivault_auth_token';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Load token and user on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Handle routing based on auth state
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading]);

  async function loadStoredAuth() {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (token) {
        sdk.setToken(token);
        const result = await sdk.auth.getUser();
        if (result.data) {
          setUser(result.data);
        } else {
          // Token invalid, clear it
          await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
          sdk.setToken(undefined);
        }
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const result = await sdk.auth.login(email, password);
    if (result.error) {
      throw new Error(result.error.message);
    }

    if (result.data.token) {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, result.data.token);
      sdk.setToken(result.data.token);
    }

    setUser(result.data.user);
  }

  async function register(email: string, password: string, firstName?: string, lastName?: string) {
    const result = await sdk.auth.register({ email, password, firstName, lastName });
    if (result.error) {
      throw new Error(result.error.message);
    }

    if (result.data.token) {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, result.data.token);
      sdk.setToken(result.data.token);
    }

    setUser(result.data.user);
  }

  async function logout() {
    try {
      await sdk.auth.logout();
    } catch {
      // Ignore logout errors
    }

    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    sdk.setToken(undefined);
    setUser(null);
  }

  async function refreshUser() {
    const result = await sdk.auth.getUser();
    if (result.data) {
      setUser(result.data);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
