"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgePercent,
  CheckCircle2,
  ClipboardCheck,
  Clapperboard,
  Coins,
  Gauge,
  ImagePlus,
  Layers3,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  UploadCloud,
  User,
  WandSparkles,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, AssurancePlan, CostEstimate, Coupon, Job, PricingPlan, PromptVersion, QualityReport, TaskType, Wallet, uploadAsset } from "@/lib/api";

const TASKS: { value: TaskType; label: string; hint: string }[] = [
  { value: "text_to_video_quality", label: "Text to Video", hint: "Wan T2V quality generation" },
  { value: "image_to_video", label: "Image to Video", hint: "Wan I2V for animating a source image" },
  { value: "fast_preview", label: "Fast Preview", hint: "LTX fast low-cost draft" },
  { value: "premium_quality", label: "Premium Quality", hint: "Hunyuan/Wan high-quality workflow" },
  { value: "video_upscale", label: "Video Upscale", hint: "Upscale or smooth a generated video" },
];

const SELECTORS = {
  style: ["Luxury", "Streetwear", "Corporate", "Minimal"],
  mood: ["Aspirational", "Bold", "Calm", "Energetic"],
  platform: ["Facebook Reel", "Instagram Reel", "TikTok", "YouTube Shorts"],
  pace: ["Slow", "Medium", "Fast"],
  realism: ["Natural", "Hyper-real", "Stylised"],
};

export default function Home() {
  const [idea, setIdea] = useState("A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once");
  const [style, setStyle] = useState("Luxury");
  const [mood, setMood] = useState("Aspirational");
  const [platform, setPlatform] = useState("Facebook Reel");
  const [pace, setPace] = useState("Slow");
  const [realism, setRealism] = useState("Natural");
  const [audience, setAudience] = useState("young urban Nepalese consumers");
  const [product, setProduct] = useState("warm grey curved-brim cap");
  const [location, setLocation] = useState("Kathmandu rooftop");
  const [taskType, setTaskType] = useState<TaskType>("text_to_video_quality");
  const [userId, setUserId] = useState("demo-user");
  const [couponCode, setCouponCode] = useState("SAAR100");
  const [adminKey, setAdminKey] = useState("");
  const [adminCouponCode, setAdminCouponCode] = useState("SAAR100");
  const [adminCouponCredits, setAdminCouponCredits] = useState(100);
  const [adminGrantAmount, setAdminGrantAmount] = useState(250);
  const [file, setFile] = useState<File | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [plan, setPlan] = useState<AssurancePlan | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [revisionText, setRevisionText] = useState("Make the camera movement slower and keep the cap logo stable");

  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Job[]>("/api/jobs"),
    refetchInterval: 5000,
  });

  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => api<PricingPlan[]>("/api/pricing/plans"),
  });

  const wallet = useQuery({
    queryKey: ["wallet", userId],
    queryFn: () => api<Wallet>(`/api/billing/wallet?user_id=${encodeURIComponent(userId)}`),
    enabled: Boolean(userId),
  });

  const estimate = useQuery({
    queryKey: ["estimate", taskType, userId, plan?.confidence.expectation_match_score],
    queryFn: () =>
      api<CostEstimate>("/api/jobs/estimate", {
        method: "POST",
        body: JSON.stringify({
          task_type: taskType,
          duration_seconds: 6,
          quality: taskType === "premium_quality" ? "premium" : taskType === "fast_preview" ? "preview" : "standard",
          complexity_score: 5,
          user_id: userId || null,
        }),
      }),
    enabled: Boolean(userId),
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

  const createPlan = useMutation({
    mutationFn: () =>
      api<AssurancePlan>("/api/assurance/intake", {
        method: "POST",
        body: JSON.stringify({ raw_idea: idea, user_id: userId, style, mood, platform, pace, realism, audience, product, location, duration_seconds: 6 }),
      }),
    onSuccess: (nextPlan) => {
      setPlan(nextPlan);
      setSelectedConcept(nextPlan.concept_options[0]?.id || null);
      setQualityReport(null);
    },
  });

  const confirmPlan = useMutation({
    mutationFn: () =>
      api<AssurancePlan>(`/api/assurance/${plan?.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ selected_concept_id: selectedConcept }),
      }),
    onSuccess: setPlan,
  });

  const createJob = useMutation({
    mutationFn: async () => {
      let inputAssetId: string | undefined;
      if (file) {
        inputAssetId = await uploadAsset(file, userId);
      }
      const path = plan?.status === "confirmed" ? `/api/assurance/${plan.id}/jobs` : "/api/jobs";
      return api<Job>(path, {
        method: "POST",
        body: JSON.stringify({
          prompt: idea,
          task_type: taskType,
          user_id: userId,
          input_asset_id: inputAssetId || null,
          options: {
            seed: -1,
            poll_seconds: 10,
            max_poll_attempts: 180,
            subject_lock: {
              object: product,
              description: product,
              logo_rule: "front centre logo or embroidery must remain stable and readable",
            },
          },
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

  const createCoupon = useMutation({
    mutationFn: () =>
      api<Coupon>("/api/admin/coupons", {
        method: "POST",
        headers: { "x-saar-admin-key": adminKey },
        body: JSON.stringify({ code: adminCouponCode, credit_amount: adminCouponCredits, description: "Admin generated discount credit coupon", max_redemptions: 100 }),
      }),
  });

  const generateQa = useMutation({
    mutationFn: () => api<QualityReport>(`/api/jobs/${activeJobId}/quality-report`, { method: "POST" }),
    onSuccess: setQualityReport,
  });

  const createRevision = useMutation({
    mutationFn: () =>
      api("/api/revisions", {
        method: "POST",
        body: JSON.stringify({ job_id: activeJobId, type: "motion", target: { scope: "whole_video" }, instruction: revisionText }),
      }),
  });

  const sendFeedback = useMutation({
    mutationFn: (approved: boolean) =>
      api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          job_id: activeJobId,
          approved,
          rating: approved ? 5 : 3,
          approved_patterns: approved ? ["confirmed concept direction", "stable product framing"] : [],
          rejected_patterns: approved ? [] : [revisionText],
        }),
      }),
  });

  const selectedTask = useMemo(() => TASKS.find((item) => item.value === taskType), [taskType]);
  const fileRequired = taskType === "image_to_video" || taskType === "video_upscale";
  const hasEnoughCredits = estimate.data?.has_enough_credits !== false;
  const canGenerate = Boolean(idea) && Boolean(userId) && hasEnoughCredits && (!fileRequired || Boolean(file)) && !createJob.isPending;
  const currentJob = activeJob.data;

  function onAssuranceSubmit(event: FormEvent) {
    event.preventDefault();
    createPlan.mutate();
  }

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white">
                <Clapperboard size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Saar Video Production Factory</h1>
                <p className="mt-1 text-sm text-slate-600">Expectation alignment, generation packets, queued RunPod rendering, QA and revision memory</p>
              </div>
            </div>
          </div>
          <button onClick={() => jobs.refetch()} className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm">
            <RefreshCw size={16} /> Refresh jobs
          </button>
        </div>
      </header>

      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_420px]">
          <div className="grid gap-4 sm:grid-cols-4">
            <Metric icon={<ClipboardCheck size={18} />} label="Assurance" value={plan?.status || "not started"} />
            <Metric icon={<Gauge size={18} />} label="Match score" value={plan?.confidence.expectation_match_score ? `${plan.confidence.expectation_match_score}%` : "pending"} />
            <Metric icon={<ShieldCheck size={18} />} label="Visual risk" value={plan?.confidence.visual_risk || "pending"} />
            <Metric icon={<Layers3 size={18} />} label="Active job" value={currentJob?.status || "none"} />
          </div>
          <div className="rounded-lg border border-line bg-mist p-4">
            <p className="text-sm font-semibold text-ink">Production rule</p>
            <p className="mt-1 text-sm text-slate-600">No final render should start until the user confirms what Saar understood. Use previews, QA, and precise revisions to reduce expensive mismatch.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 xl:grid-cols-[460px_1fr]">
        <section className="space-y-6">
          <WorkflowCard step="1" title="Desire Extraction" icon={<WandSparkles className="text-teal" />}>
            <form onSubmit={onAssuranceSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">User idea</span>
                <textarea value={idea} onChange={(e) => setIdea(e.target.value)} required rows={5} className="mt-2 w-full rounded-md border border-line px-3 py-2" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Style" value={style} setValue={setStyle} options={SELECTORS.style} />
                <Select label="Mood" value={mood} setValue={setMood} options={SELECTORS.mood} />
                <Select label="Platform" value={platform} setValue={setPlatform} options={SELECTORS.platform} />
                <Select label="Pace" value={pace} setValue={setPace} options={SELECTORS.pace} />
                <Select label="Realism" value={realism} setValue={setRealism} options={SELECTORS.realism} />
                <label className="block">
                  <span className="text-sm font-medium">Audience</span>
                  <input value={audience} onChange={(e) => setAudience(e.target.value)} className="mt-2 w-full rounded-md border border-line px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Hero subject</span>
                  <input value={product} onChange={(e) => setProduct(e.target.value)} className="mt-2 w-full rounded-md border border-line px-3 py-2" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Location</span>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-2 w-full rounded-md border border-line px-3 py-2" />
                </label>
              </div>
              <button disabled={!idea || createPlan.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 font-medium text-white disabled:opacity-50">
                <Sparkles size={16} /> {createPlan.isPending ? "Compiling..." : "Compile expectation plan"}
              </button>
              {createPlan.error ? <ErrorText error={createPlan.error} /> : null}
            </form>
          </WorkflowCard>

          <WorkflowCard step="Billing" title="Tokens, Pricing and Coupons" icon={<Coins className="text-teal" />}>
            <div className="space-y-4">
              <label className="block">
                <span className="inline-flex items-center gap-2 text-sm font-medium"><User size={16} /> User ID</span>
                <input value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-2 w-full rounded-md border border-line px-3 py-2" />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <Info label="Token balance" value={wallet.data ? `${wallet.data.balance} credits` : "loading"} />
                <Info label="This generation" value={estimate.data ? `${estimate.data.required_credits} credits` : "pending"} />
                <Info label="GPU estimate" value={estimate.data ? `${estimate.data.estimated_gpu_seconds}s` : "pending"} />
              </div>
              {estimate.data?.has_enough_credits === false ? (
                <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                  Not enough credits. Required {estimate.data.required_credits}, available {estimate.data.user_balance ?? 0}.
                </p>
              ) : (
                <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">This user has enough tokens for the selected generation type.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {(pricing.data || []).map((item) => (
                  <div key={item.id} className="rounded-md border border-line p-3">
                    <p className="font-semibold">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-600">NPR {item.price_npr.toLocaleString()} / {item.credits} credits</p>
                    <p className="mt-1 text-xs text-slate-500">Up to {item.max_video_seconds}s videos</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm" />
                <button onClick={() => redeemCoupon.mutate()} disabled={!couponCode || redeemCoupon.isPending} className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">
                  <Ticket size={16} /> Redeem
                </button>
              </div>
              {redeemCoupon.error ? <ErrorText error={redeemCoupon.error} /> : null}
              <details className="rounded-md border border-line bg-mist p-3">
                <summary className="cursor-pointer text-sm font-medium">Admin pricing controls</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium">Admin UI key</span>
                    <input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">Grant credits</span>
                    <input type="number" value={adminGrantAmount} onChange={(e) => setAdminGrantAmount(Number(e.target.value))} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
                  </label>
                  <button onClick={() => grantCredits.mutate()} disabled={grantCredits.isPending || !userId} className="inline-flex items-end justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                    <Coins size={16} /> Grant
                  </button>
                  <label className="block">
                    <span className="text-xs font-medium">Coupon code</span>
                    <input value={adminCouponCode} onChange={(e) => setAdminCouponCode(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">Coupon credits</span>
                    <input type="number" value={adminCouponCredits} onChange={(e) => setAdminCouponCredits(Number(e.target.value))} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
                  </label>
                  <button onClick={() => createCoupon.mutate()} disabled={createCoupon.isPending || !adminCouponCode} className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50 sm:col-span-2">
                    <BadgePercent size={16} /> Create or update coupon
                  </button>
                </div>
                {grantCredits.error ? <ErrorText error={grantCredits.error} /> : null}
                {createCoupon.error ? <ErrorText error={createCoupon.error} /> : null}
                {createCoupon.data ? <p className="mt-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">Coupon {createCoupon.data.code} is active.</p> : null}
              </details>
            </div>
          </WorkflowCard>

          <WorkflowCard step="4" title="Controlled Generation" icon={<Play className="text-teal" />}>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">Task</span>
                <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)} className="mt-2 w-full rounded-md border border-line px-3 py-2">
                  {TASKS.map((task) => (
                    <option key={task.value} value={task.value}>{task.label}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">{selectedTask?.hint}</span>
              </label>
              <label className="block rounded-md border border-dashed border-line p-4">
                <span className="inline-flex items-center gap-2 text-sm font-medium"><UploadCloud size={16} /> {fileRequired ? "Required input file" : "Optional input file"}</span>
                <input type="file" accept="image/*,video/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-3 block w-full text-sm" />
                {file ? <span className="mt-2 block text-xs text-slate-500">{file.name}</span> : null}
              </label>
              {fileRequired && !file ? <p className="text-sm text-slate-500">This task needs an input file before it can run.</p> : null}
              {plan && plan.status !== "confirmed" ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Confirm the expectation plan before generation.</p> : null}
              <button disabled={!canGenerate || (Boolean(plan) && plan?.status !== "confirmed")} onClick={() => createJob.mutate()} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal px-4 py-3 font-medium text-white disabled:opacity-50">
                <Play size={16} /> {createJob.isPending ? "Submitting..." : "Generate controlled video"}
              </button>
              {createJob.error ? <ErrorText error={createJob.error} /> : null}
            </div>
          </WorkflowCard>
        </section>

        <section className="space-y-6">
          <WorkflowCard step="2" title="Expectation Alignment" icon={<ClipboardCheck className="text-teal" />}>
            {plan ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div>
                  <h3 className="text-sm font-semibold">Saar understood</h3>
                  <ul className="mt-3 space-y-2">
                    {(plan.expectation_summary.you_want || []).map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 text-teal" /> {item}</li>
                    ))}
                  </ul>
                  <h3 className="mt-4 text-sm font-semibold">Must confirm</h3>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(plan.expectation_summary.must_confirm || []).map((item) => (
                      <li key={item} className="rounded-md bg-mist px-3 py-2 text-sm">{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-line p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Confidence</p>
                  <p className="mt-2 text-4xl font-semibold text-ink">{plan.confidence.expectation_match_score}%</p>
                  <p className="mt-2 text-sm text-slate-600">Visual risk: {plan.confidence.visual_risk}</p>
                  <p className="text-sm text-slate-600">Continuity risk: {plan.confidence.continuity_risk}</p>
                  <p className="mt-3 rounded-md bg-mist p-2 text-sm">{plan.confidence.recommendation}</p>
                </div>
              </div>
            ) : (
              <EmptyState icon={<ClipboardCheck />} title="Compile a plan first" text="Saar will translate vague desire into a summary the user can confirm or edit." />
            )}
          </WorkflowCard>

          <WorkflowCard step="3" title="Concept Options and Preview Route" icon={<ImagePlus className="text-teal" />}>
            {plan ? (
              <div className="grid gap-3 lg:grid-cols-3">
                {plan.concept_options.map((concept) => (
                  <button key={concept.id} onClick={() => setSelectedConcept(concept.id)} className={`rounded-lg border p-4 text-left transition ${selectedConcept === concept.id ? "border-teal bg-tealL" : "border-line bg-white hover:bg-mist"}`}>
                    <ConceptGraphic active={selectedConcept === concept.id} />
                    <h3 className="mt-3 font-semibold">{concept.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{concept.description}</p>
                    <dl className="mt-3 space-y-1 text-xs text-slate-500">
                      <div>Lighting: {concept.lighting}</div>
                      <div>Motion: {concept.camera_motion}</div>
                    </dl>
                  </button>
                ))}
                <button disabled={!selectedConcept || confirmPlan.isPending} onClick={() => confirmPlan.mutate()} className="lg:col-span-3 inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 font-medium text-white disabled:opacity-50">
                  <ShieldCheck size={16} /> {plan.status === "confirmed" ? "Expectation confirmed" : "Confirm selected route"}
                </button>
              </div>
            ) : (
              <EmptyState icon={<ImagePlus />} title="No concepts yet" text="Saar will create three routes: urban premium, clean studio, and street lifestyle." />
            )}
          </WorkflowCard>

          <WorkflowCard step="5-7" title="Active Job, QA, Revisions and Memory" icon={<ShieldCheck className="text-teal" />}>
            {currentJob ? (
              <JobDetail
                job={currentJob}
                promptVersion={promptVersion.data}
                qualityReport={qualityReport}
                onQa={() => generateQa.mutate()}
                qaPending={generateQa.isPending}
                revisionText={revisionText}
                setRevisionText={setRevisionText}
                onRevision={() => createRevision.mutate()}
                revisionPending={createRevision.isPending}
                onFeedback={sendFeedback.mutate}
                feedbackPending={sendFeedback.isPending}
              />
            ) : (
              <EmptyState icon={<Clapperboard />} title="No active job" text="Generate a controlled video or select a job from history." />
            )}
          </WorkflowCard>

          <WorkflowCard step="History" title="Recent Jobs" icon={<Layers3 className="text-teal" />}>
            <div className="space-y-3">
              {(jobs.data || []).map((job) => (
                <button key={job.id} onClick={() => { setActiveJobId(job.id); setQualityReport(null); }} className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-md border border-line p-3 text-left hover:bg-mist">
                  <span>
                    <span className="block text-sm font-medium">{job.prompt}</span>
                    <span className="mt-1 block text-xs text-slate-500">{job.task_type} | complexity {job.complexity_score ?? "n/a"}</span>
                  </span>
                  <StatusPill status={job.status} />
                </button>
              ))}
              {!jobs.data?.length ? <p className="text-sm text-slate-500">No jobs yet.</p> : null}
            </div>
          </WorkflowCard>
        </section>
      </div>
    </main>
  );
}

function JobDetail({
  job,
  promptVersion,
  qualityReport,
  onQa,
  qaPending,
  revisionText,
  setRevisionText,
  onRevision,
  revisionPending,
  onFeedback,
  feedbackPending,
}: {
  job: Job;
  promptVersion?: PromptVersion;
  qualityReport: QualityReport | null;
  onQa: () => void;
  qaPending: boolean;
  revisionText: string;
  setRevisionText: (value: string) => void;
  onRevision: () => void;
  revisionPending: boolean;
  onFeedback: (approved: boolean) => void;
  feedbackPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={job.status} />
        <span className="text-xs text-slate-500">{job.id}</span>
      </div>
      <p className="text-sm">{job.prompt}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <Info label="Task" value={job.task_type} />
        <Info label="Model" value={job.model_key || "auto"} />
        <Info label="Complexity" value={job.complexity_score != null ? `${job.complexity_score} / ${job.complexity_decision}` : "pending"} />
        <Info label="Required credits" value={job.required_credits != null ? `${job.required_credits}` : "pending"} />
        <Info label="Debited credits" value={job.debited_credits != null ? `${job.debited_credits}` : "not debited"} />
      </dl>
      {job.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{job.error}</p> : null}
      {job.output_url ? (
        <video src={job.output_url} controls className="aspect-video w-full rounded-md bg-black" />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md border border-line bg-mist text-sm text-slate-500">
          {job.status === "failed" ? "Generation failed" : "Waiting for output..."}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <button onClick={onQa} disabled={qaPending || job.status !== "completed"} className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">
          <ShieldCheck size={16} /> Run QA
        </button>
        <button onClick={() => onFeedback(true)} disabled={feedbackPending || !job.id} className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
          <CheckCircle2 size={16} /> Approve
        </button>
        <button onClick={() => onFeedback(false)} disabled={feedbackPending || !job.id} className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
          <AlertTriangle size={16} /> Learn rejection
        </button>
      </div>
      {qualityReport ? <QualityPanel report={qualityReport} /> : null}
      <div className="rounded-md border border-line p-3">
        <label className="block text-sm font-medium">Precision revision</label>
        <div className="mt-2 flex gap-2">
          <input value={revisionText} onChange={(e) => setRevisionText(e.target.value)} className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm" />
          <button onClick={onRevision} disabled={revisionPending || !revisionText} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Save</button>
        </div>
      </div>
      {promptVersion ? (
        <details className="rounded-md border border-line bg-mist p-3">
          <summary className="cursor-pointer text-sm font-medium">Generation packet and final prompt</summary>
          <p className="mt-3 text-xs font-semibold text-slate-600">Final model prompt</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{promptVersion.final_prompt}</p>
          <p className="mt-3 text-xs font-semibold text-slate-600">Packet JSON</p>
          <pre className="mt-1 max-h-80 overflow-auto rounded bg-white p-3 text-xs">{JSON.stringify(promptVersion.generation_packet, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function WorkflowCard({ step, title, icon, children }: { step: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-mist">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{step}</p>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs uppercase tracking-wide">{label}</span></div>
      <p className="mt-2 truncate text-lg font-semibold">{value}</p>
    </div>
  );
}

function Select({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="mt-2 w-full rounded-md border border-line px-3 py-2">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ConceptGraphic({ active }: { active: boolean }) {
  return (
    <div className={`relative h-24 overflow-hidden rounded-md ${active ? "bg-teal" : "bg-ink"}`}>
      <div className="absolute inset-x-4 bottom-3 h-3 rounded-full bg-white/30" />
      <div className="absolute left-6 top-5 h-14 w-14 rounded-full border-4 border-white/80" />
      <div className="absolute right-5 top-4 h-16 w-10 rounded-md bg-white/70" />
      <div className="absolute left-24 top-8 h-2 w-20 rounded bg-saffron" />
    </div>
  );
}

function QualityPanel({ report }: { report: QualityReport }) {
  const rows = [
    ...Object.entries(report.technical_checks).map(([key, value]) => [key, value, "Technical"] as const),
    ...Object.entries(report.commercial_checks).map(([key, value]) => [key, value, "Commercial"] as const),
  ];
  return (
    <div className={`rounded-md border p-3 ${report.passed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <p className="font-medium">{report.passed ? "QA passed" : "QA needs attention"}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([key, value, group]) => (
          <div key={`${group}-${key}`} className="flex items-center justify-between rounded bg-white/70 px-3 py-2 text-sm">
            <span>{key.replaceAll("_", " ")}</span>
            <span>{value ? "Pass" : "Fix"}</span>
          </div>
        ))}
      </div>
      {report.recommendations.length ? <ul className="mt-3 list-disc pl-5 text-sm">{report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-line bg-mist p-6 text-center">
      <div className="text-slate-400">{icon}</div>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>
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

function ErrorText({ error }: { error: Error }) {
  return <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error.message}</p>;
}
