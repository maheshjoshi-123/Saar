"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  Edit3,
  FileImage,
  FileText,
  FileVideo,
  Film,
  ImagePlus,
  LogIn,
  LogOut,
  Paperclip,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  User,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api, AuthSession, IntelligencePacket, Job, PricingPlan, userHeaders, Wallet } from "@/lib/api";

type RouteMode = "direct" | "plan";
type SimpleTask = "text_to_video_quality" | "image_to_video";
type RouteType = "direct_video" | "generate_plan";
type ItemStatus = "draft" | "needs_revision" | "approved" | "locked" | "revised";

type ScenePlan = {
  id: string;
  title: string;
  duration: string;
  action: string;
  camera: string;
  referencePrompt: string;
  status: ItemStatus;
};

type Keyframe = {
  keyframe_id: string;
  scene_id: string;
  timestamp: string;
  description: string;
  image_prompt: string;
  negative_prompt: string;
  status: ItemStatus;
  image_path: string;
  history: Array<Record<string, unknown>>;
};

type Attachment = {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
};

type UserSession = {
  userId: string;
  userToken: string;
  name?: string | null;
};

type ProjectHistoryItem = {
  id: string;
  title: string;
  route: RouteMode;
  prompt: string;
  status: string;
  createdAt: string;
  packet: Record<string, unknown> | null;
  scenes: ScenePlan[];
  keyframes: Keyframe[];
};

const PREF_KEY = "saar_generation_preferences_v2";
const AUTH_KEY = "saar_demo_auth_session_v1";
const PROJECT_HISTORY_KEY = "saar_project_history_v1";
const INITIAL_PROMPT = "Make a premium Facebook Reel ad for a warm grey curved-brim cap on a Kathmandu rooftop.";

const OPTIONS = {
  task: [
    { value: "text_to_video_quality", label: "Text to video" },
    { value: "image_to_video", label: "Image to video" },
  ],
  platform: ["Facebook Reel", "Instagram Reel", "TikTok", "YouTube Shorts"],
  length: [6, 10, 15],
  style: ["Luxury", "Streetwear", "Minimal", "Cinematic", "Product-focused"],
  pace: ["Slow", "Medium", "Fast"],
  realism: ["Natural", "Hyper-real", "Stylised"],
};

export default function Home() {
  const [route, setRoute] = useState<RouteMode>("plan");
  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [taskType, setTaskType] = useState<SimpleTask>("text_to_video_quality");
  const [durationSeconds, setDurationSeconds] = useState(6);
  const [platform, setPlatform] = useState("Facebook Reel");
  const [style, setStyle] = useState("Luxury");
  const [pace, setPace] = useState("Slow");
  const [realism, setRealism] = useState("Natural");
  const [audience, setAudience] = useState("young urban Nepalese consumers");
  const [heroSubject, setHeroSubject] = useState("warm grey curved-brim cap");
  const [location, setLocation] = useState("Kathmandu rooftop");
  const [quality] = useState("standard");
  const [session, setSession] = useState<UserSession>({ userId: "demo-user", userToken: "", name: "Demo user" });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [planEditOpen, setPlanEditOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState<"login" | "signup" | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);
  const [scenes, setScenes] = useState<ScenePlan[]>([]);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [packetResult, setPacketResult] = useState<IntelligencePacket | null>(null);
  const [approvedPacket, setApprovedPacket] = useState<Record<string, unknown> | null>(null);
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryItem[]>([]);
  const [fullPlanText, setFullPlanText] = useState("");
  const [revisionDraft, setRevisionDraft] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const userId = session.userId;
  const userToken = session.userToken;
  const headers = userHeaders(userId, userToken);
  const backendSettings = useMemo(
    () => ({
      style,
      platform,
      pace,
      realism,
      audience: audience || undefined,
      product: heroSubject || undefined,
      hero_subject: heroSubject || undefined,
      location: location || undefined,
      duration: `${durationSeconds} seconds`,
      duration_seconds: durationSeconds,
      task_type: taskType,
      quality,
      attachments: attachments.map((item) => ({ name: item.name, type: item.type, size: item.size })),
      subject_lock: {
        object: heroSubject || "main subject",
        description: heroSubject || "main subject",
        logo_rule: "logos, embroidery, marks, and product details must remain stable and readable",
        colour_rule: "preserve product and reference colours exactly",
        shape_constraints: ["subject silhouette must not morph", "hero subject remains visible and stable"],
      },
    }),
    [attachments, audience, durationSeconds, heroSubject, location, pace, platform, quality, realism, style, taskType],
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}") as Partial<{
        durationSeconds: number;
        platform: string;
        style: string;
        pace: string;
        realism: string;
        audience: string;
        heroSubject: string;
        location: string;
      }>;
      if (saved.durationSeconds) setDurationSeconds(saved.durationSeconds);
      if (saved.platform) setPlatform(saved.platform);
      if (saved.style) setStyle(saved.style);
      if (saved.pace) setPace(saved.pace);
      if (saved.realism) setRealism(saved.realism);
      if (saved.audience) setAudience(saved.audience);
      if (saved.heroSubject) setHeroSubject(saved.heroSubject);
      if (saved.location) setLocation(saved.location);
    } catch {
      // Preferences are helpful, not required.
    }
  }, []);

  useEffect(() => {
    try {
      const savedSession = JSON.parse(localStorage.getItem(AUTH_KEY) || "null") as UserSession | null;
      if (savedSession?.userId) setSession(savedSession);
      const savedProjects = JSON.parse(localStorage.getItem(PROJECT_HISTORY_KEY) || "[]") as ProjectHistoryItem[];
      if (Array.isArray(savedProjects)) setProjectHistory(savedProjects.slice(0, 12));
    } catch {
      // Local app state should never block generation.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ durationSeconds, platform, style, pace, realism, audience, heroSubject, location }));
    } catch {
      // Local preference storage can fail in private browsing.
    }
  }, [audience, durationSeconds, heroSubject, location, pace, platform, realism, style]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    } catch {
      // Non-critical local auth cache.
    }
  }, [session]);

  useEffect(() => {
    try {
      localStorage.setItem(PROJECT_HISTORY_KEY, JSON.stringify(projectHistory.slice(0, 12)));
    } catch {
      // Non-critical project shortcuts.
    }
  }, [projectHistory]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const wallet = useQuery({
    queryKey: ["wallet", userId, userToken],
    queryFn: () => api<Wallet>(`/api/billing/wallet?user_id=${encodeURIComponent(userId)}`, { headers }),
    enabled: Boolean(userId),
  });

  const plans = useQuery({
    queryKey: ["pricing-plans"],
    queryFn: () => api<PricingPlan[]>("/api/pricing/plans"),
  });

  const jobs = useQuery({
    queryKey: ["jobs", userId, userToken],
    queryFn: () => api<Job[]>(`/api/jobs?user_id=${encodeURIComponent(userId)}`, { headers }),
    enabled: Boolean(userId),
  });

  const buildMutation = useMutation({
    mutationFn: (input: { routeName: RouteType; scenePlan?: ScenePlan[]; keyframePlan?: Keyframe[]; editSceneId?: string; scenePatch?: Record<string, unknown>; editKeyframeId?: string; keyframePatch?: Record<string, unknown>; chargeCredits?: boolean }) =>
      buildPacket(input.routeName, input.scenePlan ?? scenes, input.keyframePlan ?? keyframes, input.editSceneId, input.scenePatch, input.editKeyframeId, input.keyframePatch, input.chargeCredits ?? true),
    onSuccess: (result) => {
      receivePacket(result);
      wallet.refetch();
    },
  });

  const authMutation = useMutation({
    mutationFn: (input: { mode: "login" | "signup"; userId: string; name?: string }) =>
      api<AuthSession>("/api/auth/demo", {
        method: "POST",
        body: JSON.stringify({ user_id: input.userId, name: input.name || null, mode: input.mode }),
      }),
    onSuccess: (result) => {
      setSession({ userId: result.user_id, userToken: result.token || "", name: result.name || result.user_id });
      setAuthOpen(null);
      wallet.refetch();
      jobs.refetch();
      setToast("Signed in");
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (planKey: string) =>
      api<Wallet>("/api/billing/subscribe", {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: userId, plan_key: planKey, cycles: 1, payment_reference: "local-ui-mock-checkout" }),
      }),
    onSuccess: () => {
      wallet.refetch();
      setToast("Tokens added");
    },
  });

  const couponMutation = useMutation({
    mutationFn: (code: string) =>
      api<Wallet>("/api/coupons/redeem", {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: userId, code: code.trim().toUpperCase(), purchase_credits: 0 }),
      }),
    onSuccess: () => {
      wallet.refetch();
      setCouponCode("");
      setCouponOpen(false);
      setToast("Coupon redeemed!");
    },
  });

  async function buildPacket(
    routeName: "direct_video" | "generate_plan",
    scenePlan: ScenePlan[] = scenes,
    keyframePlan: Keyframe[] = keyframes,
    editSceneId?: string,
    scenePatch?: Record<string, unknown>,
    editKeyframeId?: string,
    keyframePatch?: Record<string, unknown>,
    chargeCredits = true,
  ) {
    return api<IntelligencePacket>("/api/intelligence/packet", {
      method: "POST",
      headers,
      body: JSON.stringify({
        route: routeName,
        raw_prompt: prompt,
        user_id: userId || null,
        settings: backendSettings,
        scene_plan: scenePlan.map(sceneToApi),
        keyframes: keyframePlan.map(keyframeToApi),
        edit_scene_id: editSceneId || null,
        scene_patch: scenePatch || {},
        edit_keyframe_id: editKeyframeId || null,
        keyframe_patch: keyframePatch || {},
        charge_credits: chargeCredits,
      }),
    });
  }

  function receivePacket(result: IntelligencePacket) {
    const nextScenes = normalizeScenes(result.scene_plan);
    const nextKeyframes = normalizeKeyframes(result.keyframes);
    const packet = result.packet || {};
    setPacketResult(result);
    setScenes(nextScenes);
    setKeyframes(nextKeyframes);
    setFullPlanText(renderPlanText(nextScenes));
    setApprovedPacket(null);
    setProjectHistory((current) => {
      const item: ProjectHistoryItem = {
        id: createSafeId(),
        title: prompt.trim().slice(0, 72) || "Untitled video project",
        route,
        prompt,
        status: result.quality_gate?.passed ? "Ready" : "Review",
        createdAt: new Date().toISOString(),
        packet,
        scenes: nextScenes,
        keyframes: nextKeyframes,
      };
      return [item, ...current.filter((existing) => existing.prompt !== prompt.trim())].slice(0, 12);
    });
  }

  function openProject(item: ProjectHistoryItem) {
    setPrompt(item.prompt);
    setRoute(item.route);
    setScenes(item.scenes);
    setKeyframes(item.keyframes);
    setApprovedPacket(null);
    setPacketResult({
      packet: item.packet || {},
      quality_gate: { passed: item.status === "Ready", checks: {}, recommendations: [] },
      scene_plan: item.scenes.map(sceneToApi),
      reference_images: [],
      keyframes: item.keyframes.map(keyframeToApi),
      final_video_prompt: asString(item.packet?.final_video_prompt),
      required_credits: 0,
      debited_credits: 0,
      user_balance: balance,
    });
    setToast("Project opened");
  }

  function logout() {
    setSession({ userId: "demo-user", userToken: "", name: "Demo user" });
    setToast("Logged out");
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!prompt.trim()) return;
    setApprovedPacket(null);
    buildMutation.mutate({ routeName: route === "direct" ? "direct_video" : "generate_plan", scenePlan: route === "plan" ? [] : scenes, keyframePlan: route === "plan" ? [] : keyframes });
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => ({
      id: createSafeId(),
      file,
      name: file.name,
      type: file.type || inferFileType(file.name),
      size: file.size,
    }));
    setAttachments((current) => [...current, ...next]);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  function updateScene(sceneId: string, patch: Partial<ScenePlan>) {
    const nextScenes = scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch, status: patch.status || "revised" } : scene));
    setScenes(nextScenes);
    setFullPlanText(renderPlanText(nextScenes));
    if (isStatusOnlyPatch(patch)) return;
    buildMutation.mutate({ routeName: "generate_plan", scenePlan: nextScenes, keyframePlan: keyframes, editSceneId: sceneId, scenePatch: scenePatchToApi(patch) });
  }

  function updateKeyframe(keyframeId: string, patch: Partial<Keyframe>) {
    const nextKeyframes = keyframes.map((item) => (item.keyframe_id === keyframeId ? { ...item, ...patch, status: patch.status || "revised" } : item));
    setKeyframes(nextKeyframes);
    if (isStatusOnlyPatch(patch)) return;
    buildMutation.mutate({ routeName: "generate_plan", scenePlan: scenes, keyframePlan: nextKeyframes, editKeyframeId: keyframeId, keyframePatch: keyframePatchToApi(patch) });
  }

  function applyFullPlanEdit() {
    const parsed = parsePlanText(fullPlanText, scenes);
    setScenes(parsed);
    setPlanEditOpen(false);
    setKeyframes([]);
    buildMutation.mutate({ routeName: "generate_plan", scenePlan: parsed, keyframePlan: [] });
  }

  async function approveAll() {
    if (keyframes.some((item) => item.status === "needs_revision")) return;
    const nextScenes = scenes.map((scene) => ({ ...scene, status: "approved" as ItemStatus }));
    const nextKeyframes = keyframes.map((keyframe) => ({ ...keyframe, status: "approved" as ItemStatus }));
    setScenes(nextScenes);
    setKeyframes(nextKeyframes);
    try {
      const finalPacket = await buildPacket("generate_plan", nextScenes, nextKeyframes, undefined, undefined, undefined, undefined, false);
      setPacketResult(finalPacket);
      setApprovedPacket(buildApprovedExport(finalPacket.packet, nextScenes, nextKeyframes));
      setToast("Final packet ready");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Approval failed");
    }
  }

  function copyPacket(packet: Record<string, unknown> | null) {
    if (!packet) return;
    const text = JSON.stringify(packet, null, 2);
    navigator.clipboard?.writeText(text).then(() => setToast("Copied")).catch(() => {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      setToast("Copied");
    });
  }

  const busy = buildMutation.isPending;
  const expectedTokens = estimateIntelligenceCredits(route, durationSeconds, scenes.length, keyframes.length);
  const balance = wallet.data?.balance ?? 0;
  const lowTokens = Boolean(wallet.data && balance < expectedTokens);
  const finalPacketReady = Boolean(approvedPacket);
  const pricingPlans = plans.data || [];
  const recentJobs = jobs.data || [];

  return (
    <main className="min-h-screen overflow-hidden bg-[#070b12] text-white" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(124,58,237,.18),transparent_34%),radial-gradient(circle_at_90%_85%,rgba(14,165,233,.12),transparent_38%)]" />
      <Header session={session} balance={balance} expectedTokens={expectedTokens} lowTokens={lowTokens} onPlans={() => setPlansOpen(true)} onLogin={() => setAuthOpen("login")} onSignup={() => setAuthOpen("signup")} onLogout={logout} onSettings={() => setSettingsOpen(true)} onPersona={() => setPersonaOpen(true)} />

      <section className="relative mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <ProjectSidebar projects={projectHistory} jobs={recentJobs} activePrompt={prompt} onOpenProject={openProject} onNew={() => { setPacketResult(null); setApprovedPacket(null); setPrompt(""); setScenes([]); setKeyframes([]); }} onPlans={() => setPlansOpen(true)} />

        <div className="flex min-h-[calc(100vh-105px)] flex-col">
          <div className="flex-1 overflow-y-auto pb-5">
            {!packetResult ? <EmptyState /> : <OutputPanel route={route} scenes={scenes} keyframes={keyframes} packet={approvedPacket || packetResult.packet} packetResult={packetResult} allReady={finalPacketReady} revisionDraft={revisionDraft} setRevisionDraft={setRevisionDraft} updateScene={updateScene} updateKeyframe={updateKeyframe} setPlanEditOpen={setPlanEditOpen} approveAll={approveAll} copyPacket={copyPacket} />}
          </div>

          <form onSubmit={submit} className="sticky bottom-4 rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-2 overflow-x-auto border-b border-white/5 px-4 py-3">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">Balanced</span>
              <Chip>{taskType === "image_to_video" ? "Image to video" : "Text to video"}</Chip>
              <Chip>{platform}</Chip>
              <Chip>{durationSeconds} sec</Chip>
              <Chip>{style}</Chip>
              <Chip>{pace}</Chip>
              <Chip>{realism}</Chip>
              <button type="button" onClick={() => setSettingsOpen(true)} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                <Settings size={13} /> Edit
              </button>
            </div>

            {attachments.length ? (
              <div className="flex gap-2 overflow-x-auto px-4 pt-3">
                {attachments.map((item) => <AttachmentPill key={item.id} item={item} remove={() => setAttachments((current) => current.filter((file) => file.id !== item.id))} />)}
              </div>
            ) : null}

            <div className="px-4 py-3">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onComposerKey} rows={3} className="max-h-36 w-full resize-none border-0 bg-transparent text-[15px] leading-7 text-white outline-none placeholder:text-slate-700" placeholder="Describe the video. Drop images, videos, PDFs, docs, sheets, or any reference file here." />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-white/15 p-3 text-slate-400 hover:bg-white/10 hover:text-white" title="Attach files">
                  <Paperclip size={18} />
                </button>
                <button type="button" onClick={() => { setTaskType("image_to_video"); fileInputRef.current?.click(); }} className="rounded-xl border border-white/15 p-3 text-slate-400 hover:bg-white/10 hover:text-white" title="Attach image">
                  <ImagePlus size={18} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <RouteButton active={route === "plan"} onClick={() => setRoute("plan")} icon={<Film size={16} />} label="Generate plan" cost={expectedTokens} />
                <RouteButton active={route === "direct"} onClick={() => setRoute("direct")} icon={<Wand2 size={16} />} label="Direct video" cost={expectedTokens} />
                <button type="submit" disabled={busy || lowTokens || !prompt.trim()} className="ml-auto inline-flex h-12 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50">
                  {busy ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  {busy ? "Processing..." : "Generate"}
                </button>
              </div>
            </div>
            {buildMutation.error ? <p className="mx-4 mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{(buildMutation.error as Error).message}</p> : null}
            {lowTokens ? <p className="mx-4 mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">Not enough tokens for this action. Add tokens or upgrade your tier.</p> : null}
            <p className="pb-3 text-center text-xs text-slate-700">Cmd+Enter to generate - packets prepared for future AI video generators</p>
          </form>
        </div>
      </section>

      {settingsOpen ? <SettingsModal close={() => setSettingsOpen(false)} taskType={taskType} setTaskType={setTaskType} durationSeconds={durationSeconds} setDurationSeconds={setDurationSeconds} platform={platform} setPlatform={setPlatform} style={style} setStyle={setStyle} pace={pace} setPace={setPace} realism={realism} setRealism={setRealism} audience={audience} setAudience={setAudience} heroSubject={heroSubject} setHeroSubject={setHeroSubject} location={location} setLocation={setLocation} /> : null}
      {personaOpen ? <PersonaModal close={() => setPersonaOpen(false)} /> : null}
      {planEditOpen ? <PlanModal text={fullPlanText} setText={setFullPlanText} close={() => setPlanEditOpen(false)} apply={applyFullPlanEdit} /> : null}
      {authOpen ? <AuthModal mode={authOpen} close={() => setAuthOpen(null)} submit={(input) => authMutation.mutate(input)} pending={authMutation.isPending} error={authMutation.error as Error | null} /> : null}
      {plansOpen ? <PlansModal close={() => setPlansOpen(false)} plans={pricingPlans} balance={balance} pendingPlanKey={subscribeMutation.variables} isPending={subscribeMutation.isPending} error={subscribeMutation.error as Error | null} subscribe={(planKey) => subscribeMutation.mutate(planKey)} onCoupon={() => setCouponOpen(true)} /> : null}
      {couponOpen ? <CouponModal close={() => setCouponOpen(false)} couponCode={couponCode} setCouponCode={setCouponCode} isPending={couponMutation.isPending} error={couponMutation.error as Error | null} redeem={() => couponMutation.mutate(couponCode)} /> : null}
      {toast ? <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-xl"><Check size={14} /> {toast}</div> : null}
    </main>
  );
}

function Header({ session, balance, expectedTokens, lowTokens, onSettings, onPersona, onPlans, onLogin, onSignup, onLogout }: { session: UserSession; balance: number; expectedTokens: number; lowTokens: boolean; onSettings: () => void; onPersona: () => void; onPlans: () => void; onLogin: () => void; onSignup: () => void; onLogout: () => void }) {
  const pct = balance ? Math.min(100, Math.round((balance / Math.max(balance, expectedTokens)) * 100)) : 0;
  const signedIn = session.userId !== "demo-user" || Boolean(session.userToken);
  return (
    <header className="relative z-20 border-b border-white/10 bg-[#0d1117]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-950/40">
            <Wand2 size={19} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">Saar</h1>
            <p className="mt-1 text-xs text-slate-500">AI video prep studio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPlans} className={`hidden rounded-2xl border px-4 py-2 text-left text-xs sm:block ${lowTokens ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-white/5"}`}>
            <span className={lowTokens ? "text-amber-400" : "text-slate-500"}>{lowTokens ? "Low tokens" : "Tokens"}</span>
            <div className="mt-0.5 flex items-center gap-2"><b className="text-white">{balance.toLocaleString()}</b><span className="text-slate-600">need {expectedTokens}</span></div>
            <div className="mt-2 h-1 w-28 rounded-full bg-white/10"><div className={lowTokens ? "h-1 rounded-full bg-amber-400" : "h-1 rounded-full bg-violet-500"} style={{ width: `${pct}%` }} /></div>
          </button>
          <button onClick={onPersona} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-white/10"><User className="mr-2 inline" size={16} />Persona</button>
          <button onClick={onSettings} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-white/10"><Settings className="mr-2 inline" size={16} />Settings</button>
          <button onClick={onPlans} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500"><Plus className="mr-2 inline" size={16} />Tokens</button>
          {signedIn ? (
            <button onClick={onLogout} className="inline-flex rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-medium text-slate-200 hover:bg-white/10 md:px-4"><LogOut className="mr-2" size={16} />Logout</button>
          ) : (
            <>
              <button onClick={onLogin} className="inline-flex rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-medium text-slate-200 hover:bg-white/10 md:px-4"><LogIn className="mr-2" size={16} />Login</button>
              <button onClick={onSignup} className="inline-flex rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-medium text-slate-200 hover:bg-white/10 md:px-4"><UserPlus className="mr-2" size={16} />Sign up</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ProjectSidebar({ projects, jobs, activePrompt, onOpenProject, onNew, onPlans }: { projects: ProjectHistoryItem[]; jobs: Job[]; activePrompt: string; onOpenProject: (item: ProjectHistoryItem) => void; onNew: () => void; onPlans: () => void }) {
  return (
    <aside className="min-h-0 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Workspace</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-200">Projects</h2>
        </div>
        <button onClick={onNew} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="New project">
          <Plus size={15} />
        </button>
      </div>

      <button onClick={onPlans} className="mb-4 flex w-full items-center justify-between rounded-xl border border-violet-500/20 bg-violet-600/10 px-3 py-3 text-left hover:bg-violet-600/20">
        <span>
          <span className="block text-sm font-semibold text-violet-100">Upgrade or add tokens</span>
          <span className="mt-1 block text-xs text-violet-200/55">Choose Starter, Creator, or Studio</span>
        </span>
        <ChevronRight className="text-violet-300" size={16} />
      </button>

      <div className="space-y-2">
        <SectionLabel>Past projects</SectionLabel>
        {projects.length ? projects.map((project) => (
          <button key={project.id} onClick={() => onOpenProject(project)} className={`w-full rounded-xl border p-3 text-left transition ${project.prompt === activePrompt ? "border-violet-500/40 bg-violet-600/15" : "border-white/10 bg-white/[.03] hover:bg-white/[.06]"}`}>
            <span className="line-clamp-2 text-sm font-medium text-slate-200">{project.title}</span>
            <span className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
              <span>{project.route === "plan" ? "Plan" : "Prompt"}</span>
              <span>{project.status}</span>
            </span>
          </button>
        )) : <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs leading-5 text-slate-600">Generated plans and prompt packets will appear here.</p>}
      </div>

      <div className="mt-5 space-y-2">
        <SectionLabel>Past videos</SectionLabel>
        {jobs.length ? jobs.slice(0, 6).map((job) => (
          <div key={job.id} className="rounded-xl border border-white/10 bg-white/[.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-slate-300">{job.output_url ? "Video ready" : job.task_type.replaceAll("_", " ")}</span>
              <StatusBadge status={job.status === "completed" ? "approved" : job.status === "failed" ? "needs_revision" : "draft"} />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{job.prompt}</p>
          </div>
        )) : <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs leading-5 text-slate-600">Rendered videos will appear here after the generator is connected.</p>}
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[48vh] flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-violet-500/30 bg-violet-600/20">
        <Film className="h-9 w-9 text-violet-300" />
      </div>
      <h2 className="text-3xl font-semibold tracking-tight">Ready to generate</h2>
      <p className="mt-4 max-w-xl text-lg leading-8 text-slate-500">Describe your concept below. Choose Direct video for a quick optimized packet, or Generate plan for a detailed visual script with scene-by-scene breakdowns, images, and descriptions.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {["Text to video", "Image to video", "Scene planning", "Reference keyframes"].map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/[.03] px-4 py-2 text-sm text-slate-500">{item}</span>)}
      </div>
    </div>
  );
}

function OutputPanel(props: {
  route: RouteMode;
  scenes: ScenePlan[];
  keyframes: Keyframe[];
  packet: Record<string, unknown> | null;
  packetResult: IntelligencePacket | null;
  allReady: boolean;
  revisionDraft: Record<string, string>;
  setRevisionDraft: (value: Record<string, string>) => void;
  updateScene: (sceneId: string, patch: Partial<ScenePlan>) => void;
  updateKeyframe: (keyframeId: string, patch: Partial<Keyframe>) => void;
  setPlanEditOpen: (value: boolean) => void;
  approveAll: () => void;
  copyPacket: (packet: Record<string, unknown> | null) => void;
}) {
  const canApproveAll = props.scenes.length > 0 && props.keyframes.length > 0 && !props.scenes.some((item) => item.status === "needs_revision") && !props.keyframes.some((item) => item.status === "needs_revision");
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-slate-950/80">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-300"><Sparkles size={18} /></div>
            <div>
              <h2 className="font-semibold">{props.route === "plan" ? "Plan preview" : "Optimized prompt packet"}</h2>
              <p className="text-xs text-slate-600">No video render has been started</p>
            </div>
          </div>
          <div className="flex gap-2">
            {props.route === "plan" ? <button onClick={() => props.setPlanEditOpen(true)} className="btn-subtle"><Edit3 size={14} /> Edit plan</button> : null}
            <button onClick={() => props.copyPacket(props.packet)} className="btn-subtle"><Copy size={14} /> Copy packet</button>
            {props.route === "plan" && canApproveAll ? <button onClick={props.approveAll} className="btn-primary-dark"><CheckCircle2 size={15} /> Approve all</button> : null}
          </div>
        </div>

        {props.packetResult ? (
          <div className="grid gap-3 border-b border-white/5 px-5 py-4 md:grid-cols-3">
            <MetricCard label="Pre-generation cost" value={`${props.packetResult.required_credits || 0} tokens`} />
            <MetricCard label="Debited" value={`${props.packetResult.debited_credits || 0} tokens`} />
            <MetricCard label="Quality gate" value={props.packetResult.quality_gate.passed ? "passed" : "needs review"} warn={!props.packetResult.quality_gate.passed} />
          </div>
        ) : null}

        {props.route === "plan" ? (
          <div className="p-5">
            <div className="mb-6">
              <SectionLabel>Visual Script - Scene Breakdown</SectionLabel>
            </div>
            <div className="space-y-6">
              {props.scenes.map((scene, index) => {
                const sceneKeyframes = props.keyframes.filter((kf) => kf.scene_id === scene.id);
                const keyframe = sceneKeyframes[0];
                return (
                  <VisualSceneCard
                    key={scene.id}
                    sceneNumber={index + 1}
                    scene={scene}
                    keyframe={keyframe}
                    draft={props.revisionDraft[keyframe?.keyframe_id || ""] || ""}
                    setDraft={(value) =>
                      keyframe
                        ? props.setRevisionDraft({ ...props.revisionDraft, [keyframe.keyframe_id]: value })
                        : null
                    }
                    updateScene={props.updateScene}
                    updateKeyframe={props.updateKeyframe}
                  />
                );
              })}
            </div>

            {props.packetResult?.final_video_prompt ? (
              <div className="mt-8 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-200">
                  <Sparkles size={16} /> Overall Video Direction & LLM Instructions
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{asString(props.packetResult.final_video_prompt)}</p>
              </div>
            ) : null}
          </div>
          </div>
        ) : (
          <PacketView packet={props.packet} />
        )}
      </section>

      {props.allReady ? (
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
          <h3 className="font-semibold text-emerald-300">Final approved export packet</h3>
          <p className="mt-1 text-sm text-emerald-200/70">Plan and keyframes are approved. This is ready for a future video generator connection.</p>
          <PacketView packet={props.packet} compact />
        </section>
      ) : null}
    </div>
  );
}

function VisualSceneCard({
  sceneNumber,
  scene,
  keyframe,
  draft,
  setDraft,
  updateScene,
  updateKeyframe,
}: {
  sceneNumber: number;
  scene: ScenePlan;
  keyframe?: Keyframe;
  draft: string;
  setDraft: (value: string) => void;
  updateScene: (sceneId: string, patch: Partial<ScenePlan>) => void;
  updateKeyframe: (keyframeId: string, patch: Partial<Keyframe>) => void;
}) {
  const [editingScene, setEditingScene] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [sceneDraft, setSceneDraft] = useState(scene.action);

  useEffect(() => setSceneDraft(scene.action), [scene.action]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.03] overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        {/* Image Column */}
        <div className="bg-gradient-to-br from-slate-900 via-violet-950/40 to-slate-950 flex items-center justify-center min-h-[280px] md:min-h-auto md:aspect-square">
          {keyframe?.image_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={keyframe.image_path} alt={scene.title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-slate-500 p-4">
              <FileImage className="mx-auto mb-2 text-violet-300" size={32} />
              <p className="text-xs">No image generated</p>
            </div>
          )}
        </div>

        {/* Content Column */}
        <div className="p-6 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-violet-400 bg-violet-600/30 px-2 py-1 rounded">Scene {sceneNumber}</span>
                <StatusBadge status={scene.status} />
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-100">{scene.title}</h3>
              <p className="text-xs text-slate-500 mt-1">{scene.duration}</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditingScene((v) => !v)} className="icon-btn" title="Edit scene">
                <Edit3 size={14} />
              </button>
              <button onClick={() => updateScene(scene.id, { status: "approved" })} className="icon-btn text-emerald-300" title="Approve">
                <Check size={14} />
              </button>
              <button onClick={() => updateScene(scene.id, { status: "needs_revision" })} className="icon-btn text-amber-300" title="Revise">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {editingScene ? (
            <div className="mb-4">
              <textarea
                value={sceneDraft}
                onChange={(e) => setSceneDraft(e.target.value)}
                rows={3}
                className="field-area text-sm"
              />
              <button
                onClick={() => {
                  updateScene(scene.id, { action: sceneDraft });
                  setEditingScene(false);
                }}
                className="mt-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold hover:bg-violet-500"
              >
                Save scene
              </button>
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-400 mb-4">{scene.action}</p>
          )}

          {/* Image & Description Controls */}
          {keyframe && (
            <div className="mt-auto pt-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500">Image Prompt</span>
                <button
                  onClick={() => setEditingImage((v) => !v)}
                  className="text-xs text-violet-300 hover:text-violet-200"
                >
                  {editingImage ? "Done" : "Edit"}
                </button>
              </div>
              {editingImage ? (
                <div>
                  <textarea
                    value={draft || keyframe.image_prompt}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    className="field-area text-xs mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        updateKeyframe(keyframe.keyframe_id, { image_prompt: draft || keyframe.image_prompt });
                        setEditingImage(false);
                      }}
                      className="btn-subtle text-xs"
                    >
                      <RefreshCw size={12} /> Regenerate image
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs leading-5 text-slate-500 line-clamp-2">{keyframe.image_prompt}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneCard({ scene, updateScene }: { scene: ScenePlan; updateScene: (sceneId: string, patch: Partial<ScenePlan>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.action);
  useEffect(() => setDraft(scene.action), [scene.action]);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <StatusBadge status={scene.status} />
          <h3 className="mt-2 text-sm font-semibold text-slate-100">{scene.title}</h3>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setEditing((value) => !value)} className="icon-btn"><Edit3 size={14} /></button>
          <button onClick={() => updateScene(scene.id, { status: "approved" })} className="icon-btn text-emerald-300"><Check size={14} /></button>
          <button onClick={() => updateScene(scene.id, { status: "needs_revision" })} className="icon-btn text-amber-300"><RefreshCw size={14} /></button>
        </div>
      </div>
      {editing ? (
        <div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} className="field-area" />
          <button onClick={() => { updateScene(scene.id, { action: draft }); setEditing(false); }} className="mt-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold">Save scene</button>
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-500">{scene.action}</p>
      )}
    </div>
  );
}

function KeyframeCard({ keyframe, draft, setDraft, updateKeyframe }: { keyframe: Keyframe; draft: string; setDraft: (value: string) => void; updateKeyframe: (keyframeId: string, patch: Partial<Keyframe>) => void }) {
  const [editing, setEditing] = useState(false);
  const value = draft || keyframe.image_prompt;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[.03]">
      <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-900 via-violet-950/40 to-slate-950">
        {keyframe.image_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={keyframe.image_path} alt={keyframe.description} className="h-full w-full object-cover" />
        ) : (
        <div className="text-center text-slate-500">
          <FileImage className="mx-auto mb-2 text-violet-300" size={28} />
          <p className="text-xs">{keyframe.image_path || "prompt-only placeholder"}</p>
        </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-lg bg-violet-600/20 px-2 py-1 text-xs font-semibold text-violet-200">{keyframe.timestamp}</span>
          <StatusBadge status={keyframe.status} />
        </div>
        <p className="text-sm leading-6 text-slate-400">{keyframe.description}</p>
        {editing ? (
          <div>
            <textarea value={value} onChange={(event) => setDraft(event.target.value)} rows={4} className="field-area" />
            <div className="mt-2 flex gap-2">
              <button onClick={() => { updateKeyframe(keyframe.keyframe_id, { image_prompt: value }); setEditing(false); }} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold">Regenerate keyframe</button>
              <button onClick={() => setEditing(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="line-clamp-3 text-xs leading-5 text-slate-600">{keyframe.image_prompt}</p>
        )}
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="btn-subtle"><Edit3 size={13} /> Edit</button>
          <button onClick={() => updateKeyframe(keyframe.keyframe_id, { status: "approved" })} className="btn-subtle text-emerald-300"><Check size={13} /> Approve</button>
          <button onClick={() => updateKeyframe(keyframe.keyframe_id, { status: "needs_revision" })} className="btn-subtle text-amber-300"><RefreshCw size={13} /> Revise</button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal(props: {
  close: () => void;
  taskType: SimpleTask;
  setTaskType: (value: SimpleTask) => void;
  durationSeconds: number;
  setDurationSeconds: (value: number) => void;
  platform: string;
  setPlatform: (value: string) => void;
  style: string;
  setStyle: (value: string) => void;
  pace: string;
  setPace: (value: string) => void;
  realism: string;
  setRealism: (value: string) => void;
  audience: string;
  setAudience: (value: string) => void;
  heroSubject: string;
  setHeroSubject: (value: string) => void;
  location: string;
  setLocation: (value: string) => void;
}) {
  return (
    <Modal title="Generation settings" subtitle="Only the important fields are visible here." close={props.close}>
      <OptionGroup label="Task" value={props.taskType} options={OPTIONS.task.map((item) => item.value)} labels={Object.fromEntries(OPTIONS.task.map((item) => [item.value, item.label]))} setValue={(value) => props.setTaskType(value as SimpleTask)} />
      <OptionGroup label="Length" value={`${props.durationSeconds}`} options={OPTIONS.length.map(String)} labels={{ "6": "6 sec", "10": "10 sec", "15": "15 sec" }} setValue={(value) => props.setDurationSeconds(Number(value))} />
      <OptionGroup label="Platform" value={props.platform} options={OPTIONS.platform} setValue={props.setPlatform} />
      <OptionGroup label="Style" value={props.style} options={OPTIONS.style} setValue={props.setStyle} />
      <OptionGroup label="Pace" value={props.pace} options={OPTIONS.pace} setValue={props.setPace} />
      <OptionGroup label="Realism" value={props.realism} options={OPTIONS.realism} setValue={props.setRealism} />
      <input className="modal-input" value={props.audience} onChange={(event) => props.setAudience(event.target.value)} placeholder="Audience" />
      <input className="modal-input" value={props.heroSubject} onChange={(event) => props.setHeroSubject(event.target.value)} placeholder="Hero subject" />
      <input className="modal-input" value={props.location} onChange={(event) => props.setLocation(event.target.value)} placeholder="Location" />
      <button onClick={props.close} className="modal-done">Done</button>
    </Modal>
  );
}

function PersonaModal({ close }: { close: () => void }) {
  return (
    <Modal title="Persona" subtitle="Used as prompt guidance only. No model is changed." close={close}>
      {["Balanced", "Creative Director", "Performance Marketer", "Minimalist"].map((item) => (
        <button key={item} className="mb-2 w-full rounded-xl border border-white/10 bg-white/[.04] p-4 text-left hover:border-violet-500/60">
          <div className="text-sm font-semibold">{item}</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item === "Balanced" ? "Clean, practical, brand-safe output with balanced creativity." : item === "Creative Director" ? "More cinematic, campaign-oriented and visually specific." : item === "Performance Marketer" ? "Focus on hook, product visibility, platform fit, and conversion clarity." : "Simpler visuals, fewer effects, cleaner motion, lower failure risk."}</p>
        </button>
      ))}
      <button onClick={close} className="modal-done">Done</button>
    </Modal>
  );
}

function PlanModal({ text, setText, close, apply }: { text: string; setText: (value: string) => void; close: () => void; apply: () => void }) {
  return (
    <Modal title="Edit full plan" subtitle="Use this only for broad changes. Specific scene and keyframe edits preserve the rest." close={close}>
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={14} className="field-area" />
      <div className="mt-3 flex gap-2">
        <button onClick={apply} className="modal-done">Apply plan edit</button>
      </div>
    </Modal>
  );
}

function AuthModal({ mode, close, submit, pending, error }: { mode: "login" | "signup"; close: () => void; submit: (input: { mode: "login" | "signup"; userId: string; name?: string }) => void; pending: boolean; error: Error | null }) {
  const [userId, setUserId] = useState("demo-user");
  const [name, setName] = useState("Demo user");
  const isSignup = mode === "signup";
  return (
    <Modal title={isSignup ? "Create account" : "Login"} subtitle="Local demo auth creates a scoped Saar session. Replace this with your real identity provider before production." close={close}>
      {isSignup ? <input className="modal-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" /> : null}
      <input className="modal-input" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="User ID or email" />
      {error ? <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error.message}</p> : null}
      <button disabled={pending || !userId.trim()} onClick={() => submit({ mode, userId: userId.trim(), name: name.trim() })} className="modal-done disabled:opacity-50">
        {pending ? "Working..." : isSignup ? "Create demo account" : "Login"}
      </button>
    </Modal>
  );
}

function PlansModal({ close, plans, balance, pendingPlanKey, isPending, error, subscribe, onCoupon }: { close: () => void; plans: PricingPlan[]; balance: number; pendingPlanKey?: string; isPending: boolean; error: Error | null; subscribe: (planKey: string) => void; onCoupon: () => void }) {
  return (
    <Modal title="Plans and tokens" subtitle="Local checkout adds credits through mock payments. Real production payments should confirm with your payment provider webhook first." close={close}>
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[.04] p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600"><CreditCard size={14} /> Current balance</p>
        <p className="mt-1 text-2xl font-semibold">{balance.toLocaleString()} credits</p>
      </div>

      <button onClick={onCoupon} className="w-full mb-4 rounded-lg border border-violet-500/50 bg-violet-600/20 px-4 py-3 text-sm font-semibold text-violet-200 hover:bg-violet-600/30 transition">
        <Sparkles size={14} className="inline mr-2" /> Redeem coupon code
      </button>

      <div className="space-y-3">
        {(plans.length ? plans : fallbackPlans()).map((plan) => (
          <button key={plan.key} onClick={() => subscribe(plan.key)} disabled={isPending} className="w-full rounded-2xl border border-white/10 bg-white/[.04] p-4 text-left transition hover:border-violet-500/50 hover:bg-violet-600/10 disabled:opacity-60">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-white">{plan.name}</p>
                <p className="mt-1 text-sm text-slate-500">{plan.credits.toLocaleString()} credits</p>
              </div>
              <div className="text-right">
                <p className="text-base font-semibold text-white">NPR {plan.price_npr.toLocaleString()}</p>
                <p className="mt-1 text-xs text-violet-300">{isPending && pendingPlanKey === plan.key ? "Adding..." : "Upgrade"}</p>
              </div>
            </div>
            {plan.features?.length ? <p className="mt-3 text-xs leading-5 text-slate-600">{plan.features.slice(0, 3).join(" • ")}</p> : null}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error.message}</p> : null}
      <button onClick={close} className="modal-done">Done</button>
    </Modal>
  );
}

function Modal({ title, subtitle, close, children }: { title: string; subtitle: string; close: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/70 px-4 pt-20" onClick={close}>
      <div className="max-h-[78vh] w-full max-w-lg overflow-auto rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
          </div>
          <button onClick={close} className="rounded-lg p-2 text-slate-500 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OptionGroup({ label, value, options, labels, setValue }: { label: string; value: string; options: string[]; labels?: Record<string, string>; setValue: (value: string) => void }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => <button key={option} onClick={() => setValue(option)} className={`rounded-lg border px-3 py-2 text-sm ${value === option ? "border-violet-500 bg-violet-600/20 text-violet-200" : "border-white/10 bg-white/[.04] text-slate-400 hover:text-white"}`}>{labels?.[option] || option}</button>)}
      </div>
    </div>
  );
}

function PacketView({ packet, compact = false }: { packet: Record<string, unknown> | null; compact?: boolean }) {
  if (!packet) return null;
  return (
    <details className="m-5 rounded-xl border border-white/10 bg-black/20 p-4" open={!compact}>
      <summary className="cursor-pointer text-sm font-medium text-slate-300">Prompt optimization packet</summary>
      <pre className="mt-3 max-h-[520px] overflow-auto rounded-lg bg-black/30 p-3 text-xs leading-5 text-slate-400">{JSON.stringify(packet, null, 2)}</pre>
    </details>
  );
}

function RouteButton({ active, onClick, icon, label, cost }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; cost: number }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${active ? "border-violet-500/50 bg-violet-600/20 text-violet-100" : "border-white/15 bg-white/[.03] text-slate-300 hover:bg-white/10"}`}>{icon}{label}<span className="text-xs opacity-60">{cost}</span></button>;
}

function AttachmentPill({ item, remove }: { item: Attachment; remove: () => void }) {
  const Icon = item.type.startsWith("image/") ? FileImage : item.type.startsWith("video/") ? FileVideo : FileText;
  return <span className="inline-flex max-w-[240px] items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-300"><Icon size={14} /><span className="truncate">{item.name}</span><button type="button" onClick={remove} className="text-slate-600 hover:text-white"><X size={13} /></button></span>;
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-lg border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-slate-500">{children}</span>;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{children}</p>;
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const cls = status === "approved" || status === "locked" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : status === "needs_revision" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-white/10 bg-white/[.04] text-slate-500";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}

function normalizeScenes(rows: Array<Record<string, unknown>>): ScenePlan[] {
  return rows.map((row, index) => ({
    id: asString(row.id, `scene-${index + 1}`),
    title: asString(row.title, `Scene ${index + 1}`),
    duration: asString(row.duration, "3 sec"),
    action: asString(row.subject_action ?? row.visual_description, ""),
    camera: asString(row.camera, "slow stable dolly-in"),
    referencePrompt: asString(row.reference_image_prompt, ""),
    status: normalizeStatus(row.status),
  }));
}

function normalizeKeyframes(rows: Array<Record<string, unknown>>): Keyframe[] {
  return rows.map((row, index) => ({
    keyframe_id: asString(row.keyframe_id, `keyframe-${index + 1}`),
    scene_id: asString(row.scene_id, `scene-${index + 1}`),
    timestamp: asString(row.timestamp, `${index * 2}s`),
    description: asString(row.description, ""),
    image_prompt: asString(row.image_prompt, ""),
    negative_prompt: asString(row.negative_prompt, ""),
    status: normalizeStatus(row.status),
    image_path: asString(row.image_path, `/local-placeholders/reference-keyframe-${index + 1}.png`),
    history: Array.isArray(row.history) ? row.history as Array<Record<string, unknown>> : [],
  }));
}

function sceneToApi(scene: ScenePlan, index: number): Record<string, unknown> {
  return {
    id: scene.id,
    scene_number: index + 1,
    title: scene.title,
    duration: scene.duration,
    visual_description: scene.action,
    camera: scene.camera,
    motion: "single controlled motion; no fast cuts",
    lighting: "soft natural directional light",
    subject_action: scene.action,
    reference_image_prompt: scene.referencePrompt,
    status: scene.status,
  };
}

function keyframeToApi(keyframe: Keyframe): Record<string, unknown> {
  return { ...keyframe };
}

function scenePatchToApi(patch: Partial<ScenePlan>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (patch.title !== undefined) result.title = patch.title;
  if (patch.duration !== undefined) result.duration = patch.duration;
  if (patch.action !== undefined) {
    result.visual_description = patch.action;
    result.subject_action = patch.action;
  }
  if (patch.camera !== undefined) result.camera = patch.camera;
  if (patch.referencePrompt !== undefined) result.reference_image_prompt = patch.referencePrompt;
  if (patch.status !== undefined) result.status = patch.status;
  return result;
}

function keyframePatchToApi(patch: Partial<Keyframe>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (patch.description !== undefined) result.description = patch.description;
  if (patch.image_prompt !== undefined) result.image_prompt = patch.image_prompt;
  if (patch.negative_prompt !== undefined) result.negative_prompt = patch.negative_prompt;
  if (patch.status !== undefined) result.status = patch.status;
  return result;
}

function renderPlanText(scenes: ScenePlan[]) {
  return scenes.map((scene, index) => `${index + 1}. ${scene.title}\nDuration: ${scene.duration}\nAction: ${scene.action}\nCamera: ${scene.camera}\nReference: ${scene.referencePrompt}`).join("\n\n");
}

function parsePlanText(text: string, fallback: ScenePlan[]) {
  const blocks = text.split(/\n\s*\n/).filter(Boolean);
  if (!blocks.length) return fallback;
  return blocks.map((block, index) => {
    const existing = fallback[index] || fallback[fallback.length - 1];
    const lines = block.split("\n").map((line) => line.trim());
    return {
      id: existing?.id || `scene-${index + 1}`,
      title: lines[0]?.replace(/^\d+\.\s*/, "") || existing?.title || `Scene ${index + 1}`,
      duration: lines.find((line) => line.startsWith("Duration:"))?.replace("Duration:", "").trim() || existing?.duration || "3 sec",
      action: lines.find((line) => line.startsWith("Action:"))?.replace("Action:", "").trim() || existing?.action || block,
      camera: lines.find((line) => line.startsWith("Camera:"))?.replace("Camera:", "").trim() || existing?.camera || "stable camera",
      referencePrompt: lines.find((line) => line.startsWith("Reference:"))?.replace("Reference:", "").trim() || existing?.referencePrompt || block,
      status: "revised" as ItemStatus,
    };
  });
}

function MetricCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? "border-amber-500/20 bg-amber-500/10" : "border-white/10 bg-white/[.03]"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className={warn ? "mt-1 truncate text-sm font-semibold text-amber-200" : "mt-1 truncate text-sm font-semibold text-slate-300"}>{value}</p>
    </div>
  );
}

function buildApprovedExport(basePacket: Record<string, unknown>, scenes: ScenePlan[], keyframes: Keyframe[]) {
  return {
    ...basePacket,
    approved_plan: { scenes },
    approved_keyframes: keyframes,
    reference_image_paths: keyframes.map((item) => item.image_path).filter(Boolean),
    final_prompt: asString(basePacket.final_video_prompt),
    memory: basePacket.memory_used || {},
    context: basePacket.active_context || {},
    negative_constraints: basePacket.negative_constraints || [],
    continuity_rules: (basePacket.active_context as { hard_constraints?: unknown[] } | undefined)?.hard_constraints || [],
    ready_for_video_generator: true,
  };
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeStatus(value: unknown): ItemStatus {
  return value === "approved" || value === "locked" || value === "needs_revision" || value === "revised" ? value : "draft";
}

function createSafeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function inferFileType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "")) return "image/*";
  if (["mp4", "mov", "webm"].includes(ext || "")) return "video/*";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function isStatusOnlyPatch(patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === "status";
}

function estimateIntelligenceCredits(route: RouteMode, durationSeconds: number, sceneCount: number, keyframeCount: number) {
  const duration = Math.max(1, durationSeconds);
  if (route === "direct") return Math.max(4, Math.round(4 + duration / 6));
  const scenes = sceneCount || (duration <= 6 ? 2 : duration <= 10 ? 3 : 4);
  const keyframes = keyframeCount || (duration <= 6 ? 3 : duration <= 10 ? 4 : 5);
  return Math.max(10, Math.round(8 + scenes * 2 + keyframes * 2 + duration / 6));
}

function fallbackPlans(): PricingPlan[] {
  const created_at = new Date().toISOString();
  return [
    { id: "fallback-starter", key: "starter", name: "Starter", price_npr: 999, credits: 120, max_video_seconds: 6, max_jobs_per_month: 20, features: ["Fast previews", "6-second videos", "Basic QA"], is_active: true, created_at },
    { id: "fallback-creator", key: "creator", name: "Creator", price_npr: 2999, credits: 450, max_video_seconds: 10, max_jobs_per_month: 80, features: ["Wan quality jobs", "I2V", "Assurance workflow"], is_active: true, created_at },
    { id: "fallback-studio", key: "studio", name: "Studio", price_npr: 7999, credits: 1400, max_video_seconds: 20, max_jobs_per_month: null, features: ["Premium workflows", "Longer videos", "Revision memory"], is_active: true, created_at },
  ];
}
