export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/proxy";

export type TaskType =
  | "text_to_video_quality"
  | "image_to_video"
  | "fast_preview"
  | "premium_quality"
  | "video_upscale";

export type Job = {
  id: string;
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
  complexity_score?: number | null;
  complexity_decision?: string | null;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
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
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

export async function uploadAsset(file: File, userId?: string): Promise<string> {
  const presign = await api<{ asset_id: string; upload_url: string }>("/api/assets/presign-upload", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      asset_type: file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image",
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
  return presign.asset_id;
}
