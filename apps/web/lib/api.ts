export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/proxy";

export type TaskType =
  | "text_to_video_quality"
  | "image_to_video"
  | "fast_preview"
  | "premium_quality"
  | "video_upscale";

export type Job = {
  id: string;
  user_id?: string | null;
  task_type: TaskType;
  status: "queued" | "running" | "submitted" | "uploading" | "completed" | "failed" | "cancelled";
  prompt: string;
  negative_prompt?: string | null;
  model_key?: string | null;
  runpod_endpoint_id?: string | null;
  runpod_job_id?: string | null;
  input_asset_id?: string | null;
  output_asset_id?: string | null;
  output_url?: string | null;
  video_url?: string | null;
  playbackUrl?: string | null;
  cloudflareUrl?: string | null;
  complexity_score?: number | null;
  complexity_decision?: string | null;
  required_credits?: number | null;
  debited_credits?: number | null;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type PricingPlan = {
  id: string;
  key: string;
  name: string;
  price_npr: number;
  credits: number;
  max_video_seconds: number;
  max_jobs_per_month?: number | null;
  features: string[];
  is_active: boolean;
  created_at: string;
};

export type Wallet = {
  user_id: string;
  balance: number;
  lifetime_credits: number;
  lifetime_spent: number;
  updated_at: string;
};

export type AuthSession = {
  user_id: string;
  token: string;
  name?: string | null;
  demo: boolean;
  tier?: string | null;
};

export type UsageSummary = {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  running_jobs: number;
  total_credits_spent: number;
  total_credits_granted: number;
  jobs_by_task: Record<string, number>;
  jobs_by_model: Record<string, number>;
  credits_by_user: Record<string, number>;
};

export type CostEstimate = {
  required_credits: number;
  estimated_gpu_seconds: number;
  price_breakdown: Record<string, unknown>;
  user_balance?: number | null;
  has_enough_credits?: boolean | null;
};

export type ContextPreview = {
  clean_brief: Record<string, unknown>;
  generation_packet: Record<string, unknown>;
  final_prompt: string;
  negative_prompt?: string | null;
  complexity_score: number;
  complexity_decision: string;
  required_credits: number;
  estimated_gpu_seconds: number;
  price_breakdown: Record<string, unknown>;
  user_balance?: number | null;
  has_enough_credits?: boolean | null;
};

export type IntelligencePacket = {
  packet: Record<string, unknown>;
  quality_gate: {
    passed: boolean;
    checks: Record<string, boolean>;
    recommendations: string[];
  };
  scene_plan: Array<Record<string, unknown>>;
  reference_images: Array<Record<string, unknown>>;
  keyframes: Array<Record<string, unknown>>;
  final_video_prompt: string;
  required_credits: number;
  debited_credits: number;
  user_balance?: number | null;
};

export type ModelEndpoint = {
  id: string;
  key: string;
  provider: string;
  endpoint_id: string;
  model_name: string;
  task_type: TaskType;
  workflow_file: string;
  is_active: boolean;
  priority: number;
  max_concurrency: number;
  estimated_cost?: number | null;
};

export type Coupon = {
  id: string;
  code: string;
  description?: string | null;
  credit_amount: number;
  percent_bonus: number;
  max_redemptions?: number | null;
  redeemed_count: number;
  expires_at?: string | null;
  is_active: boolean;
  created_at: string;
};

export type PromptVersion = {
  id: string;
  job_id: string;
  raw_prompt: string;
  clean_brief: Record<string, unknown>;
  generation_packet: Record<string, unknown>;
  final_prompt: string;
  negative_prompt?: string | null;
  complexity_score: number;
  complexity_decision: string;
  model_key?: string | null;
  workflow_file?: string | null;
  created_at: string;
};

export type AssurancePlan = {
  id: string;
  user_id?: string | null;
  project_id?: string | null;
  raw_idea: string;
  structured_intake: Record<string, unknown>;
  expectation_summary: { you_want?: string[]; must_confirm?: string[]; [key: string]: unknown };
  concept_options: Array<{
    id: string;
    name: string;
    style: string;
    location: string;
    lighting: string;
    camera_motion: string;
    description: string;
  }>;
  confidence: {
    expectation_match_score?: number;
    visual_risk?: string;
    continuity_risk?: string;
    recommendation?: string;
  };
  status: "draft" | "awaiting_confirmation" | "confirmed" | "preview_requested" | "final_ready" | "delivered" | "needs_revision";
  selected_concept_id?: string | null;
  confirmed_at?: string | null;
  created_at: string;
};

export type QualityReport = {
  id: string;
  job_id: string;
  technical_checks: Record<string, boolean>;
  commercial_checks: Record<string, boolean>;
  passed: boolean;
  recommendations: string[];
  created_at: string;
};

export type RevisionRequest = {
  id: string;
  job_id: string;
  user_id?: string | null;
  type: string;
  target: Record<string, unknown>;
  instruction: string;
  status: string;
  created_at: string;
};

export type PaymentRequest = {
  id: string;
  user_id: string;
  plan_key: string;
  amount_npr: number;
  credits: number;
  payment_method: string;
  transaction_id: string;
  status: "pending" | "approved" | "rejected";
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type UploadedAsset = {
  asset_id: string;
  r2_key?: string | null;
  public_url?: string | null;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") {
        message = parsed.detail;
      } else if (parsed.detail) {
        message = JSON.stringify(parsed.detail);
      }
    } catch {
      // Fall through to the raw response body when the backend did not return JSON.
    }
    throw new Error(message || response.statusText);
  }
  return response.json() as Promise<T>;
}

export function userHeaders(userId: string, userToken: string): HeadersInit {
  return userId && userToken ? { "x-saar-user-id": userId, "x-saar-user-token": userToken } : {};
}

export async function uploadAsset(file: File, userId?: string, userToken?: string): Promise<UploadedAsset> {
  // TODO: backend AssetType has no generic "file" value yet; PDFs are uploaded as reference assets with their MIME preserved.
  const assetType = file.type.startsWith("video/") ? "video" : "image";
  const presign = await api<{ asset_id: string; upload_url: string; r2_key?: string | null; public_url?: string | null }>("/api/assets/presign-upload", {
    method: "POST",
    headers: userHeaders(userId || "", userToken || ""),
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      file_size: file.size,
      asset_type: assetType,
      user_id: userId || null,
    }),
  });
  const upload = await fetch(presign.upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!upload.ok) {
    throw new Error("Upload to R2 failed");
  }
  return { asset_id: presign.asset_id, r2_key: presign.r2_key, public_url: presign.public_url };
}
