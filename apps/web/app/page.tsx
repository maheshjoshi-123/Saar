"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Play, RefreshCw, UploadCloud, WandSparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { api, Job, PromptVersion, TaskType, uploadAsset } from "@/lib/api";

const TASKS: { value: TaskType; label: string; hint: string }[] = [
  { value: "image_to_video", label: "Image to Video", hint: "Wan I2V for animating a source image" },
  { value: "text_to_video_quality", label: "Text to Video", hint: "Wan T2V quality generation" },
  { value: "fast_preview", label: "Fast Preview", hint: "LTX fast low-cost draft" },
  { value: "premium_quality", label: "Premium Quality", hint: "Hunyuan/Wan high-quality workflow" },
  { value: "video_upscale", label: "Video Upscale", hint: "Upscale or smooth a generated video" },
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("image_to_video");
  const [file, setFile] = useState<File | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Job[]>("/api/jobs"),
    refetchInterval: 5000,
  });

  const activeJob = useQuery({
    queryKey: ["job", activeJobId],
    queryFn: () => api<Job>(`/api/jobs/${activeJobId}`),
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 5000;
    },
  });
  const promptVersion = useQuery({
    queryKey: ["prompt-version", activeJobId],
    queryFn: () => api<PromptVersion>(`/api/jobs/${activeJobId}/prompt-version`),
    enabled: Boolean(activeJobId),
  });

  const createJob = useMutation({
    mutationFn: async () => {
      let inputAssetId: string | undefined;
      if (file) {
        inputAssetId = await uploadAsset(file);
      }
      return api<Job>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt || null,
          task_type: taskType,
          input_asset_id: inputAssetId || null,
          options: { seed: -1, poll_seconds: 10, max_poll_attempts: 180 },
        }),
      });
    },
    onSuccess: (job) => {
      setActiveJobId(job.id);
      jobs.refetch();
    },
  });

  const selectedTask = useMemo(() => TASKS.find((item) => item.value === taskType), [taskType]);
  const fileRequired = taskType === "image_to_video" || taskType === "video_upscale";
  const canSubmit = Boolean(prompt) && (!fileRequired || Boolean(file)) && !createJob.isPending;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    createJob.mutate();
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Saar AI Video Factory</h1>
            <p className="mt-1 text-sm text-slate-600">RunPod ComfyUI pipeline with queued jobs and R2 delivery</p>
          </div>
          <button onClick={() => jobs.refetch()} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-lg border border-line bg-white p-5">
          <div className="mb-5 flex items-center gap-2">
            <WandSparkles className="text-teal" />
            <h2 className="text-lg font-semibold">Create Job</h2>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Task</span>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)} className="mt-2 w-full rounded-md border border-line px-3 py-2">
                {TASKS.map((task) => (
                  <option key={task.value} value={task.value}>{task.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">{selectedTask?.hint}</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Prompt</span>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} required rows={6} className="mt-2 w-full rounded-md border border-line px-3 py-2" placeholder="Describe the video..." />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Negative Prompt</span>
              <input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} className="mt-2 w-full rounded-md border border-line px-3 py-2" placeholder="blur, watermark, low quality" />
            </label>

            <label className="block rounded-md border border-dashed border-line p-4">
              <span className="inline-flex items-center gap-2 text-sm font-medium"><UploadCloud size={16} /> {fileRequired ? "Required input file" : "Optional input file"}</span>
              <input type="file" accept="image/*,video/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-3 block w-full text-sm" />
              {file ? <span className="mt-2 block text-xs text-slate-500">{file.name}</span> : null}
            </label>

            <button disabled={!canSubmit} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal px-4 py-3 font-medium text-white disabled:opacity-50">
              <Play size={16} /> {createJob.isPending ? "Submitting..." : "Generate Video"}
            </button>
            {fileRequired && !file ? <p className="text-sm text-slate-500">This task needs an input file before it can run.</p> : null}
            {createJob.error ? <p className="text-sm text-red-700">{createJob.error.message}</p> : null}
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-lg font-semibold">Active Job</h2>
            {activeJob.data ? <JobDetail job={activeJob.data} promptVersion={promptVersion.data} /> : <p className="mt-3 text-sm text-slate-500">Submit a job or select one from history.</p>}
          </div>

          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-lg font-semibold">Recent Jobs</h2>
            <div className="mt-4 space-y-3">
              {(jobs.data || []).map((job) => (
                <button key={job.id} onClick={() => setActiveJobId(job.id)} className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-md border border-line p-3 text-left hover:bg-mist">
                  <span>
                    <span className="block text-sm font-medium">{job.prompt}</span>
                    <span className="mt-1 block text-xs text-slate-500">{job.task_type} | {job.id}</span>
                  </span>
                  <StatusPill status={job.status} />
                </button>
              ))}
              {!jobs.data?.length ? <p className="text-sm text-slate-500">No jobs yet.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function JobDetail({ job, promptVersion }: { job: Job; promptVersion?: PromptVersion }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={job.status} />
        <span className="text-xs text-slate-500">{job.id}</span>
      </div>
      <p className="text-sm">{job.prompt}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Info label="Task" value={job.task_type} />
        <Info label="Model" value={job.model_key || "auto"} />
        <Info label="RunPod Endpoint" value={job.runpod_endpoint_id || "pending"} />
        <Info label="RunPod Job" value={job.runpod_job_id || "pending"} />
        <Info label="Complexity" value={job.complexity_score != null ? `${job.complexity_score} / ${job.complexity_decision}` : "pending"} />
      </dl>
      {promptVersion ? (
        <details className="rounded-md border border-line bg-mist p-3">
          <summary className="cursor-pointer text-sm font-medium">Generation Packet</summary>
          <p className="mt-3 text-xs font-semibold text-slate-600">Final model prompt</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{promptVersion.final_prompt}</p>
          <p className="mt-3 text-xs font-semibold text-slate-600">Packet JSON</p>
          <pre className="mt-1 max-h-80 overflow-auto rounded bg-white p-3 text-xs">{JSON.stringify(promptVersion.generation_packet, null, 2)}</pre>
        </details>
      ) : null}
      {job.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{job.error}</p> : null}
      {job.output_url ? (
        <video src={job.output_url} controls className="aspect-video w-full rounded-md bg-black" />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md border border-line bg-mist text-sm text-slate-500">
          {job.status === "failed" ? "Generation failed" : "Waiting for output..."}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-mist p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  const color = status === "completed" ? "bg-emerald-100 text-emerald-800" : status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{status}</span>;
}
