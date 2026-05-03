import { Coupon, Job, ModelEndpoint, PaymentRequest, UsageSummary, Wallet } from "@/lib/api";

const ADMIN_API_URL = "/api/proxy";

export type AdminUserSummary = {
  user_id: string;
  name?: string | null;
  role?: string | null;
  wallet_balance: number;
  lifetime_credits: number;
  lifetime_spent: number;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  last_job_at?: string | null;
  created_at?: string | null;
};

export type AdminAsset = {
  id: string;
  user_id?: string | null;
  type: string;
  r2_key: string;
  public_url?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  created_at: string;
};

export type AdminCouponInput = {
  code: string;
  description?: string | null;
  credit_amount: number;
  percent_bonus: number;
  max_redemptions?: number | null;
  expires_at?: string | null;
  is_active: boolean;
};

function adminHeaders(adminKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-saar-admin-key": adminKey,
  };
}

export async function adminApi<T>(path: string, adminKey: string, init?: RequestInit): Promise<T> {
  if (!adminKey.trim()) {
    throw new Error("Admin access key is required");
  }
  const response = await fetch(`${ADMIN_API_URL}${path}`, {
    ...init,
    headers: {
      ...adminHeaders(adminKey),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      // Keep raw body.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function loadAdminDashboard(adminKey: string) {
  const [usage, users, jobs, coupons, assets, models, paymentRequests] = await Promise.all([
    adminApi<UsageSummary>("/api/admin/usage/summary", adminKey),
    adminApi<AdminUserSummary[]>("/api/admin/users", adminKey),
    adminApi<Job[]>("/api/admin/jobs", adminKey),
    adminApi<Coupon[]>("/api/admin/coupons", adminKey),
    adminApi<AdminAsset[]>("/api/admin/assets", adminKey),
    adminApi<ModelEndpoint[]>("/api/models", adminKey),
    adminApi<PaymentRequest[]>("/api/admin/billing/payment-requests", adminKey),
  ]);
  return { usage, users, jobs, coupons, assets, models, paymentRequests };
}

export function reviewAdminPaymentRequest(adminKey: string, requestId: string, status: string, notes?: string) {
  return adminApi<PaymentRequest>(`/api/admin/billing/payment-requests/${requestId}/review`, adminKey, {
    method: "POST",
    body: JSON.stringify({ status, admin_notes: notes }),
  });
}

export function createAdminCoupon(adminKey: string, input: AdminCouponInput) {
  return adminApi<Coupon>("/api/admin/coupons", adminKey, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function disableAdminCoupon(adminKey: string, couponId: string) {
  return adminApi<Coupon>(`/api/admin/coupons/${couponId}/disable`, adminKey, {
    method: "POST",
  });
}

export function grantAdminCredits(adminKey: string, userId: string, amount: number, reason: string) {
  return adminApi<Wallet>("/api/admin/billing/grant", adminKey, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, amount, reason }),
  });
}
