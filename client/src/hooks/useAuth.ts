/**
 * Auth hook using MediVault SDK
 */
import { useAuth as useSDKAuth } from "@/lib/sdk";

export function useAuth() {
  const { data: user, isLoading, error } = useSDKAuth();

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}
