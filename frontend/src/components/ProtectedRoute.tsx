import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { admin, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>;
  }
  if (!admin) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
