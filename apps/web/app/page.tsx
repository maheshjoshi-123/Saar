"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgePercent,
  CheckCircle2,
  ChevronDown,
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
import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  AssurancePlan,
  CostEstimate,
  Coupon,
  Job,
  PricingPlan,
  PromptVersion,
  QualityReport,
  TaskType,
  userHeaders,
  Wallet,
  uploadAsset,
} from "@/lib/api";

const TASKS: { value: TaskType; label: string; hint: string }[] = [
  { value: "fast_preview", label: "Fast preview", hint: "Low-cost draft" },
  { value: "text_to_video_quality", label: "Text to video", hint: "Quality render" },
  { value: "image_to_video", label: "Image to video", hint: "Animate a source image" },
  { value: "premium_quality", label: "Premium quality", hint: "Best visual pass" },
  { value: "video_upscale", label: "Video upscale", hint: "Polish existing video" },
];

const SELECTORS = {
  style: ["Luxury", "Streetwear", "Corporate", "Minimal"],
  mood: ["Aspirational", "Bold", "Calm", "Energetic"],
  platform: ["Facebook Reel", "Instagram Reel", "TikTok", "YouTube Shorts"],
  pace: ["Slow", "Medium", "Fast"],
  realism: ["Natural", "Hyper-real", "Stylised"],
};

type TabKey = "brief" | "review" | "operations";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("brief");
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
  const [userToken, setUserToken] = useState("");
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

  const scopedHeaders = userHeaders(userId, userToken);

  const jobs = useQuery({
    queryKey: ["jobs", userId, userToken],
    queryFn: () => api<Job[]>(`/api/jobs?user_id=${encodeURIComponent(userId)}`, { headers: scopedHeaders }),
    enabled: Boolean(userId),
    refetchInterval: 5000,
  });

  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => api<PricingPlan[]>("/api/pricing/plans"),
  });

  const wallet = useQuery({
    queryKey: ["wallet", userId, userToken],
    queryFn: () => api<Wallet>(`/api/billing/wallet?user_id=${encodeURIComponent(userId)}`, { headers: scopedHeaders }),
    enabled: Boolean(userId),
  });

  const estimate = useQuery({
    queryKey: ["estimate", taskType, userId, userToken],
    queryFn: () =>
      api<CostEstimate>("/api/jobs/estimate", {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({
          task_type: taskType,
          duration_seconds: 6,
          quality: taskType === "premium_quality" ? "premium" : taskType === "fast_preview" ? "preview" : "standard",
          complexity_score: plan?.confidence.visual_risk === "medium" ? 6 : 5,
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

  const createPlan = useMutation({
    mutationFn: () =>
      api<AssurancePlan>("/api/assurance/intake", {
        method: "POST",
        headers: scopedHeaders,
        body: JSON.stringify({ raw_idea: idea, user_id: userId, style, mood, platform, pace, realism, audience, product, location, duration_seconds: 6 }),
      }),
    onSuccess: (nextPlan) => {
      setPlan(nextPlan);
      setSelectedConcept(nextPlan.concept_options[0]?.id || null);
      setQualityReport(null);
      setActiveTab("review");
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
      const path = plan?.status === "confirmed" ? `/api/assurance/${plan.id}/jobs` : "/api/jobs";
      return api<Job>(path, {
        method: "POST",
        headers: scopedHeaders,
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
      setActiveTab("operations");
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

  const createCoupon = useMutation({
    mutationFn: () =>
      api<Coupon>("/api/admin/coupons", {
        method: "POST",
        headers: { "x-saar-admin-key": adminKey },
        body: JSON.stringify({ code: adminCouponCode, credit_amount: adminCouponCredits, description: "Admin generated discount credit coupon", max_redemptions: 100 }),
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
  const assuranceReady = plan?.status === "confirmed";
  const progress = assuranceReady ? 66 : plan ? 40 : 12;
  const serviceError = pricing.error || wallet.error || jobs.error || estimate.error;

  function onAssuranceSubmit(event: FormEvent) {
    event.preventDefault();
    createPlan.mutate();
  }

  function refreshWorkspace() {
    jobs.refetch();
    wallet.refetch();
    estimate.refetch();
    pricing.refetch();
    if (activeJobId) {
      activeJob.refetch();
      promptVersion.refetch();
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white">
              <Clapperboard size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Saar</h1>
              <p className="text-xs text-slate-500">Video production console</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshWorkspace} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-5 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={plan ? "green" : "slate"}>{plan ? "Brief compiled" : "Draft brief"}</StatusBadge>
              <StatusBadge tone={assuranceReady ? "green" : "amber"}>{assuranceReady ? "Route approved" : "Awaiting approval"}</StatusBadge>
              <StatusBadge tone={hasEnoughCredits ? "green" : "red"}>{hasEnoughCredits ? "Credits ready" : "Credits needed"}</StatusBadge>
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight">Create a controlled product video</h2>
            <div className="mt-5 h-2 max-w-2xl overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${currentJob ? 100 : progress}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Balance" value={wallet.data ? `${wallet.data.balance}` : "--"} />
            <Metric label="Cost" value={estimate.data ? `${estimate.data.required_credits}` : "--"} />
            <Metric label="Job" value={currentJob?.status || "none"} />
          </div>
        </div>
      </section>

      {serviceError ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-7xl px-6 py-3 text-sm text-amber-900">
            API connection needs attention: {(serviceError as Error).message}
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl px-6 py-6">
        <nav className="mb-5 flex gap-1 border-b border-slate-200">
          <TabButton active={activeTab === "brief"} onClick={() => setActiveTab("brief")}>Brief</TabButton>
          <TabButton active={activeTab === "review"} onClick={() => setActiveTab("review")}>Review</TabButton>
          <TabButton active={activeTab === "operations"} onClick={() => setActiveTab("operations")}>Operations</TabButton>
        </nav>

        {activeTab === "brief" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">Creative brief</p>
                  <h3 className="mt-1 text-xl font-semibold">Describe the outcome</h3>
                </div>
                <Sparkles className="text-teal" />
              </div>

              <form onSubmit={onAssuranceSubmit} className="space-y-5">
                <label className="block">
                  <span className="text-sm font-medium">Video request</span>
                  <textarea value={idea} onChange={(event) => setIdea(event.target.value)} required rows={6} className="mt-2 w-full resize-none rounded-md border border-slate-200 px-3 py-3 leading-6 outline-none focus:border-teal focus:ring-2 focus:ring-tealL" />
                </label>

                <div className="grid gap-4 md:grid-cols-3">
                  <SelectField label="Style" value={style} setValue={setStyle} options={SELECTORS.style} />
                  <SelectField label="Platform" value={platform} setValue={setPlatform} options={SELECTORS.platform} />
                  <SelectField label="Pace" value={pace} setValue={setPace} options={SELECTORS.pace} />
                </div>

                <details className="rounded-md border border-slate-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
                    Production details <ChevronDown size={16} />
                  </summary>
                  <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2">
                    <SelectField label="Mood" value={mood} setValue={setMood} options={SELECTORS.mood} />
                    <SelectField label="Realism" value={realism} setValue={setRealism} options={SELECTORS.realism} />
                    <TextField label="Audience" value={audience} setValue={setAudience} />
                    <TextField label="Hero subject" value={product} setValue={setProduct} />
                    <TextField label="Location" value={location} setValue={setLocation} />
                    <TextField label="User ID" value={userId} setValue={setUserId} icon={<User size={15} />} />
                    <TextField label="User access token" value={userToken} setValue={setUserToken} type="password" icon={<LockKeyhole size={15} />} />
                  </div>
                </details>

                <div className="flex flex-wrap items-center gap-3">
                  <button disabled={!idea || createPlan.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50">
                    <Sparkles size={16} /> {createPlan.isPending ? "Compiling" : "Compile brief"}
                  </button>
                  {createPlan.error ? <ErrorText error={createPlan.error} /> : null}
                </div>
              </form>
            </section>

            <SidePanel
              pricing={pricing.data || []}
              wallet={wallet.data}
              estimate={estimate.data}
              couponCode={couponCode}
              setCouponCode={setCouponCode}
              redeemCoupon={() => redeemCoupon.mutate()}
              redeemPending={redeemCoupon.isPending}
              redeemError={redeemCoupon.error as Error | null}
            />
          </div>
        ) : null}

        {activeTab === "review" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">Expectation review</p>
                  <h3 className="mt-1 text-xl font-semibold">Approve the route</h3>
                </div>
                <Gauge className="text-teal" />
              </div>
              {plan ? (
                <div className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                    <div className="space-y-2">
                      {(plan.expectation_summary.you_want || []).slice(0, 6).map((item) => (
                        <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal" /> {item}
                        </div>
                      ))}
                    </div>
                    <div className="rounded-md bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase text-slate-500">Match score</p>
                      <p className="mt-2 text-4xl font-semibold">{plan.confidence.expectation_match_score}%</p>
                      <p className="mt-2 text-sm text-slate-500">Risk: {plan.confidence.visual_risk || "pending"}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    {plan.concept_options.map((concept) => (
                      <button key={concept.id} onClick={() => setSelectedConcept(concept.id)} className={`rounded-md border p-4 text-left transition ${selectedConcept === concept.id ? "border-teal bg-tealL" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                        <ConceptGraphic active={selectedConcept === concept.id} />
                        <p className="mt-3 font-semibold">{concept.name}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{concept.description}</p>
                        <p className="mt-3 text-xs text-slate-500">{concept.camera_motion}</p>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button disabled={!selectedConcept || confirmPlan.isPending} onClick={() => confirmPlan.mutate()} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50">
                      <ShieldCheck size={16} /> {plan.status === "confirmed" ? "Route approved" : "Approve route"}
                    </button>
                    <button onClick={() => setActiveTab("brief")} className="inline-flex h-11 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700">
                      Edit brief
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState title="No brief compiled" text="Start with a creative brief to generate route options." />
              )}
            </section>

            <GeneratePanel
              taskType={taskType}
              setTaskType={setTaskType}
              selectedTask={selectedTask}
              file={file}
              setFile={setFile}
              fileRequired={fileRequired}
              canGenerate={canGenerate && (!plan || plan.status === "confirmed")}
              createJob={() => createJob.mutate()}
              pending={createJob.isPending}
              error={createJob.error as Error | null}
              estimate={estimate.data}
              hasEnoughCredits={hasEnoughCredits}
            />
          </div>
        ) : null}

        {activeTab === "operations" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Output control</p>
                  <h3 className="mt-1 text-xl font-semibold">Active job</h3>
                </div>
                {currentJob ? <StatusPill status={currentJob.status} /> : null}
              </div>
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
                <EmptyState title="No active job" text="Generate a video to monitor output and QA." />
              )}
            </section>

            <section className="space-y-4">
              <RecentJobs jobs={jobs.data || []} setActiveJobId={setActiveJobId} />
              <AdminPanel
                adminKey={adminKey}
                setAdminKey={setAdminKey}
                adminGrantAmount={adminGrantAmount}
                setAdminGrantAmount={setAdminGrantAmount}
                grantCredits={() => grantCredits.mutate()}
                grantPending={grantCredits.isPending}
                grantError={grantCredits.error as Error | null}
                adminCouponCode={adminCouponCode}
                setAdminCouponCode={setAdminCouponCode}
                adminCouponCredits={adminCouponCredits}
                setAdminCouponCredits={setAdminCouponCredits}
                createCoupon={() => createCoupon.mutate()}
                couponPending={createCoupon.isPending}
                couponError={createCoupon.error as Error | null}
                createdCoupon={createCoupon.data}
              />
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function SidePanel({
  pricing,
  wallet,
  estimate,
  couponCode,
  setCouponCode,
  redeemCoupon,
  redeemPending,
  redeemError,
}: {
  pricing: PricingPlan[];
  wallet?: Wallet;
  estimate?: CostEstimate;
  couponCode: string;
  setCouponCode: (value: string) => void;
  redeemCoupon: () => void;
  redeemPending: boolean;
  redeemError: Error | null;
}) {
  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm font-medium text-slate-500">Credits</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Balance" value={wallet ? `${wallet.balance}` : "--"} />
          <Metric label="Estimate" value={estimate ? `${estimate.required_credits}` : "--"} />
        </div>
        {estimate?.has_enough_credits === false ? (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Required {estimate.required_credits}, available {estimate.user_balance ?? 0}.</p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={redeemCoupon} disabled={!couponCode || redeemPending} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50">
            <Ticket size={15} /> Redeem
          </button>
        </div>
        {redeemError ? <ErrorText error={redeemError} /> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm font-medium text-slate-500">Plans</p>
        <div className="mt-3 space-y-3">
          {pricing.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-slate-500">{item.credits} credits</p>
              </div>
              <p className="text-sm font-semibold">NPR {item.price_npr.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function GeneratePanel({
  taskType,
  setTaskType,
  selectedTask,
  file,
  setFile,
  fileRequired,
  canGenerate,
  createJob,
  pending,
  error,
  estimate,
  hasEnoughCredits,
}: {
  taskType: TaskType;
  setTaskType: (value: TaskType) => void;
  selectedTask?: { value: TaskType; label: string; hint: string };
  file: File | null;
  setFile: (file: File | null) => void;
  fileRequired: boolean;
  canGenerate: boolean;
  createJob: () => void;
  pending: boolean;
  error: Error | null;
  estimate?: CostEstimate;
  hasEnoughCredits: boolean;
}) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">Render setup</p>
      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Task</span>
          <select value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)} className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
            {TASKS.map((task) => (
              <option key={task.value} value={task.value}>{task.label}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{selectedTask?.hint}</span>
        </label>

        <label className="block rounded-md border border-dashed border-slate-300 p-4">
          <span className="inline-flex items-center gap-2 text-sm font-medium"><UploadCloud size={16} /> {fileRequired ? "Input required" : "Reference file"}</span>
          <input type="file" accept="image/*,video/*,audio/*" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-3 block w-full text-sm" />
          {file ? <span className="mt-2 block text-xs text-slate-500">{file.name}</span> : null}
        </label>

        <div className="rounded-md bg-slate-50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Required credits</span>
            <span className="font-semibold">{estimate?.required_credits ?? "--"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">GPU estimate</span>
            <span className="font-semibold">{estimate?.estimated_gpu_seconds ? `${estimate.estimated_gpu_seconds}s` : "--"}</span>
          </div>
        </div>

        {!hasEnoughCredits ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">Add credits before rendering.</p> : null}

        <button disabled={!canGenerate} onClick={createJob} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Play size={16} /> {pending ? "Submitting" : "Generate video"}
        </button>
        {error ? <ErrorText error={error} /> : null}
      </div>
    </aside>
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
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Task" value={job.task_type.replaceAll("_", " ")} />
        <Metric label="Model" value={job.model_key || "auto"} />
        <Metric label="Complexity" value={job.complexity_score != null ? `${job.complexity_score}` : "--"} />
        <Metric label="Credits" value={job.required_credits != null ? `${job.required_credits}` : "--"} />
        <Metric label="Debited" value={job.debited_credits != null ? `${job.debited_credits}` : "0"} />
      </div>

      {job.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{job.error}</p> : null}

      {job.output_url ? (
        <video src={job.output_url} controls className="aspect-video w-full rounded-md bg-black" />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
          {job.status === "failed" ? "Generation failed" : "Waiting for output"}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={onQa} disabled={qaPending || job.status !== "completed"} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium disabled:opacity-50">
          <ShieldCheck size={16} /> Run QA
        </button>
        <button onClick={() => onFeedback(true)} disabled={feedbackPending} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium">
          <CheckCircle2 size={16} /> Approve
        </button>
        <button onClick={() => onFeedback(false)} disabled={feedbackPending} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium">
          <FileVideo size={16} /> Learn rejection
        </button>
      </div>

      {qualityReport ? <QualityPanel report={qualityReport} /> : null}

      <div className="flex gap-2">
        <input value={revisionText} onChange={(event) => setRevisionText(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
        <button onClick={onRevision} disabled={revisionPending || !revisionText} className="rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">Save</button>
      </div>

      {promptVersion ? (
        <details className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-medium">Prompt packet</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{promptVersion.final_prompt}</p>
          <pre className="mt-3 max-h-80 overflow-auto rounded bg-white p-3 text-xs">{JSON.stringify(promptVersion.generation_packet, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function RecentJobs({ jobs, setActiveJobId }: { jobs: Job[]; setActiveJobId: (id: string) => void }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">Recent jobs</p>
      <div className="mt-3 space-y-2">
        {jobs.slice(0, 6).map((job) => (
          <button key={job.id} onClick={() => setActiveJobId(job.id)} className="w-full rounded-md border border-slate-100 p-3 text-left hover:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{job.prompt}</span>
              <StatusPill status={job.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{job.task_type.replaceAll("_", " ")}</p>
          </button>
        ))}
        {!jobs.length ? <p className="text-sm text-slate-500">No jobs yet.</p> : null}
      </div>
    </section>
  );
}

function AdminPanel({
  adminKey,
  setAdminKey,
  adminGrantAmount,
  setAdminGrantAmount,
  grantCredits,
  grantPending,
  grantError,
  adminCouponCode,
  setAdminCouponCode,
  adminCouponCredits,
  setAdminCouponCredits,
  createCoupon,
  couponPending,
  couponError,
  createdCoupon,
}: {
  adminKey: string;
  setAdminKey: (value: string) => void;
  adminGrantAmount: number;
  setAdminGrantAmount: (value: number) => void;
  grantCredits: () => void;
  grantPending: boolean;
  grantError: Error | null;
  adminCouponCode: string;
  setAdminCouponCode: (value: string) => void;
  adminCouponCredits: number;
  setAdminCouponCredits: (value: number) => void;
  createCoupon: () => void;
  couponPending: boolean;
  couponError: Error | null;
  createdCoupon?: Coupon;
}) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer list-none text-sm font-medium text-slate-600">Admin controls</summary>
      <div className="mt-4 space-y-3">
        <TextField label="Admin UI key" value={adminKey} setValue={setAdminKey} type="password" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input type="number" value={adminGrantAmount} onChange={(event) => setAdminGrantAmount(Number(event.target.value))} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={grantCredits} disabled={grantPending} className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Coins size={15} /> Grant
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField label="Coupon code" value={adminCouponCode} setValue={setAdminCouponCode} />
          <label className="block">
            <span className="text-sm font-medium">Credits</span>
            <input type="number" value={adminCouponCredits} onChange={(event) => setAdminCouponCredits(Number(event.target.value))} className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <button onClick={createCoupon} disabled={couponPending || !adminCouponCode} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 text-sm font-medium disabled:opacity-50">
          <BadgePercent size={15} /> Create coupon
        </button>
        {createdCoupon ? <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">{createdCoupon.code} active</p> : null}
        {grantError ? <ErrorText error={grantError} /> : null}
        {couponError ? <ErrorText error={couponError} /> : null}
      </div>
    </details>
  );
}

function QualityPanel({ report }: { report: QualityReport }) {
  const rows = [
    ...Object.entries(report.technical_checks).map(([key, value]) => [key, value, "Technical"] as const),
    ...Object.entries(report.commercial_checks).map(([key, value]) => [key, value, "Commercial"] as const),
  ];
  return (
    <div className={`rounded-md border p-4 ${report.passed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <p className="font-medium">{report.passed ? "QA passed" : "QA needs attention"}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map(([key, value, group]) => (
          <div key={`${group}-${key}`} className="flex items-center justify-between rounded bg-white/70 px-3 py-2 text-sm">
            <span>{key.replaceAll("_", " ")}</span>
            <span className="font-medium">{value ? "Pass" : "Fix"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function SelectField({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select value={value} onChange={(event) => setValue(event.target.value)} className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-tealL">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, setValue, type = "text", icon }: { label: string; value: string; setValue: (value: string) => void; type?: string; icon?: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-medium">{icon}{label}</span>
      <input type={type} value={value} onChange={(event) => setValue(event.target.value)} className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-tealL" />
    </label>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`border-b-2 px-4 py-3 text-sm font-medium ${active ? "border-teal text-ink" : "border-transparent text-slate-500 hover:text-ink"}`}>
      {children}
    </button>
  );
}

function StatusBadge({ tone, children }: { tone: "green" | "amber" | "red" | "slate"; children: ReactNode }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    slate: "bg-slate-50 text-slate-600 ring-slate-200",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${colors[tone]}`}>{children}</span>;
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

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <FileVideo className="text-slate-400" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>
    </div>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  const color = status === "completed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : status === "failed" ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-700 ring-amber-200";
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${color}`}>{status}</span>;
}

function ErrorText({ error }: { error: Error }) {
  return <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{error.message}</p>;
}
