"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgePercent,
  CheckCircle2,
  Clapperboard,
  Coins,
  FileVideo,
  Gauge,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  UploadCloud,
  User,
} from "lucide-react";
import { ChangeEvent, DragEvent, FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  AssurancePlan,
  ContextPreview,
  CostEstimate,
  Coupon,
  Job,
  ModelEndpoint,
  PricingPlan,
  PromptVersion,
  QualityReport,
  TaskType,
  userHeaders,
  Wallet,
  uploadAsset,
} from "@/lib/api";

const TASKS: { value: TaskType; label: string; hint: string }[] = [
  { value: "fast_preview", label: "Fast preview", hint: "Draft motion cheaply" },
  { value: "text_to_video_quality", label: "Text to video", hint: "Balanced final render" },
  { value: "image_to_video", label: "Image to video", hint: "Animate a reference" },
  { value: "premium_quality", label: "Premium quality", hint: "Highest quality route" },
  { value: "video_upscale", label: "Video upscale", hint: "Improve existing video" },
];

const SELECTORS = {
  style: ["Luxury", "Streetwear", "Corporate", "Minimal"],
  mood: ["Aspirational", "Bold", "Calm", "Energetic"],
  platform: ["Facebook Reel", "Instagram Reel", "TikTok", "YouTube Shorts"],
  pace: ["Slow", "Medium", "Fast"],
  realism: ["Natural", "Hyper-real", "Stylised"],
  quality: ["preview", "standard", "premium"],
};

export default function Home() {
  const [idea, setIdea] = useState("A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once");
  const [style, setStyle] = useState("Luxury");
  const [mood, setMood] = useState("Aspirational");
  const [platform, setPlatform] = useState("Facebook Reel");
  const [pace, setPace] = useState("Slow");
  const [realism, setRealism] = useState("Natural");
  const [quality, setQuality] = useState("standard");
  const [durationSeconds, setDurationSeconds] = useState(6);
  const [audience, setAudience] = useState("young urban Nepalese consumers");
  const [product, setProduct] = useState("warm grey curved-brim cap");
  const [location, setLocation] = useState("Kathmandu rooftop");
  const [taskType, setTaskType] = useState<TaskType>("text_to_video_quality");
  const [modelKey, setModelKey] = useState("");
  const [userId, setUserId] = useState("demo-user");
  const [userToken, setUserToken] = useState("");
  const [couponCode, setCouponCode] = useState("SAAR100");
  const [adminKey, setAdminKey] = useState("");
  const [adminCouponCode, setAdminCouponCode] = useState("SAAR100");
  const [adminCouponCredits, setAdminCouponCredits] = useState(100);
  const [adminGrantAmount, setAdminGrantAmount] = useState(250);
  const [adminPlanKey, setAdminPlanKey] = useState("creator");
  const [file, setFile] = useState<File | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [plan, setPlan] = useState<AssurancePlan | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [revisionText, setRevisionText] = useState("Make the camera movement slower and keep the product logo stable");

  const scopedHeaders = userHeaders(userId, userToken);
  const commonOptions = {
    style,
    mood,
    platform,
    pace,
    realism,
    audience,
    product,
    location,
    duration: `${durationSeconds} seconds`,
    duration_seconds: durationSeconds,
    subject_lock: {
      object: product,
      description: product,
      logo_rule: "logos, embroidery, and product marks must remain stable and readable",
      colour_rule: "preserve the described or source asset colour exactly",
      shape_constraints: ["hero product silhouette must not morph", "main subject remains visible and stable"],
    },
  };

  const jobs = useQuery({
    queryKey: ["jobs", userId, userToken],
    queryFn: () => api<Job[]>(`/api/jobs?user_id=${encodeURIComponent(userId)}`, { headers: scopedHeaders }),
    enabled: Boolean(userId),
    refetchInterval: 5000,
  });

  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => api<PricingPlan[]>("/api/pricing/plans") });
  const models = useQuery({ queryKey: ["models"], queryFn: () => api<ModelEndpoint[]>("/api/models") });

  const wallet = useQuery({
    queryKey: ["wallet", userId, userToken],
    queryFn: () => api<Wallet>(`/api/billing/wallet?user_id=${encodeURIComponent(userId)}`, { headers: scopedHeaders }),
    enabled: Boolean(userId),
  });

  const estimate = useQuery({
    queryKey: ["estimate", taskType, modelKey, durationSeconds, quality, userId, userToken],
    queryFn: () =>
      api<CostEstimate>("/api/jobs/estimate", {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({
          task_type: taskType,
          model_key: modelKey || null,
          duration_seconds: durationSeconds,
          quality,
          complexity_score: plan?.confidence.visual_risk === "Medium" ? 6 : undefined,
          user_id: userId || null,
        }),
      }),
    enabled: Boolean(userId),
  });

  const activeJob = useQuery({
    queryKey: ["job", activeJobId, userId, userToken],
    queryFn: () => api<Job>(`/api/jobs/${activeJobId}?user_id=${encodeURIComponent(userId)}`, { headers: scopedHeaders }),
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 5000;
    },
  });

  const promptVersion = useQuery({
    queryKey: ["prompt-version", activeJobId, userId, userToken],
    queryFn: () => api<PromptVersion>(`/api/jobs/${activeJobId}/prompt-version?user_id=${encodeURIComponent(userId)}`, { headers: scopedHeaders }),
    enabled: Boolean(activeJobId),
  });

  const compilePlan = useMutation({
    mutationFn: async () => {
      const [nextPlan, preview] = await Promise.all([
        api<AssurancePlan>("/api/assurance/intake", {
          method: "POST",
          headers: scopedHeaders,
          body: JSON.stringify({ raw_idea: idea, user_id: userId, style, mood, platform, pace, realism, audience, product, location, duration_seconds: durationSeconds }),
        }),
        api<ContextPreview>("/api/context/preview", {
          method: "POST",
          headers: scopedHeaders,
          body: JSON.stringify({
            prompt: idea,
            task_type: taskType,
            model_key: modelKey || null,
            user_id: userId,
            duration_seconds: durationSeconds,
            quality,
            options: commonOptions,
          }),
        }),
      ]);
      return { nextPlan, preview };
    },
    onSuccess: ({ nextPlan }) => {
      setPlan(nextPlan);
      setSelectedConcept(nextPlan.concept_options[0]?.id || null);
      setQualityReport(null);
    },
  });

  const confirmPlan = useMutation({
    mutationFn: () =>
      api<AssurancePlan>(`/api/assurance/${plan?.id}/confirm?user_id=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({ selected_concept_id: selectedConcept }),
      }),
    onSuccess: setPlan,
  });

  const createJob = useMutation({
    mutationFn: async () => {
      let inputAssetId: string | undefined;
      if (file) {
        inputAssetId = await uploadAsset(file, userId, userToken);
      }
      return api<Job>("/api/jobs", {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({
          prompt: idea,
          task_type: taskType,
          model_key: modelKey || null,
          user_id: userId,
          input_asset_id: inputAssetId || null,
          options: { ...commonOptions, quality, poll_seconds: 10, max_poll_attempts: 180, seed: -1 },
        }),
      });
    },
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setQualityReport(null);
      jobs.refetch();
      wallet.refetch();
      estimate.refetch();
    },
  });

  const redeemCoupon = useMutation({
    mutationFn: () =>
      api<Wallet>("/api/coupons/redeem", {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({ user_id: userId, code: couponCode }),
      }),
    onSuccess: () => wallet.refetch(),
  });

  const grantCredits = useMutation({
    mutationFn: () =>
      api<Wallet>("/api/admin/billing/grant", {
        method: "POST",
        headers: { "x-saar-admin-key": adminKey },
        body: JSON.stringify({ user_id: userId, amount: adminGrantAmount, reason: "admin dashboard grant" }),
      }),
    onSuccess: () => wallet.refetch(),
  });

  const subscribePlan = useMutation({
    mutationFn: () =>
      api<Wallet>("/api/admin/billing/subscribe", {
        method: "POST",
        headers: { "x-saar-admin-key": adminKey },
        body: JSON.stringify({ user_id: userId, plan_key: adminPlanKey, cycles: 1, payment_reference: "admin-console" }),
      }),
    onSuccess: () => {
      wallet.refetch();
      estimate.refetch();
    },
  });

  const createCoupon = useMutation({
    mutationFn: () =>
      api<Coupon>("/api/admin/coupons", {
        method: "POST",
        headers: { "x-saar-admin-key": adminKey },
        body: JSON.stringify({ code: adminCouponCode, credit_amount: adminCouponCredits, description: "Admin generated token coupon", max_redemptions: 100 }),
      }),
  });

  const generateQa = useMutation({
    mutationFn: () => api<QualityReport>(`/api/jobs/${activeJobId}/quality-report?user_id=${encodeURIComponent(userId)}`, { method: "POST", headers: scopedHeaders }),
    onSuccess: setQualityReport,
  });

  const createRevision = useMutation({
    mutationFn: () =>
      api("/api/revisions", {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({ job_id: activeJobId, user_id: userId, type: "motion", target: { scope: "whole_video" }, instruction: revisionText }),
      }),
  });

  const sendFeedback = useMutation({
    mutationFn: (approved: boolean) =>
      api("/api/feedback", {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({
          job_id: activeJobId,
          user_id: userId,
          approved,
          rating: approved ? 5 : 3,
          approved_patterns: approved ? ["approved concept direction", "stable product framing"] : [],
          rejected_patterns: approved ? [] : [revisionText],
        }),
      }),
  });

  const selectedTask = useMemo(() => TASKS.find((item) => item.value === taskType), [taskType]);
  const availableModels = useMemo(() => (models.data || []).filter((item) => item.task_type === taskType), [models.data, taskType]);
  const fileRequired = taskType === "image_to_video" || taskType === "video_upscale";
  const contextPreview = compilePlan.data?.preview;
  const cost = contextPreview || estimate.data;
  const hasEnoughCredits = cost?.has_enough_credits !== false;
  const active = activeJob.data;
  const serviceError = pricing.error || wallet.error || jobs.error || estimate.error || models.error;
  const canGenerate = Boolean(idea) && Boolean(userId) && hasEnoughCredits && (!fileRequired || Boolean(file)) && !createJob.isPending;

  function refreshWorkspace() {
    jobs.refetch();
    wallet.refetch();
    estimate.refetch();
    pricing.refetch();
    models.refetch();
    if (activeJobId) {
      activeJob.refetch();
      promptVersion.refetch();
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] || null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setFile(event.dataTransfer.files?.[0] || null);
  }

  function loadProject(job: Job) {
    setActiveJobId(job.id);
    setIdea(job.prompt);
    setTaskType(job.task_type);
    setModelKey(job.model_key || "");
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0f172a] text-white">
              <Clapperboard size={18} />
            </div>
            <div>
              <h1 className="text-base font-semibold">Saar</h1>
              <p className="text-xs text-slate-500">AI video production</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-md bg-slate-100 px-3 py-1.5 font-medium">{wallet.data?.balance ?? "--"} tokens</span>
            <button onClick={refreshWorkspace} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-50">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>
      </header>

      {serviceError ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
          API connection needs attention: {(serviceError as Error).message}
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1480px] gap-5 px-5 py-5 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <PreviousProjects jobs={jobs.data || []} activeJobId={activeJobId} onSelect={loadProject} />

        <section className="space-y-5">
          <form onSubmit={(event: FormEvent) => { event.preventDefault(); compilePlan.mutate(); }} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Create</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Describe the video</h2>
              </div>
              <CostChip cost={cost} />
            </div>

            <label className="block">
              <span className="text-sm font-medium">Prompt</span>
              <textarea value={idea} onChange={(event) => setIdea(event.target.value)} required rows={5} className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-3 text-[15px] leading-6 outline-none focus:border-teal focus:ring-2 focus:ring-tealL" />
            </label>

            <label onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-4 hover:border-teal hover:bg-[#eefbf8]">
              <span className="flex min-w-0 items-center gap-3">
                <UploadCloud className="shrink-0 text-teal" size={20} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{file ? file.name : fileRequired ? "Drop the required source file here" : "Drop a reference image, video, or audio file"}</span>
                  <span className="block truncate text-xs text-slate-500">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB attached` : "Drag from your computer or click to browse"}</span>
                </span>
              </span>
              <input type="file" accept="image/*,video/*,audio/*" onChange={onFileChange} className="hidden" />
              <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium">Browse</span>
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <SelectField label="Task" value={taskType} setValue={(value) => { setTaskType(value as TaskType); setModelKey(""); }} options={TASKS.map((item) => item.value)} labels={Object.fromEntries(TASKS.map((item) => [item.value, item.label]))} />
              <SelectField label="Quality" value={quality} setValue={setQuality} options={SELECTORS.quality} />
              <NumberField label="Length" value={durationSeconds} setValue={setDurationSeconds} min={3} max={30} suffix="sec" />
              <SelectField label="Pace" value={pace} setValue={setPace} options={SELECTORS.pace} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <SelectField label="Style" value={style} setValue={setStyle} options={SELECTORS.style} />
              <SelectField label="Platform" value={platform} setValue={setPlatform} options={SELECTORS.platform} />
              <SelectField label="Mood" value={mood} setValue={setMood} options={SELECTORS.mood} />
              <SelectField label="Realism" value={realism} setValue={setRealism} options={SELECTORS.realism} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <TextField label="Audience" value={audience} setValue={setAudience} />
              <TextField label="Hero subject" value={product} setValue={setProduct} />
              <TextField label="Location" value={location} setValue={setLocation} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_160px]">
              <label className="block">
                <span className="text-sm font-medium">Model route</span>
                <select value={modelKey} onChange={(event) => setModelKey(event.target.value)} className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Auto best route</option>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.key}>{model.model_name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">{selectedTask?.hint}</span>
              </label>
              <TextField label="User ID" value={userId} setValue={setUserId} icon={<User size={15} />} />
              <TextField label="Access token" value={userToken} setValue={setUserToken} type="password" icon={<LockKeyhole size={15} />} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button disabled={!idea || compilePlan.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#111827] px-5 text-sm font-semibold text-white disabled:opacity-50">
                <Sparkles size={16} /> {compilePlan.isPending ? "Compiling" : "Compile plan"}
              </button>
              <button type="button" disabled={!canGenerate} onClick={() => createJob.mutate()} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal px-5 text-sm font-semibold text-white disabled:opacity-50">
                <Play size={16} /> {createJob.isPending ? "Submitting" : "Generate"}
              </button>
              {!hasEnoughCredits ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Not enough tokens. Add a plan or redeem a coupon.</p> : null}
            </div>
            {compilePlan.error ? <ErrorText error={compilePlan.error as Error} /> : null}
            {createJob.error ? <ErrorText error={createJob.error as Error} /> : null}
          </form>

          <InlinePlan plan={plan} selectedConcept={selectedConcept} setSelectedConcept={setSelectedConcept} confirmPlan={() => confirmPlan.mutate()} confirmPending={confirmPlan.isPending} preview={contextPreview} />
        </section>

        <aside className="space-y-5">
          <BillingPanel pricing={pricing.data || []} wallet={wallet.data} estimate={cost} couponCode={couponCode} setCouponCode={setCouponCode} redeemCoupon={() => redeemCoupon.mutate()} redeemPending={redeemCoupon.isPending} redeemError={redeemCoupon.error as Error | null} />
          <OutputPanel active={active} promptVersion={promptVersion.data} qualityReport={qualityReport} generateQa={() => generateQa.mutate()} qaPending={generateQa.isPending} revisionText={revisionText} setRevisionText={setRevisionText} createRevision={() => createRevision.mutate()} revisionPending={createRevision.isPending} sendFeedback={sendFeedback.mutate} feedbackPending={sendFeedback.isPending} />
          <AdminPanel adminKey={adminKey} setAdminKey={setAdminKey} adminGrantAmount={adminGrantAmount} setAdminGrantAmount={setAdminGrantAmount} grantCredits={() => grantCredits.mutate()} grantPending={grantCredits.isPending} grantError={grantCredits.error as Error | null} pricing={pricing.data || []} adminPlanKey={adminPlanKey} setAdminPlanKey={setAdminPlanKey} subscribePlan={() => subscribePlan.mutate()} subscribePending={subscribePlan.isPending} subscribeError={subscribePlan.error as Error | null} adminCouponCode={adminCouponCode} setAdminCouponCode={setAdminCouponCode} adminCouponCredits={adminCouponCredits} setAdminCouponCredits={setAdminCouponCredits} createCoupon={() => createCoupon.mutate()} couponPending={createCoupon.isPending} couponError={createCoupon.error as Error | null} createdCoupon={createCoupon.data} />
        </aside>
      </div>
    </main>
  );
}

function PreviousProjects({ jobs, activeJobId, onSelect }: { jobs: Job[]; activeJobId: string | null; onSelect: (job: Job) => void }) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Previous projects</h2>
        <FileVideo size={16} className="text-slate-400" />
      </div>
      <div className="space-y-2">
        {jobs.slice(0, 14).map((job) => (
          <button key={job.id} onClick={() => onSelect(job)} className={`w-full rounded-md border p-3 text-left transition ${activeJobId === job.id ? "border-teal bg-[#eefbf8]" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{job.prompt}</span>
              <StatusPill status={job.status} />
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{job.task_type.replaceAll("_", " ")} • {job.required_credits ?? "--"} tokens</p>
          </button>
        ))}
        {!jobs.length ? <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">No projects yet.</p> : null}
      </div>
    </aside>
  );
}

function CostChip({ cost }: { cost?: CostEstimate | ContextPreview }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <Metric label="Tokens" value={cost ? `${cost.required_credits}` : "--"} />
      <Metric label="GPU" value={cost?.estimated_gpu_seconds ? `${cost.estimated_gpu_seconds}s` : "--"} />
      <Metric label="Ready" value={cost?.has_enough_credits === false ? "No" : "Yes"} />
    </div>
  );
}

function InlinePlan({ plan, selectedConcept, setSelectedConcept, confirmPlan, confirmPending, preview }: { plan: AssurancePlan | null; selectedConcept: string | null; setSelectedConcept: (id: string) => void; confirmPlan: () => void; confirmPending: boolean; preview?: ContextPreview }) {
  if (!plan && !preview) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Compile the plan to see expectation alignment, model instructions, memory rules, and token risk before rendering.
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Review</p>
          <h3 className="mt-1 text-lg font-semibold">Expected outcome</h3>
        </div>
        {plan ? <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">{plan.confidence.expectation_match_score}% match</span> : null}
      </div>
      {plan ? (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            {(plan.expectation_summary.you_want || []).slice(0, 6).map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal" /> {item}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {plan.concept_options.map((concept) => (
              <button key={concept.id} type="button" onClick={() => setSelectedConcept(concept.id)} className={`rounded-md border p-3 text-left ${selectedConcept === concept.id ? "border-teal bg-[#eefbf8]" : "border-slate-200 hover:bg-slate-50"}`}>
                <p className="font-medium">{concept.name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{concept.description}</p>
              </button>
            ))}
          </div>
          <button type="button" onClick={confirmPlan} disabled={confirmPending} className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium disabled:opacity-50">
            <ShieldCheck size={16} /> {plan.status === "confirmed" ? "Route approved" : "Approve route"}
          </button>
        </>
      ) : null}
      {preview ? (
        <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-medium">Generation intelligence packet</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{preview.final_prompt}</p>
          <pre className="mt-3 max-h-72 overflow-auto rounded bg-white p-3 text-xs">{JSON.stringify(preview.generation_packet, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}

function BillingPanel({ pricing, wallet, estimate, couponCode, setCouponCode, redeemCoupon, redeemPending, redeemError }: { pricing: PricingPlan[]; wallet?: Wallet; estimate?: CostEstimate | ContextPreview; couponCode: string; setCouponCode: (value: string) => void; redeemCoupon: () => void; redeemPending: boolean; redeemError: Error | null }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Tokens</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Balance" value={wallet ? `${wallet.balance}` : "--"} />
        <Metric label="Needed" value={estimate ? `${estimate.required_credits}` : "--"} />
      </div>
      <div className="mt-3 flex gap-2">
        <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
        <button onClick={redeemCoupon} disabled={!couponCode || redeemPending} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50">
          <Ticket size={15} /> Redeem
        </button>
      </div>
      {redeemError ? <ErrorText error={redeemError} /> : null}
      <div className="mt-4 space-y-2">
        {pricing.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-slate-500">{item.credits} tokens</p>
            </div>
            <p className="text-sm font-semibold">NPR {item.price_npr.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OutputPanel({ active, promptVersion, qualityReport, generateQa, qaPending, revisionText, setRevisionText, createRevision, revisionPending, sendFeedback, feedbackPending }: { active?: Job; promptVersion?: PromptVersion; qualityReport: QualityReport | null; generateQa: () => void; qaPending: boolean; revisionText: string; setRevisionText: (value: string) => void; createRevision: () => void; revisionPending: boolean; sendFeedback: (approved: boolean) => void; feedbackPending: boolean }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Output</h2>
        {active ? <StatusPill status={active.status} /> : null}
      </div>
      {active ? (
        <div className="space-y-4">
          {active.output_url ? <video src={active.output_url} controls className="aspect-video w-full rounded-md bg-black" /> : <div className="flex aspect-video items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">{active.status === "failed" ? "Generation failed" : "Waiting for output"}</div>}
          {active.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{active.error}</p> : null}
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Model" value={active.model_key || "auto"} />
            <Metric label="Cost" value={active.required_credits != null ? `${active.required_credits}` : "--"} />
            <Metric label="Score" value={active.complexity_score != null ? `${active.complexity_score}` : "--"} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={generateQa} disabled={qaPending || active.status !== "completed"} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium disabled:opacity-50"><ShieldCheck size={15} /> QA</button>
            <button onClick={() => sendFeedback(true)} disabled={feedbackPending} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium"><CheckCircle2 size={15} /> Approve</button>
            <button onClick={() => sendFeedback(false)} disabled={feedbackPending} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium"><FileVideo size={15} /> Learn</button>
          </div>
          {qualityReport ? <QualityPanel report={qualityReport} /> : null}
          <div className="flex gap-2">
            <input value={revisionText} onChange={(event) => setRevisionText(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={createRevision} disabled={revisionPending || !revisionText} className="rounded-md bg-[#111827] px-3 text-sm font-semibold text-white disabled:opacity-50">Save</button>
          </div>
          {promptVersion ? (
            <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium">Final prompt</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{promptVersion.final_prompt}</p>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">Generated videos and QA appear here.</p>
      )}
    </section>
  );
}

function AdminPanel({ adminKey, setAdminKey, adminGrantAmount, setAdminGrantAmount, grantCredits, grantPending, grantError, pricing, adminPlanKey, setAdminPlanKey, subscribePlan, subscribePending, subscribeError, adminCouponCode, setAdminCouponCode, adminCouponCredits, setAdminCouponCredits, createCoupon, couponPending, couponError, createdCoupon }: { adminKey: string; setAdminKey: (value: string) => void; adminGrantAmount: number; setAdminGrantAmount: (value: number) => void; grantCredits: () => void; grantPending: boolean; grantError: Error | null; pricing: PricingPlan[]; adminPlanKey: string; setAdminPlanKey: (value: string) => void; subscribePlan: () => void; subscribePending: boolean; subscribeError: Error | null; adminCouponCode: string; setAdminCouponCode: (value: string) => void; adminCouponCredits: number; setAdminCouponCredits: (value: number) => void; createCoupon: () => void; couponPending: boolean; couponError: Error | null; createdCoupon?: Coupon }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700">Admin</summary>
      <div className="mt-4 space-y-3">
        <TextField label="Admin key" value={adminKey} setValue={setAdminKey} type="password" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input type="number" value={adminGrantAmount} onChange={(event) => setAdminGrantAmount(Number(event.target.value))} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={grantCredits} disabled={grantPending} className="inline-flex items-center gap-2 rounded-md bg-[#111827] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Coins size={15} /> Grant</button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select value={adminPlanKey} onChange={(event) => setAdminPlanKey(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
            {pricing.map((plan) => <option key={plan.id} value={plan.key}>{plan.name} - {plan.credits}</option>)}
          </select>
          <button onClick={subscribePlan} disabled={subscribePending || !adminPlanKey} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50">Add plan</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField label="Coupon" value={adminCouponCode} setValue={setAdminCouponCode} />
          <NumberField label="Tokens" value={adminCouponCredits} setValue={setAdminCouponCredits} min={1} max={10000} />
        </div>
        <button onClick={createCoupon} disabled={couponPending || !adminCouponCode} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 text-sm font-medium disabled:opacity-50"><BadgePercent size={15} /> Create coupon</button>
        {createdCoupon ? <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">{createdCoupon.code} active</p> : null}
        {grantError ? <ErrorText error={grantError} /> : null}
        {subscribeError ? <ErrorText error={subscribeError} /> : null}
        {couponError ? <ErrorText error={couponError} /> : null}
      </div>
    </details>
  );
}

function QualityPanel({ report }: { report: QualityReport }) {
  const rows = [...Object.entries(report.technical_checks), ...Object.entries(report.commercial_checks)];
  return (
    <div className={`rounded-md border p-3 ${report.passed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <p className="text-sm font-medium">{report.passed ? "QA passed" : "QA needs attention"}</p>
      <div className="mt-2 space-y-1">
        {rows.slice(0, 6).map(([key, value]) => (
          <div key={key} className="flex justify-between text-xs"><span>{key.replaceAll("_", " ")}</span><span className="font-medium">{value ? "Pass" : "Fix"}</span></div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function SelectField({ label, value, setValue, options, labels }: { label: string; value: string; setValue: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select value={value} onChange={(event) => setValue(event.target.value)} className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-tealL">
        {options.map((option) => <option key={option} value={option}>{labels?.[option] || option}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, setValue, min, max, suffix }: { label: string; value: number; setValue: (value: number) => void; min: number; max: number; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-2 flex rounded-md border border-slate-200 bg-white focus-within:border-teal focus-within:ring-2 focus-within:ring-tealL">
        <input type="number" min={min} max={max} value={value} onChange={(event) => setValue(Math.max(min, Math.min(max, Number(event.target.value) || min)))} className="min-w-0 flex-1 rounded-md px-3 py-2 text-sm outline-none" />
        {suffix ? <span className="px-3 py-2 text-sm text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function TextField({ label, value, setValue, type = "text", icon }: { label: string; value: string; setValue: (value: string) => void; type?: string; icon?: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-medium">{icon}{label}</span>
      <input type={type} value={value} onChange={(event) => setValue(event.target.value)} className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-tealL" />
    </label>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  const color = status === "completed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : status === "failed" ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-700 ring-amber-200";
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${color}`}>{status}</span>;
}

function ErrorText({ error }: { error: Error }) {
  return <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{error.message}</p>;
}
