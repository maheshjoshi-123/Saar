"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
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
import { api, AuthSession, IntelligencePacket, Job, PaymentRequest, PricingPlan, UploadedAsset, Wallet } from "@/lib/api";
import { clearStoredSession, createDemoSession, DEMO_USER_ID, DEMO_USER_NAME, DEMO_USER_TIER, isSignedInSession, loadStoredSession, saveSession, sessionFromAuth, sessionHeaders, uploadAssetForSession, UserSession } from "@/lib/session";

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
  motion: string;
  lighting: string;
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
  image_status?: "generating" | "ready" | "failed" | "placeholder" | string;
  image_mode?: string;
  history: Array<Record<string, unknown>>;
};

type Attachment = {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  asset?: UploadedAsset;
  uploadError?: string | null;
};

type Project = {
  id: string;
  title: string;
  route: RouteMode;
  prompt: string;
  status: string;
  createdAt: string;
  packet: Record<string, unknown> | null;
  scenes: ScenePlan[];
  keyframes: Keyframe[];
  messages: OutputMessageItem[];
};

type OutputMessageItem = {
  id: string;
  route: RouteMode;
  prompt: string;
  taskType: SimpleTask;
  durationSeconds: number;
  quality: string;
  packetResult: IntelligencePacket;
  packet: Record<string, unknown> | null;
  scenes: ScenePlan[];
  keyframes: Keyframe[];
  attachments: Attachment[];
  packetSource: "backend" | "preview";
  allReady: boolean;
  renderJob?: Job | null;
  renderError?: string | null;
  renderPending?: boolean;
  createdAt: string;
  settings?: Record<string, unknown>;
};

type PacketBuildInput = {
  routeName: RouteType;
  scenePlan?: ScenePlan[];
  keyframePlan?: Keyframe[];
  editSceneId?: string;
  scenePatch?: Record<string, unknown>;
  editKeyframeId?: string;
  keyframePatch?: Record<string, unknown>;
  chargeCredits?: boolean;
};

const PREF_KEY = "saar_generation_preferences_v2";
const PROJECT_HISTORY_KEY = "saar_project_history_v1";
const INITIAL_PROMPT = "Make a premium Facebook Reel ad for a warm grey curved-brim cap on a Kathmandu rooftop.";
const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "application/pdf"]);
const UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/webm,application/pdf";

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
  const [session, setSession] = useState<UserSession>(() => createDemoSession());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [planEditOpen, setPlanEditOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState<"login" | "signup" | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponPurchaseCredits, setCouponPurchaseCredits] = useState(0);
  const [couponOpen, setCouponOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [outputMessages, setOutputMessages] = useState<OutputMessageItem[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [fullPlanText, setFullPlanText] = useState("");
  const [revisionDraft, setRevisionDraft] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const packetAttachmentsRef = useRef<Attachment[]>([]);

  const userId = session.userId;
  const userToken = session.userToken;
  const headers = sessionHeaders(session);
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
      attachments: compactAssetRefs(attachments),
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
      setSession(loadStoredSession());
      const savedProjects = JSON.parse(localStorage.getItem(PROJECT_HISTORY_KEY) || "[]") as Project[];
      if (Array.isArray(savedProjects)) setProjects(savedProjects.slice(0, 12));
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
    saveSession(session);
  }, [session]);

  useEffect(() => {
    try {
      localStorage.setItem(PROJECT_HISTORY_KEY, JSON.stringify(projects.slice(0, 12)));
    } catch {
      // Non-critical project shortcuts.
    }
  }, [projects]);

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
    mutationFn: (input: PacketBuildInput) => createBackendGenerationPacket(input),
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
      setSession(sessionFromAuth(result));
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
      setToast("Credits added");
    },
  });

  const couponMutation = useMutation({
    mutationFn: (input: { code: string; purchaseCredits: number }) =>
      api<Wallet>("/api/coupons/redeem", {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: userId, code: input.code.trim().toUpperCase(), purchase_credits: input.purchaseCredits }),
      }),
    onSuccess: () => {
      wallet.refetch();
      setCouponCode("");
      setCouponPurchaseCredits(0);
      setCouponOpen(false);
      setToast("Coupon redeemed!");
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (input: { planKey: string; transactionId: string }) =>
      api<PaymentRequest>("/api/billing/payment-request", {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: userId, plan_key: input.planKey, transaction_id: input.transactionId, payment_method: "esewa" }),
      }),
    onSuccess: () => {
      setToast("Payment submitted! Will activate in 24hr.");
    },
  });

  async function createBackendGenerationPacket(input: PacketBuildInput) {
    const routeName = input.routeName;
    const scenePlan = input.scenePlan ?? [];
    const keyframePlan = input.keyframePlan ?? [];
    const uploadedAttachments = await ensureAttachmentsUploaded(attachments);
    assertUploadsReady(uploadedAttachments);
    packetAttachmentsRef.current = uploadedAttachments;
    return api<IntelligencePacket>("/api/intelligence/packet", {
      method: "POST",
      headers,
      body: JSON.stringify({
        route: routeName,
        raw_prompt: prompt,
        user_id: userId || null,
        settings: { ...backendSettings, attachments: compactAssetRefs(uploadedAttachments) },
        scene_plan: scenePlan.map(sceneToApi),
        keyframes: keyframePlan.map(keyframeToApi),
        edit_scene_id: input.editSceneId || null,
        scene_patch: input.scenePatch || {},
        edit_keyframe_id: input.editKeyframeId || null,
        keyframe_patch: input.keyframePatch || {},
        charge_credits: input.chargeCredits ?? true,
      }),
    });
  }

  function receivePacket(result: IntelligencePacket) {
    const nextScenes = normalizeScenes(result.scene_plan);
    const nextKeyframes = normalizeKeyframes(result.keyframes);
    const packet = result.packet || {};
    const messageAttachments = packetAttachmentsRef.current.length ? packetAttachmentsRef.current : attachments;
    const messageId = createSafeId();
    const createdAt = new Date().toISOString();
    
    const newMessage: OutputMessageItem = {
      id: messageId,
      route,
      prompt,
      taskType,
      durationSeconds,
      quality,
      packetResult: result,
      packet,
      scenes: nextScenes,
      keyframes: nextKeyframes,
      attachments: messageAttachments,
      packetSource: "backend",
      allReady: false,
      renderJob: null,
      renderError: null,
      renderPending: false,
      createdAt,
      settings: { ...backendSettings },
    };
    
    setOutputMessages((current) => [...current, newMessage]);
    setSelectedMessageId(messageId);
    
    setProjects((current) => {
      if (selectedProjectId) {
        return current.map((p) => {
          if (p.id === selectedProjectId) {
            return {
              ...p,
              messages: [...(p.messages || []), newMessage],
              status: result.quality_gate?.passed ? "Ready" : "Review",
            };
          }
          return p;
        });
      } else {
        const newProjectId = createSafeId();
        setSelectedProjectId(newProjectId);
        const newProject: Project = {
          id: newProjectId,
          title: prompt.trim().slice(0, 72) || "Untitled video project",
          route,
          prompt,
          status: result.quality_gate?.passed ? "Ready" : "Review",
          createdAt,
          packet,
          scenes: nextScenes,
          keyframes: nextKeyframes,
          messages: [newMessage],
        };
        return [newProject, ...current].slice(0, 12);
      }
    });

    // Reset composer state for next message in thread
    setPrompt("");
    setAttachments([]);
  }

  function openProject(item: Project) {
    setSelectedProjectId(item.id);
    setPrompt("");
    setAttachments([]);
    
    if (item.messages && item.messages.length) {
      setOutputMessages(item.messages);
      setSelectedMessageId(item.messages[item.messages.length - 1].id);
    } else {
      // Compatibility for legacy projects without messages array
      const preview = createPreviewGenerationPacket({
        route: item.route,
        prompt: item.prompt,
        scenes: item.scenes,
        keyframes: item.keyframes,
        settings: backendSettings,
        userBalance: balance,
      });
      const messageId = createSafeId();
      const legacyMessage: OutputMessageItem = {
        id: messageId,
        route: item.route,
        prompt: item.prompt,
        taskType,
        durationSeconds,
        quality,
        packetResult: preview,
        packet: item.packet && Object.keys(item.packet).length ? item.packet : preview.packet,
        scenes: item.scenes,
        keyframes: item.keyframes,
        attachments: [],
        packetSource: "backend",
        allReady: false,
        renderJob: null,
        renderError: null,
        renderPending: false,
        createdAt: item.createdAt,
      };
      setOutputMessages([legacyMessage]);
      setSelectedMessageId(messageId);
    }
    setToast("Project opened");
  }

  function logout() {
    setSession(clearStoredSession());
    setAttachments([]);
    setOutputMessages([]);
    setSelectedMessageId(null);
    setProjects([]);
    setSelectedProjectId(null);
    setToast("Logged out");
  }


  function submit(event?: FormEvent) {
    event?.preventDefault();
    submitRoute(route);
  }

  function submitRoute(nextRoute: RouteMode) {
    if (!prompt.trim()) return;
    if (lowTokens) {
      setPlansOpen(true);
      return;
    }
    setRoute(nextRoute);
    buildMutation.mutate({ routeName: nextRoute === "direct" ? "direct_video" : "generate_plan", scenePlan: [], keyframePlan: [] });
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  function addFiles(files: FileList | File[]) {
    const next: Attachment[] = [];
    const rejected: string[] = [];
    Array.from(files).forEach((file) => {
      const type = file.type || inferFileType(file.name);
      if (!ALLOWED_UPLOAD_TYPES.has(type)) {
        rejected.push(file.name);
        return;
      }
      next.push({
        id: createSafeId(),
        file,
        name: file.name,
        type,
        size: file.size,
      });
    });
    if (rejected.length) {
      setToast(`Unsupported file type: ${rejected.slice(0, 2).join(", ")}${rejected.length > 2 ? "..." : ""}`);
    }
    if (!next.length) return;
    setAttachments((current) => [...current, ...next]);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  function applyFullPlanEdit() {
    const selectedMessage = outputMessages.find(m => m.id === selectedMessageId);
    if (!selectedMessage) {
      setToast("No message selected");
      return;
    }
    const parsed = parsePlanText(fullPlanText, selectedMessage.scenes);
    setPlanEditOpen(false);
    buildMutation.mutate({ routeName: "generate_plan", scenePlan: parsed, keyframePlan: [] });
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

  function updateOutputMessage(messageId: string, patch: Partial<OutputMessageItem>) {
    setOutputMessages((current) => current.map((message) => (message.id === messageId ? { ...message, ...patch } : message)));
  }

  async function ensureAttachmentsUploaded(items: Attachment[]): Promise<Attachment[]> {
    const uploaded: Attachment[] = [];
    for (const item of items) {
      if (item.asset) {
        uploaded.push(item);
        continue;
      }
      try {
        const asset = await uploadAssetForSession(item.file, session);
        uploaded.push({ ...item, asset, uploadError: null });
      } catch (error) {
        const uploadError = error instanceof Error ? error.message : "Upload failed";
        uploaded.push({ ...item, uploadError });
        setToast(uploadError);
      }
    }
    setAttachments((current) => current.map((item) => uploaded.find((next) => next.id === item.id) || item));
    return uploaded;
  }

  async function ensureMessageAttachmentsUploaded(message: OutputMessageItem): Promise<Attachment[]> {
    const uploaded = await ensureAttachmentsUploaded(message.attachments);
    updateOutputMessage(message.id, { attachments: uploaded });
    return uploaded;
  }

  function approvePlanMessage(message: OutputMessageItem) {
    const nextScenes = message.scenes.map((scene) => ({ ...scene, status: "approved" as ItemStatus }));
    const nextKeyframes = message.keyframes.map((keyframe) => ({ ...keyframe, status: "approved" as ItemStatus }));
    const exportPacket = buildApprovedExport(message.packet || {}, nextScenes, nextKeyframes);
    updateOutputMessage(message.id, {
      scenes: nextScenes,
      keyframes: nextKeyframes,
      packet: exportPacket,
      allReady: true,
      renderJob: null,
      renderError: null,
    });
    setToast("Plan approved");
  }

  async function revisePlanScene(message: OutputMessageItem, sceneId: string, patch: Partial<ScenePlan>) {
    const localScenes = message.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch, status: patch.status || "revised" } : scene));
    updateOutputMessage(message.id, { scenes: localScenes, allReady: isPlanReady(localScenes, message.keyframes), renderJob: null, renderError: null });
    if (isStatusOnlyPatch(patch)) {
      return;
    }
    try {
      const result = await createBackendGenerationPacketForMessage(message, {
        scenePlan: localScenes,
        keyframePlan: message.keyframes,
        editSceneId: sceneId,
        scenePatch: scenePatchToApi(patch),
      });
      const backendScenes = normalizeScenes(result.scene_plan);
      const backendKeyframes = normalizeKeyframes(result.keyframes);
      const mergedScenes = mergeSceneRevision(message.scenes, backendScenes, sceneId, localScenes);
      const mergedKeyframes = mergeKeyframeSceneRevision(message.keyframes, backendKeyframes, sceneId);
      updateOutputMessage(message.id, {
        packetResult: result,
        packet: result.packet || {},
        scenes: mergedScenes,
        keyframes: mergedKeyframes,
        allReady: isPlanReady(mergedScenes, mergedKeyframes),
      });
      wallet.refetch();
    } catch (error) {
      updateOutputMessage(message.id, { renderError: error instanceof Error ? error.message : "Scene revision failed." });
    }
  }

  async function revisePlanKeyframe(message: OutputMessageItem, keyframeId: string, patch: Partial<Keyframe>) {
    const localKeyframes = message.keyframes.map((item) => (item.keyframe_id === keyframeId ? { ...item, ...patch, status: patch.status || "revised" } : item));
    updateOutputMessage(message.id, { keyframes: localKeyframes, allReady: isPlanReady(message.scenes, localKeyframes), renderJob: null, renderError: null });
    if (isStatusOnlyPatch(patch)) {
      return;
    }
    try {
      const result = await createBackendGenerationPacketForMessage(message, {
        scenePlan: message.scenes,
        keyframePlan: localKeyframes,
        editKeyframeId: keyframeId,
        keyframePatch: keyframePatchToApi(patch),
      });
      const backendKeyframes = normalizeKeyframes(result.keyframes);
      const mergedKeyframes = mergeKeyframeRevision(message.keyframes, backendKeyframes, keyframeId, localKeyframes);
      updateOutputMessage(message.id, {
        packetResult: result,
        packet: result.packet || {},
        keyframes: mergedKeyframes,
        allReady: isPlanReady(message.scenes, mergedKeyframes),
      });
      wallet.refetch();
    } catch (error) {
      updateOutputMessage(message.id, { renderError: error instanceof Error ? error.message : "Keyframe revision failed." });
    }
  }

  async function createBackendGenerationPacketForMessage(
    message: OutputMessageItem,
    input: { scenePlan: ScenePlan[]; keyframePlan: Keyframe[]; editSceneId?: string; scenePatch?: Record<string, unknown>; editKeyframeId?: string; keyframePatch?: Record<string, unknown> },
  ) {
    return api<IntelligencePacket>("/api/intelligence/packet", {
      method: "POST",
      headers,
      body: JSON.stringify({
        route: "generate_plan",
        raw_prompt: message.prompt,
        user_id: userId || null,
        settings: { ...compactMessageSettings(message), attachments: compactAssetRefs(message.attachments) },
        scene_plan: input.scenePlan.map(sceneToApi),
        keyframes: input.keyframePlan.map(keyframeToApi),
        edit_scene_id: input.editSceneId || null,
        scene_patch: input.scenePatch || {},
        edit_keyframe_id: input.editKeyframeId || null,
        keyframe_patch: input.keyframePatch || {},
        charge_credits: true,
      }),
    });
  }

  async function generateDirectVideo(message: OutputMessageItem) {
    if (message.route !== "direct" || message.renderPending) return;
    updateOutputMessage(message.id, { renderPending: true, renderError: null });
    try {
      const uploadedAttachments = await ensureMessageAttachmentsUploaded(message);
      assertUploadsReady(uploadedAttachments);
      const messageWithAssets = { ...message, attachments: uploadedAttachments };
      const backendPacket = requireBackendGenerationPacket(message);
      const compactPacket = compactDirectPacket(backendPacket, message.packetResult);
      const inputAssetId = uploadDirectInputAsset(messageWithAssets);
      const job = await api<Job>("/api/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: compactPacket.final_prompt || compactPacket.final_video_prompt || message.prompt,
          task_type: message.taskType,
          negative_prompt: compactPacket.negative_prompt || null,
          input_asset_id: inputAssetId,
          user_id: userId || null,
          options: {
            source_route: "direct_video",
            duration_seconds: message.durationSeconds,
            duration: `${message.durationSeconds} seconds`,
            quality: message.quality,
            platform,
            style,
            pace,
            realism,
            hero_subject: heroSubject,
            location,
            direct_packet: compactPacket,
            input_assets: compactAssetRefs(uploadedAttachments),
            reference_summary: compactAssetRefs(uploadedAttachments),
            // TODO: backend currently accepts one generation input asset; multi-file references need a backend contract.
          },
        }),
      });
      updateOutputMessage(message.id, { renderJob: job, renderPending: false });
      jobs.refetch();
      pollDirectJob(message.id, job.id);
    } catch (error) {
      updateOutputMessage(message.id, {
        renderPending: false,
        renderError: error instanceof Error ? error.message : "Video job could not be started. Packet preview remains available.",
      });
    }
  }

  function uploadDirectInputAsset(message: OutputMessageItem): string | null {
    if (message.taskType !== "image_to_video") return null;
    const image = message.attachments.find((item) => item.type.startsWith("image/"));
    if (!image) throw new Error("Image to video requires an attached image before Generate Video.");
    if (!image.asset?.asset_id) throw new Error("Attached image upload did not return an asset ID.");
    return image.asset.asset_id;
  }

  function pollDirectJob(messageId: string, jobId: string) {
    const poll = async () => {
      try {
        const job = await api<Job>(`/api/jobs/${jobId}?user_id=${encodeURIComponent(userId)}`, { headers });
        updateOutputMessage(messageId, { renderJob: job, renderPending: false, renderError: job.error || null });
        jobs.refetch();
        if (!["completed", "failed", "cancelled"].includes(job.status)) {
          window.setTimeout(poll, 3000);
        }
      } catch (error) {
        updateOutputMessage(messageId, {
          renderPending: false,
          renderError: error instanceof Error ? error.message : "Could not poll video job status.",
        });
      }
    };
    window.setTimeout(poll, 1200);
  }

  async function generatePlanVideo(message: OutputMessageItem) {
    if (message.route !== "plan" || message.renderPending || !isPlanReady(message.scenes, message.keyframes)) return;
    updateOutputMessage(message.id, { renderPending: true, renderError: null });
    try {
      const uploadedAttachments = await ensureMessageAttachmentsUploaded(message);
      assertUploadsReady(uploadedAttachments);
      const messageWithAssets = { ...message, attachments: uploadedAttachments };
      const backendPacket = requireBackendGenerationPacket(message);
      const compactPacket = compactPlanPacket(message, backendPacket);
      const inputAssetId = uploadDirectInputAsset(messageWithAssets);
      const job = await api<Job>("/api/jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: compactPacket.final_prompt || message.packetResult.final_video_prompt || message.prompt,
          task_type: message.taskType,
          input_asset_id: inputAssetId,
          user_id: userId || null,
          options: {
            source_route: "generate_plan",
            duration_seconds: message.durationSeconds,
            duration: `${message.durationSeconds} seconds`,
            quality: message.quality,
            platform: compactPacket.platform,
            approved_plan: compactPacket.approved_plan,
            approved_keyframes: compactPacket.approved_keyframes,
            final_video_prompt: compactPacket.final_prompt,
            backend_packet: compactPacket.backend_packet,
            input_assets: compactAssetRefs(uploadedAttachments),
            reference_summary: compactAssetRefs(uploadedAttachments),
            // TODO: backend job options accept plan context, but generation workflows still need to consume this structured plan.
          },
        }),
      });
      updateOutputMessage(message.id, { renderJob: job, renderPending: false });
      jobs.refetch();
      pollDirectJob(message.id, job.id);
    } catch (error) {
      updateOutputMessage(message.id, {
        renderPending: false,
        renderError: error instanceof Error ? error.message : "Plan video job could not be started.",
      });
    }
  }

  const busy = buildMutation.isPending;
  const selectedMessage = outputMessages.find(m => m.id === selectedMessageId);
  const expectedTokens = estimateIntelligenceCredits(route, durationSeconds, selectedMessage?.scenes.length ?? 0, selectedMessage?.keyframes.length ?? 0);
  const balance = wallet.data?.balance ?? 0;
  const lowTokens = Boolean(wallet.data && balance < expectedTokens);
  const pricingPlans = plans.data || [];
  const recentJobs = jobs.data || [];
  const renderStatusKey = recentJobs.map((job) => `${job.id}:${job.status}:${getJobPlaybackUrl(job) || ""}`).join("|");
  const outputStatusKey = outputMessages.map((message) => `${message.id}:${message.renderPending ? "pending" : ""}:${message.renderJob?.status || ""}:${message.renderJob ? getJobPlaybackUrl(message.renderJob) || "" : ""}:${message.renderError || ""}`).join("|");
  const inlineJobIds = new Set(outputMessages.map((message) => message.renderJob?.id).filter(Boolean));

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [outputMessages.length, buildMutation.isPending, renderStatusKey, outputStatusKey]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#070b12] text-white" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(124,58,237,.18),transparent_34%),radial-gradient(circle_at_90%_85%,rgba(14,165,233,.12),transparent_38%)]" />
      <Header session={session} balance={balance} expectedTokens={expectedTokens} lowTokens={lowTokens} onPlans={() => setPlansOpen(true)} onLogin={() => setAuthOpen("login")} onSignup={() => setAuthOpen("signup")} onLogout={logout} onSettings={() => setSettingsOpen(true)} onPersona={() => setPersonaOpen(true)} />

      <section className="relative mx-auto flex min-h-0 w-full flex-1 gap-0 overflow-hidden">
        <ProjectSidebar projects={projects} jobs={recentJobs} selectedProjectId={selectedProjectId} onOpenProject={openProject} onNew={() => { setPrompt(""); setAttachments([]); setOutputMessages([]); setSelectedMessageId(null); setSelectedProjectId(null); }} onPlans={() => setPlansOpen(true)} />

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <div className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1">
            <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-end gap-3">
              {!outputMessages.length && !recentJobs.length ? <EmptyState /> : null}
              {outputMessages.map((message) => (
                <OutputMessage
                  key={message.id}
                  message={message}
                  isSelected={message.id === selectedMessageId}
                  onSelect={() => setSelectedMessageId(message.id)}
                  revisionDraft={revisionDraft}
                  setRevisionDraft={setRevisionDraft}
                  onReviseFullPlan={() => {
                    setSelectedMessageId(message.id);
                    setFullPlanText(renderPlanText(message.scenes));
                    setPlanEditOpen(true);
                  }}
                  approveAll={approvePlanMessage}
                  copyPacket={copyPacket}
                  generateDirectVideo={generateDirectVideo}
                  generatePlanVideo={generatePlanVideo}
                  revisePlanScene={revisePlanScene}
                  revisePlanKeyframe={revisePlanKeyframe}
                />
              ))}
              {recentJobs.slice().reverse().filter((job) => !inlineJobIds.has(job.id)).map((job) => <VideoOutputMessage key={job.id} job={job} />)}
              <div ref={outputEndRef} />
            </div>
          </div>

          <form onSubmit={submit} className="sticky bottom-0 mx-auto w-full max-w-4xl rounded-xl border border-white/10 bg-slate-950/90 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-2 overflow-x-auto border-b border-white/5 px-2 py-1.5">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-600">Settings</span>
              <Chip>{taskType === "image_to_video" ? "I2V" : "T2V"}</Chip>
              <Chip>{platform}</Chip>
              <Chip>{durationSeconds}s</Chip>
              <Chip>{style}</Chip>
              <button type="button" onClick={() => setSettingsOpen(true)} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10">
                <Settings size={10} /> Edit
              </button>
            </div>

            {attachments.length ? (
              <div className="flex gap-1 overflow-x-auto px-2 pt-1.5">
                {attachments.map((item) => <AttachmentPill key={item.id} item={item} remove={() => setAttachments((current) => current.filter((file) => file.id !== item.id))} />)}
              </div>
            ) : null}

            <div className="px-2 py-1.5">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onComposerKey} rows={1} className="max-h-24 min-h-[32px] w-full resize-none overflow-y-auto border-0 bg-transparent text-sm leading-tight text-white outline-none placeholder:text-slate-800" placeholder="Type a message or drop files..." />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
              <div className="flex items-center gap-1">
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)} accept={UPLOAD_ACCEPT} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-md border border-white/15 p-1.5 text-slate-500 hover:bg-white/10 hover:text-white" title="Attach files">
                  <Paperclip size={14} />
                </button>
                <button type="button" onClick={() => { setTaskType("image_to_video"); fileInputRef.current?.click(); }} className="rounded-md border border-white/15 p-1.5 text-slate-500 hover:bg-white/10 hover:text-white" title="Attach image">
                  <ImagePlus size={14} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <p className="mr-2 hidden text-[10px] text-slate-700 sm:block">Cmd+Enter to send</p>
                <RouteButton active={route === "plan"} onClick={() => submitRoute("plan")} icon={<Film size={12} />} label={busy && route === "plan" ? "Planning..." : "Plan"} cost={expectedTokens} disabled={busy || !prompt.trim()} />
                <RouteButton active={route === "direct"} onClick={() => submitRoute("direct")} icon={<Wand2 size={12} />} label={busy && route === "direct" ? "Directing..." : "Direct"} cost={expectedTokens} disabled={busy || !prompt.trim()} />
              </div>
            </div>
            {buildMutation.error ? <p className="mx-2 mb-2 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">{(buildMutation.error as Error).message}</p> : null}
            {lowTokens ? <button type="button" onClick={() => setPlansOpen(true)} className="mx-2 mb-2 w-[calc(100%-1rem)] rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-left text-[10px] text-amber-100">Low credits. Upgrade.</button> : null}
          </form>
        </div>
      </section>

      {settingsOpen ? <SettingsModal close={() => setSettingsOpen(false)} taskType={taskType} setTaskType={setTaskType} durationSeconds={durationSeconds} setDurationSeconds={setDurationSeconds} platform={platform} setPlatform={setPlatform} style={style} setStyle={setStyle} pace={pace} setPace={setPace} realism={realism} setRealism={setRealism} audience={audience} setAudience={setAudience} heroSubject={heroSubject} setHeroSubject={setHeroSubject} location={location} setLocation={setLocation} /> : null}
      {personaOpen ? <PersonaModal close={() => setPersonaOpen(false)} /> : null}
      {planEditOpen ? <PlanModal text={fullPlanText} setText={setFullPlanText} close={() => setPlanEditOpen(false)} apply={applyFullPlanEdit} /> : null}
      {authOpen ? <AuthModal mode={authOpen} close={() => setAuthOpen(null)} submit={(input) => authMutation.mutate(input)} pending={authMutation.isPending} error={authMutation.error as Error | null} /> : null}
      {plansOpen ? (
        <PlansModal
          close={() => setPlansOpen(false)}
          plans={pricingPlans}
          balance={balance}
          pendingPlanKey={subscribeMutation.variables}
          isPending={subscribeMutation.isPending || paymentMutation.isPending}
          error={(subscribeMutation.error || paymentMutation.error) as Error | null}
          subscribe={(planKey) => subscribeMutation.mutate(planKey)}
          submitManualPayment={(planKey, transactionId) => paymentMutation.mutate({ planKey, transactionId })}
          onCoupon={() => setCouponOpen(true)}
        />
      ) : null}
      {couponOpen ? <CouponModal close={() => setCouponOpen(false)} couponCode={couponCode} setCouponCode={setCouponCode} purchaseCredits={couponPurchaseCredits} setPurchaseCredits={setCouponPurchaseCredits} isPending={couponMutation.isPending} error={couponMutation.error as Error | null} redeem={() => couponMutation.mutate({ code: couponCode, purchaseCredits: couponPurchaseCredits })} /> : null}
      {toast ? <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-xl"><Check size={14} /> {toast}</div> : null}
    </main>
  );
}

function Header({ session, balance, expectedTokens, lowTokens, onSettings, onPersona, onPlans, onLogin, onSignup, onLogout }: { session: UserSession; balance: number; expectedTokens: number; lowTokens: boolean; onSettings: () => void; onPersona: () => void; onPlans: () => void; onLogin: () => void; onSignup: () => void; onLogout: () => void }) {
  const pct = balance ? Math.min(100, Math.round((balance / Math.max(balance, expectedTokens)) * 100)) : 0;
  const signedIn = isSignedInSession(session);
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-[#0d1117]/90 backdrop-blur-xl">
      <div className="flex h-[60px] w-full items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-950/40">
            <Wand2 size={16} />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">Saar</h1>
            <p className="mt-1 text-[10px] text-slate-500">AI video prep</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPlans} className={`hidden rounded-xl border px-3 py-1.5 text-left text-[10px] sm:block ${lowTokens ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-white/5"}`}>
            <div className="flex items-center gap-2"><b className="text-white">{balance.toLocaleString()}</b><span className="text-slate-600">/ {expectedTokens}</span></div>
          </button>
          <button onClick={onPersona} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-white/10"><User className="mr-1.5 inline" size={14} />Persona</button>
          <button onClick={onSettings} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-white/10"><Settings className="mr-1.5 inline" size={14} />Settings</button>
          <button onClick={onPlans} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"><Plus className="mr-1.5 inline" size={14} />Credits</button>
          {signedIn ? (
            <button onClick={onLogout} className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-left text-xs font-medium text-slate-200 hover:bg-white/10 md:px-4">
              <span className="block max-w-36 truncate">{session.name || session.userId}</span>
              <span className="block text-[10px] text-slate-500">Logout</span>
            </button>
          ) : (
            <>
              <button onClick={onLogin} className="inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 md:px-4"><LogIn className="mr-1.5" size={14} />Login</button>
              <button onClick={onSignup} className="inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 md:px-4"><UserPlus className="mr-1.5" size={14} />Sign up</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ProjectSidebar({ projects, jobs, selectedProjectId, onOpenProject, onNew, onPlans }: { projects: Project[]; jobs: Job[]; selectedProjectId: string | null; onOpenProject: (item: Project) => void; onNew: () => void; onPlans: () => void }) {
  return (
    <aside className="flex h-full w-[260px] min-w-[260px] flex-col border-r border-white/10 bg-slate-950/70 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Workspace</p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-200">Projects</h2>
        </div>
        <button onClick={onNew} className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="New project">
          <Plus size={14} />
        </button>
      </div>

      <button onClick={onPlans} className="mb-4 flex w-full items-center justify-between rounded-xl border border-violet-500/20 bg-violet-600/10 px-3 py-2 text-left hover:bg-violet-600/20">
        <span className="flex-1 truncate">
          <span className="block text-xs font-semibold text-violet-100">Upgrade</span>
        </span>
        <ChevronRight className="text-violet-300" size={14} />
      </button>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <SectionLabel>Recent</SectionLabel>
        {projects.length ? projects.map((project) => (
          <button key={project.id} onClick={() => onOpenProject(project)} className={`group relative w-full rounded-xl border p-2.5 text-left transition ${project.id === selectedProjectId ? "border-violet-500/40 bg-violet-600/15" : "border-white/10 bg-white/[.02] hover:bg-white/[.05]"}`}>
            <div className="flex items-start gap-2">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${project.status === "Ready" ? "bg-emerald-500" : "bg-amber-500"}`}></span>
              <span className="line-clamp-2 text-xs font-medium text-slate-300">{project.title}</span>
            </div>
          </button>
        )) : <p className="rounded-xl border border-dashed border-white/10 p-3 text-[10px] leading-relaxed text-slate-600">No projects yet.</p>}
      </div>

      <div className="mt-4 shrink-0 space-y-2 border-t border-white/5 pt-4">
        <SectionLabel>Videos</SectionLabel>
        {jobs.length ? jobs.slice(0, 3).map((job) => (
          <div key={job.id} className="rounded-lg border border-white/10 bg-white/[.02] p-2">
            <p className="line-clamp-1 text-[10px] font-medium text-slate-400">{job.prompt}</p>
          </div>
        )) : <p className="text-[10px] text-slate-700">No renders yet.</p>}
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

function OutputMessage({
  message,
  isSelected,
  onSelect,
  revisionDraft,
  setRevisionDraft,
  onReviseFullPlan,
  approveAll,
  copyPacket,
  generateDirectVideo,
  generatePlanVideo,
  revisePlanScene,
  revisePlanKeyframe,
}: {
  message: OutputMessageItem;
  isSelected: boolean;
  onSelect: () => void;
  revisionDraft: Record<string, string>;
  setRevisionDraft: (value: Record<string, string>) => void;
  onReviseFullPlan: () => void;
  approveAll: (message: OutputMessageItem) => void;
  copyPacket: (packet: Record<string, unknown> | null) => void;
  generateDirectVideo: (message: OutputMessageItem) => void;
  generatePlanVideo: (message: OutputMessageItem) => void;
  revisePlanScene: (message: OutputMessageItem, sceneId: string, patch: Partial<ScenePlan>) => void;
  revisePlanKeyframe: (message: OutputMessageItem, keyframeId: string, patch: Partial<Keyframe>) => void;
}) {
  return (
    <article className="space-y-2 cursor-pointer" onClick={onSelect}>
      <div className="ml-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm leading-6 text-slate-200">
        {message.prompt}
      </div>
      <OutputPanel
        route={message.route}
        scenes={message.scenes}
        keyframes={message.keyframes}
        packet={message.packet}
        packetResult={message.packetResult}
        allReady={message.allReady}
        renderJob={message.renderJob || null}
        renderPending={Boolean(message.renderPending)}
        renderError={message.renderError || null}
        revisionDraft={revisionDraft}
        setRevisionDraft={setRevisionDraft}
        updateScene={(sceneId, patch) => revisePlanScene(message, sceneId, patch)}
        updateKeyframe={(keyframeId, patch) => revisePlanKeyframe(message, keyframeId, patch)}
        setPlanEditOpen={(open) => {
          if (open) onReviseFullPlan();
        }}
        approveAll={() => approveAll(message)}
        copyPacket={copyPacket}
        generateDirectVideo={() => generateDirectVideo(message)}
        generatePlanVideo={() => generatePlanVideo(message)}
      />
    </article>
  );
}

function VideoOutputMessage({ job }: { job: Job }) {
  const playbackUrl = getJobPlaybackUrl(job);
  return (
    <article className="space-y-3">
      <div className="ml-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm leading-6 text-slate-200">
        {job.prompt}
      </div>
      <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{playbackUrl ? "Video output" : job.task_type.replaceAll("_", " ")}</h2>
            <p className="mt-1 text-xs text-slate-600">{job.status}</p>
          </div>
          <StatusBadge status={job.status === "completed" ? "approved" : job.status === "failed" ? "needs_revision" : "draft"} />
        </div>
        <JobPlayback job={job} />
      </section>
    </article>
  );
}

function JobPlayback({ job, pending = false, error }: { job?: Job | null; pending?: boolean; error?: string | null }) {
  const playbackUrl = job ? getJobPlaybackUrl(job) : "";
  if (playbackUrl) {
    return <video className="w-full rounded-xl border border-white/10 bg-black" controls playsInline src={playbackUrl} />;
  }
  if (error || job?.error || job?.status === "failed") {
    return <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error || job?.error || "Video generation failed."}</p>;
  }
  if (pending || isProcessingJob(job)) {
    return <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-500">Processing video: {job?.status || "starting"}</p>;
  }
  return <p className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-slate-500">Video placeholder: no playback URL has been returned yet.</p>;
}

function OutputPanel(props: {
  route: RouteMode;
  scenes: ScenePlan[];
  keyframes: Keyframe[];
  packet: Record<string, unknown> | null;
  packetResult: IntelligencePacket | null;
  allReady: boolean;
  renderJob?: Job | null;
  renderPending?: boolean;
  renderError?: string | null;
  revisionDraft: Record<string, string>;
  setRevisionDraft: (value: Record<string, string>) => void;
  updateScene: (sceneId: string, patch: Partial<ScenePlan>) => void;
  updateKeyframe: (keyframeId: string, patch: Partial<Keyframe>) => void;
  setPlanEditOpen: (value: boolean) => void;
  approveAll: () => void;
  copyPacket: (packet: Record<string, unknown> | null) => void;
  generateDirectVideo?: () => void;
  generatePlanVideo?: () => void;
}) {
  const canApproveAll = props.scenes.length > 0 && props.keyframes.length > 0 && !props.scenes.some((item) => item.status === "needs_revision") && !props.keyframes.some((item) => item.status === "needs_revision");
  const planReady = isPlanReady(props.scenes, props.keyframes);
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
            {props.route === "plan" ? <button onClick={() => props.setPlanEditOpen(true)} className="btn-subtle"><Edit3 size={14} /> Revise Full Plan</button> : null}
            <button onClick={() => props.copyPacket(props.packet)} className="btn-subtle"><Copy size={14} /> Copy packet</button>
            {props.route === "plan" && canApproveAll ? <button onClick={props.approveAll} className="btn-primary-dark"><CheckCircle2 size={15} /> Approve all</button> : null}
            {props.route === "plan" && planReady ? (
              <button onClick={props.generatePlanVideo} disabled={props.renderPending || Boolean(props.renderJob && !["failed", "cancelled"].includes(props.renderJob.status))} className="btn-primary-dark disabled:opacity-50">
                {props.renderPending ? <RefreshCw className="animate-spin" size={15} /> : <Film size={15} />}
                {props.renderJob && getJobPlaybackUrl(props.renderJob) ? "Video ready" : props.renderPending ? "Starting..." : "Generate Video"}
              </button>
            ) : null}
            {props.route === "direct" ? (
              <button onClick={props.generateDirectVideo} disabled={props.renderPending || Boolean(props.renderJob && !["failed", "cancelled"].includes(props.renderJob.status))} className="btn-primary-dark disabled:opacity-50">
                {props.renderPending ? <RefreshCw className="animate-spin" size={15} /> : <Film size={15} />}
                {props.renderJob && getJobPlaybackUrl(props.renderJob) ? "Video ready" : props.renderPending ? "Starting..." : "Generate Video"}
              </button>
            ) : null}
          </div>
        </div>

        {props.packetResult ? (
          <div className="grid gap-3 border-b border-white/5 px-5 py-4 md:grid-cols-3">
            <MetricCard label="Pre-generation cost" value={`${props.packetResult.required_credits || 0} credits`} />
            <MetricCard label="Debited" value={`${props.packetResult.debited_credits || 0} credits`} />
            <MetricCard label="Quality gate" value={props.packetResult.quality_gate.passed ? "passed" : "needs review"} warn={!props.packetResult.quality_gate.passed} />
          </div>
        ) : null}

        {props.route === "plan" ? (
          <div className="p-5">
            <div className="mb-4">
              <SectionLabel>Visual Script - Scene Breakdown</SectionLabel>
            </div>
            <div className="space-y-3">
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
              <details className="mt-5 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-violet-200"><Sparkles size={16} className="mr-2 inline" /> View full video prompt</summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{asString(props.packetResult.final_video_prompt)}</p>
              </details>
            ) : null}
            {props.renderJob || props.renderError || props.renderPending ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-4">
                <JobPlayback job={props.renderJob} pending={props.renderPending} error={props.renderError} />
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <PacketView packet={props.packet} />
            {props.renderJob || props.renderError || props.renderPending ? (
              <div className="border-t border-white/5 p-5">
                <JobPlayback job={props.renderJob} pending={props.renderPending} error={props.renderError} />
              </div>
            ) : null}
          </>
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
  const [sceneDraft, setSceneDraft] = useState({ action: scene.action, camera: scene.camera, motion: scene.motion, lighting: scene.lighting });

  useEffect(() => setSceneDraft({ action: scene.action, camera: scene.camera, motion: scene.motion, lighting: scene.lighting }), [scene.action, scene.camera, scene.motion, scene.lighting]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[.03] overflow-hidden">
      <div className="grid gap-0 grid-cols-[140px_1fr]">
        {/* Image Column */}
        <div className="bg-gradient-to-br from-slate-900 via-violet-950/40 to-slate-950 flex items-center justify-center aspect-square md:aspect-auto">
          {keyframe?.image_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={keyframe.image_path} alt={scene.title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-slate-500 p-2">
              <FileImage className="mx-auto mb-1 text-violet-300" size={20} />
              <p className="text-[10px]">No image</p>
            </div>
          )}
        </div>

        {/* Content Column */}
        <div className="p-3 flex flex-col min-h-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-violet-400 bg-violet-600/20 px-1.5 py-0.5 rounded">S{sceneNumber}</span>
                <StatusBadge status={scene.status} />
              </div>
              <h3 className="mt-0.5 text-sm font-semibold text-slate-100 truncate">{scene.title}</h3>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditingScene((v) => !v)} className="icon-btn p-1" title="Edit scene">
                <Edit3 size={11} />
              </button>
              <button onClick={() => updateScene(scene.id, { status: "approved" })} className="icon-btn p-1 text-emerald-300" title="Approve">
                <Check size={11} />
              </button>
            </div>
          </div>

          {editingScene ? (
            <div className="mb-2">
              <textarea
                value={sceneDraft.action}
                onChange={(e) => setSceneDraft((current) => ({ ...current, action: e.target.value }))}
                rows={2}
                className="field-area text-[11px] mb-1.5 p-1.5"
                placeholder="Description"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input className="modal-input h-7 px-2 text-[11px]" value={sceneDraft.camera} onChange={(event) => setSceneDraft((current) => ({ ...current, camera: event.target.value }))} placeholder="Camera" />
                <input className="modal-input h-7 px-2 text-[11px]" value={sceneDraft.motion} onChange={(event) => setSceneDraft((current) => ({ ...current, motion: event.target.value }))} placeholder="Motion" />
              </div>
              <button
                onClick={() => {
                  updateScene(scene.id, sceneDraft);
                  setEditingScene(false);
                }}
                className="mt-1.5 rounded-lg bg-violet-600 px-2 py-1 text-[10px] font-semibold hover:bg-violet-500"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="mb-2 space-y-0.5 text-[11px] leading-tight text-slate-400">
              <p className="line-clamp-2 text-slate-300">{scene.action}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                <p><span className="text-slate-600">📷</span> {scene.camera}</p>
                <p><span className="text-slate-600">🎬</span> {scene.motion}</p>
              </div>
            </div>
          )}

          {/* Image & Description Controls */}
          {keyframe && (
            <div className="mt-auto pt-2 border-t border-white/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-slate-600">Keyframe</span>
                <button onClick={() => setEditingImage((v) => !v)} className="text-[10px] text-violet-400 hover:text-violet-300">
                  {editingImage ? "Close" : "Edit prompt"}
                </button>
              </div>
              {editingImage ? (
                <div>
                  <textarea
                    value={draft || keyframe.image_prompt}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    className="field-area text-[10px] mb-1.5 p-1.5"
                  />
                  <button
                    onClick={() => {
                      updateKeyframe(keyframe.keyframe_id, { image_prompt: draft || keyframe.image_prompt });
                      setEditingImage(false);
                    }}
                    className="btn-subtle h-6 px-2 text-[10px]"
                  >
                    <RefreshCw size={10} className="mr-1" /> Regenerate
                  </button>
                </div>
              ) : (
                <p className="text-[10px] leading-relaxed text-slate-500 line-clamp-2 italic">{keyframe.image_prompt}</p>
              )}
            </div>
          )}
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
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const isSignup = mode === "signup";
  return (
    <Modal title={isSignup ? "Create account" : "Login"} subtitle="Enter your user ID to continue. Local demo auth creates a session for this browser." close={close}>
      {isSignup ? <input className="modal-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name" /> : null}
      <input className="modal-input" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="User ID (e.g. demo-user)" />
      {error ? <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error.message}</p> : null}
      <button disabled={pending || !userId.trim()} onClick={() => submit({ mode, userId: userId.trim(), name: name.trim() })} className="modal-done disabled:opacity-50">
        {pending ? "Working..." : isSignup ? "Create demo account" : "Login"}
      </button>
    </Modal>
  );
}

function PlansModal({
  close,
  plans,
  balance,
  pendingPlanKey,
  isPending,
  error,
  subscribe,
  submitManualPayment,
  onCoupon,
}: {
  close: () => void;
  plans: PricingPlan[];
  balance: number;
  pendingPlanKey?: string;
  isPending: boolean;
  error: Error | null;
  subscribe: (planKey: string) => void;
  submitManualPayment: (planKey: string, transactionId: string) => void;
  onCoupon: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [transactionId, setTransactionId] = useState("");

  return (
    <Modal title="Plans and credits" subtitle="Choose a plan. You can pay instantly via mock checkout (for testing) or manually via eSewa." close={close}>
      {!selectedPlan ? (
        <>
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/[.04] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600"><CreditCard size={14} /> Current balance</p>
            <p className="mt-1 text-2xl font-semibold">{balance.toLocaleString()} credits</p>
          </div>

          <div className="mb-4">
            <button onClick={onCoupon} className="w-full rounded-lg border border-violet-500/50 bg-violet-600/20 px-4 py-3 text-sm font-semibold text-violet-200 transition hover:bg-violet-600/30">
              <Sparkles size={14} className="mr-2 inline" /> Redeem coupon
            </button>
          </div>

          <div className="space-y-3">
            {(plans.length ? plans : fallbackPlans()).map((plan) => (
              <button key={plan.key} onClick={() => setSelectedPlan(plan)} className="w-full rounded-2xl border border-white/10 bg-white/[.04] p-4 text-left transition hover:border-violet-500/50 hover:bg-violet-600/10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-white">{plan.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{plan.credits.toLocaleString()} credits</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold text-white">NPR {plan.price_npr.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-violet-300">View payment options</p>
                  </div>
                </div>
                {plan.features?.length ? <p className="mt-3 text-xs leading-5 text-slate-600">{plan.features.slice(0, 3).join(" • ")}</p> : null}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelectedPlan(null)} className="text-xs text-slate-500 hover:text-white">← Back to plans</button>
          <div className="rounded-2xl border border-violet-500/30 bg-violet-600/10 p-4">
            <h3 className="font-semibold text-white">{selectedPlan.name} Plan</h3>
            <p className="text-sm text-slate-400">NPR {selectedPlan.price_npr.toLocaleString()} for {selectedPlan.credits.toLocaleString()} credits</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5 text-center">
            <p className="mb-4 text-sm font-medium text-slate-300">Scan to pay with eSewa</p>
            <div className="mx-auto mb-4 aspect-square w-48 overflow-hidden rounded-xl border border-white/10 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/esewa-qr.jpg" alt="eSewa QR Code" className="h-full w-full object-contain" />
            </div>
            <p className="text-sm text-slate-400">eSewa Number: <b className="text-white">9843858863</b></p>
            <p className="mt-2 text-[11px] text-slate-500">Please send exactly NPR {selectedPlan.price_npr.toLocaleString()}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-600">Transaction ID / Reference</label>
              <input className="modal-input" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="Enter eSewa transaction ID" />
            </div>
            <button disabled={isPending || !transactionId.trim()} onClick={() => submitManualPayment(selectedPlan.key, transactionId)} className="modal-done disabled:opacity-50">
              {isPending ? "Submitting..." : "Submit for verification"}
            </button>
            <p className="text-center text-[11px] leading-5 text-slate-500">Your plan will be manually verified and activated within 24 hours.</p>
            
            <div className="border-t border-white/10 pt-4">
              <p className="mb-3 text-center text-xs text-slate-600">OR pay instantly for testing</p>
              <button disabled={isPending} onClick={() => subscribe(selectedPlan.key)} className="w-full rounded-xl border border-white/10 bg-white/[.04] py-3 text-xs font-semibold hover:bg-white/10">
                {isPending && pendingPlanKey === selectedPlan.key ? "Adding..." : "Instant Mock Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}
      {error ? <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error.message}</p> : null}
      <button onClick={close} className="modal-done">Done</button>
    </Modal>
  );
}

function CouponModal({ close, couponCode, setCouponCode, purchaseCredits, setPurchaseCredits, isPending, error, redeem }: { close: () => void; couponCode: string; setCouponCode: (value: string) => void; purchaseCredits: number; setPurchaseCredits: (value: number) => void; isPending: boolean; error: Error | null; redeem: () => void }) {
  return (
    <Modal title="Redeem coupon" subtitle="Free coupons add credits directly. Bonus coupons use purchased credits to calculate the extra credits." close={close}>
      <input className="modal-input uppercase" value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Coupon code" />
      <label className="mb-3 block">
        <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-600">Purchased credits for bonus coupons</span>
        <input className="modal-input" type="number" min={0} value={purchaseCredits} onChange={(event) => setPurchaseCredits(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      {error ? <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error.message}</p> : null}
      <button disabled={isPending || !couponCode.trim()} onClick={redeem} className="modal-done disabled:opacity-50">
        {isPending ? "Redeeming..." : "Redeem"}
      </button>
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

function RouteButton({ active, onClick, icon, label, cost, disabled = false }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; cost: number; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50 ${active ? "border-violet-500/50 bg-violet-600/20 text-violet-100" : "border-white/15 bg-white/[.03] text-slate-300 hover:bg-white/10"}`}>{icon}{label}<span className="text-xs opacity-50">{cost}</span></button>;
}

function AttachmentPill({ item, remove }: { item: Attachment; remove: () => void }) {
  const Icon = item.type.startsWith("image/") ? FileImage : item.type.startsWith("video/") ? FileVideo : FileText;
  return <span className="inline-flex max-w-[260px] items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-300"><Icon size={14} /><span className="truncate">{item.name}</span>{item.asset ? <span className="text-emerald-300">uploaded</span> : item.uploadError ? <span className="text-red-300">failed</span> : null}<button type="button" onClick={remove} className="text-slate-600 hover:text-white"><X size={13} /></button></span>;
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
    motion: asString(row.motion, "single controlled motion; no fast cuts"),
    lighting: asString(row.lighting, "soft natural directional light"),
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
    image_status: asString(row.image_status, "placeholder"),
    image_mode: asString(row.image_mode, "local_placeholder"),
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
    motion: scene.motion,
    lighting: scene.lighting,
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
  if (patch.motion !== undefined) result.motion = patch.motion;
  if (patch.lighting !== undefined) result.lighting = patch.lighting;
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
  return scenes.map((scene, index) => `${index + 1}. ${scene.title}\nDuration: ${scene.duration}\nAction: ${scene.action}\nCamera: ${scene.camera}\nMotion: ${scene.motion}\nLighting: ${scene.lighting}\nReference: ${scene.referencePrompt}`).join("\n\n");
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
      motion: lines.find((line) => line.startsWith("Motion:"))?.replace("Motion:", "").trim() || existing?.motion || "single controlled motion",
      lighting: lines.find((line) => line.startsWith("Lighting:"))?.replace("Lighting:", "").trim() || existing?.lighting || "soft natural directional light",
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

function createPreviewGenerationPacket(input: { route: RouteMode; prompt: string; scenes: ScenePlan[]; keyframes: Keyframe[]; settings: Record<string, unknown>; userBalance?: number | null }): IntelligencePacket {
  const scenePlan = input.scenes.map(sceneToApi);
  const keyframePlan = input.keyframes.map(keyframeToApi);
  const finalVideoPrompt = input.scenes.length ? renderPlanText(input.scenes) : input.prompt;
  return {
    packet: {
      source: "preview",
      route: input.route === "plan" ? "generate_plan" : "direct_video",
      raw_prompt: input.prompt,
      settings: input.settings,
      scene_plan: scenePlan,
      keyframes: keyframePlan,
      final_video_prompt: finalVideoPrompt,
      status: "preview_only",
    },
    quality_gate: { passed: false, checks: {}, recommendations: ["Preview packet only. Generate a backend intelligence packet before video generation."] },
    scene_plan: scenePlan,
    reference_images: [],
    keyframes: keyframePlan,
    final_video_prompt: finalVideoPrompt,
    required_credits: 0,
    debited_credits: 0,
    user_balance: input.userBalance ?? null,
  };
}

function compactMessageSettings(message: OutputMessageItem) {
  const packetSettings = (message.packet?.settings || {}) as Record<string, unknown>;
  return {
    style: asString(packetSettings.style),
    platform: asString(packetSettings.platform),
    pace: asString(packetSettings.pace),
    realism: asString(packetSettings.realism),
    audience: asString(packetSettings.audience),
    hero_subject: asString(packetSettings.hero_subject),
    location: asString(packetSettings.location),
    duration: `${message.durationSeconds} seconds`,
    duration_seconds: message.durationSeconds,
    task_type: message.taskType,
    quality: message.quality,
  };
}

function compactAssetRefs(items: Attachment[]) {
  return items.map((item) => ({
    id: item.asset?.asset_id || null,
    public_url: item.asset?.public_url || null,
    r2_key: item.asset?.r2_key || null,
    name: item.name,
    type: item.type,
    size: item.size,
  }));
}

function assertUploadsReady(items: Attachment[]) {
  const failed = items.find((item) => item.uploadError || !item.asset?.asset_id);
  if (failed) {
    throw new Error(`Upload failed for ${failed.name}. Please remove it or try again.`);
  }
}

function mergeSceneRevision(originalScenes: ScenePlan[], backendScenes: ScenePlan[], targetSceneId: string, localScenes: ScenePlan[]) {
  return originalScenes.map((scene) => {
    if (scene.id !== targetSceneId) return scene;
    return backendScenes.find((item) => item.id === targetSceneId) || localScenes.find((item) => item.id === targetSceneId) || scene;
  });
}

function mergeKeyframeSceneRevision(originalKeyframes: Keyframe[], backendKeyframes: Keyframe[], targetSceneId: string) {
  return originalKeyframes.map((keyframe) => {
    if (keyframe.scene_id !== targetSceneId) return keyframe;
    return backendKeyframes.find((item) => item.keyframe_id === keyframe.keyframe_id) || keyframe;
  });
}

function mergeKeyframeRevision(originalKeyframes: Keyframe[], backendKeyframes: Keyframe[], targetKeyframeId: string, localKeyframes: Keyframe[]) {
  return originalKeyframes.map((keyframe) => {
    if (keyframe.keyframe_id !== targetKeyframeId) return keyframe;
    return backendKeyframes.find((item) => item.keyframe_id === targetKeyframeId) || localKeyframes.find((item) => item.keyframe_id === targetKeyframeId) || keyframe;
  });
}

function isPlanReady(scenes: ScenePlan[], keyframes: Keyframe[]) {
  return scenes.length > 0 && scenes.every((scene) => scene.status === "approved" || scene.status === "locked") && keyframes.length > 0 && keyframes.every((keyframe) => keyframe.status === "approved" || keyframe.status === "locked");
}

function requireBackendGenerationPacket(message: OutputMessageItem) {
  if (message.packetSource !== "backend" || !message.packetResult?.packet) {
    throw new Error("Backend generation packet is required before starting video generation.");
  }
  return message.packetResult.packet;
}

function compactPlanPacket(message: OutputMessageItem, backendPacket: Record<string, unknown>) {
  return {
    final_prompt: asString(backendPacket.final_video_prompt, message.packetResult.final_video_prompt || message.prompt),
    platform: asString((backendPacket.settings as { platform?: unknown } | undefined)?.platform),
    backend_packet: compactBackendPacketForJob(backendPacket),
    approved_plan: {
      scenes: message.scenes.map((scene, index) => ({
        id: scene.id,
        scene_number: index + 1,
        title: scene.title,
        duration: scene.duration,
        description: scene.action,
        camera: scene.camera,
        motion: scene.motion,
        lighting: scene.lighting,
        reference_image_prompt: scene.referencePrompt,
      })),
    },
    approved_keyframes: message.keyframes.map((keyframe) => ({
      keyframe_id: keyframe.keyframe_id,
      scene_id: keyframe.scene_id,
      timestamp: keyframe.timestamp,
      description: keyframe.description,
      image_prompt: keyframe.image_prompt,
      negative_prompt: keyframe.negative_prompt,
    })),
  };
}

function compactDirectPacket(backendPacket: Record<string, unknown>, result: IntelligencePacket) {
  const source = backendPacket;
  return {
    route: asString(source.route, "direct_video"),
    refined_prompt: asString(source.refined_prompt),
    final_video_prompt: asString(source.final_video_prompt, result.final_video_prompt),
    final_prompt: asString(source.final_prompt, asString(source.final_video_prompt, result.final_video_prompt)),
    negative_prompt: asString(source.negative_prompt),
    quality_gate_passed: Boolean((source.quality_gate as { passed?: unknown } | undefined)?.passed ?? result.quality_gate?.passed),
    platform: asString((source.settings as { platform?: unknown } | undefined)?.platform),
    duration_seconds: Number((source.settings as { duration_seconds?: unknown } | undefined)?.duration_seconds || 6),
    style: asString((source.settings as { style?: unknown } | undefined)?.style),
    hero_subject: asString((source.settings as { hero_subject?: unknown } | undefined)?.hero_subject),
    backend_packet: compactBackendPacketForJob(source),
  };
}

function compactBackendPacketForJob(packet: Record<string, unknown>) {
  return {
    route: asString(packet.route),
    status: asString(packet.status),
    refined_prompt: asString(packet.refined_prompt),
    final_video_prompt: asString(packet.final_video_prompt),
    negative_constraints: Array.isArray(packet.negative_constraints) ? packet.negative_constraints : [],
    quality_gate: packet.quality_gate || {},
    active_context: compactPacketContext(packet.active_context),
    brief: compactPacketContext(packet.brief),
  };
}

function compactPacketContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return {
    subject_lock: source.subject_lock,
    continuity_rules: source.continuity_rules,
    hard_constraints: source.hard_constraints,
    brand_rules: source.brand_rules,
    asset_summary: source.asset_summary,
  };
}

function getJobPlaybackUrl(job?: Job | null) {
  if (!job) return "";
  return job.video_url || job.output_url || job.playbackUrl || job.cloudflareUrl || "";
}

function isProcessingJob(job?: Job | null) {
  return Boolean(job && ["queued", "running", "submitted", "uploading"].includes(job.status));
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
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") return randomUUID.call(globalThis.crypto);
  const randomPart = Math.random().toString(36).slice(2);
  return `${Date.now()}-${randomPart}`;
}

function inferFileType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
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
