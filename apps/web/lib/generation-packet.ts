export type RouteType = "direct_video" | "generate_plan";

export type VideoSettings = {
  task: "Text to video" | "Image to video" | "Video to video";
  platform: "Facebook Reel" | "Instagram Reel" | "TikTok" | "YouTube Shorts";
  length: "6 sec" | "10 sec" | "15 sec";
  resolution: "720p draft" | "1080p" | "4K premium";
  style: "Luxury" | "Streetwear" | "Minimal" | "Cinematic" | "Product-focused";
  pace: "Slow" | "Medium" | "Fast";
  realism: "Natural" | "Hyper-real" | "Stylised";
};

export type RawAsset = {
  id: string;
  name: string;
  type: string;
  url?: string;
  file?: File;
  role?: "product_reference" | "style_reference" | "motion_reference" | "start_frame" | "end_frame" | "brand_file" | "supporting_file";
};

export type AnalysedAsset = RawAsset & {
  analysis: {
    kind: "image" | "video" | "file" | "url" | "unknown";
    compactSummary: string;
    colourCodes: string[];
    productDetails: string[];
    logoDetails: string[];
    materialDetails: string[];
    faceDetails: string[];
    motionDetails: string[];
    cameraDetails: string[];
    lightingDetails: string[];
    styleTags: string[];
  };
};

export type MemoryRule = {
  id: string;
  type: "brand_rule" | "negative_preference" | "approved_pattern" | "failure_memory" | "user_preference" | "persona_rule" | "reference_lock";
  rule: string;
  confidence: number;
  priority: "critical" | "high" | "medium" | "low";
  appliesTo: string[];
  createdAt: string;
};

export type UserMemory = {
  userId: string;
  longTermPreferences: {
    preferredStyle?: string;
    preferredPace?: string;
    preferredRealism?: string;
    preferredPlatform?: string;
    preferredAudience?: string;
  };
  rules: MemoryRule[];
};

export type ClientScenePlan = {
  id: string;
  order: number;
  timestamp: string;
  title: string;
  description: string;
  camera: string;
  lighting: string;
  motion: string;
  subjectAction: string;
  imagePrompt: string;
  negativePrompt: string;
  status: "draft" | "approved" | "needs_revision";
  referenceImageUrl?: string;
};

export type GenerationPacket = {
  userId: string;
  route: RouteType;
  rawPrompt: string;
  settings: VideoSettings;
  analysedAssets: AnalysedAsset[];
  activeContext: {
    subject: string;
    location: string;
    audience: string;
    compactAssetContext: string;
    colourCodes: string[];
    mustPreserve: string[];
    memoryUsed: string[];
    negativeConstraints: string[];
  };
  strategy: {
    mode: "text_to_video" | "image_to_video" | "video_to_video" | "first_last_frame";
    reason: string;
    draftFirst: boolean;
    generateKeyframesFirst: boolean;
    splitIntoClips: boolean;
  };
  scenePlan: ClientScenePlan[];
  finalPrompt: string;
  negativePrompt: string;
  tokenBudget: {
    estimatedTokens: number;
    maxAllowedTokens: number;
    withinBudget: boolean;
    compressionApplied: boolean;
  };
  cloudflareVideo?: {
    status: "queued" | "processing" | "ready" | "failed";
    playbackUrl?: string;
    thumbnailUrl?: string;
  };
  readyForVideoGenerator: boolean;
};

const DEFAULT_NEGATIVES = [
  "no shaky camera",
  "no logo distortion",
  "no random text",
  "no flicker",
  "no colour shift",
  "no hand deformation",
  "no face morphing",
  "no product morphing",
  "no cluttered background",
  "no unrealistic plastic skin",
];

export function safeId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function createGenerationPacket(params: {
  userId: string;
  route: RouteType;
  rawPrompt: string;
  settings: VideoSettings;
  memory: UserMemory;
  assets: RawAsset[];
  maxAllowedTokens?: number;
}): Promise<GenerationPacket> {
  const analysedAssets = await analyseAssets(params.assets);
  const subject = inferSubject(params.rawPrompt, analysedAssets);
  const location = inferLocation(params.rawPrompt);
  const audience = inferAudience(params.rawPrompt, params.settings);
  const memoryUsed = distilMemory(params.memory, params.rawPrompt, params.settings);
  const colourCodes = unique(analysedAssets.flatMap((asset) => asset.analysis.colourCodes));
  const mustPreserve = unique([
    `identity of ${subject}`,
    "exact product shape and silhouette",
    "material texture",
    "lighting direction",
    ...colourCodes.map((colour) => `colour ${colour}`),
    ...analysedAssets.flatMap((asset) => asset.analysis.productDetails),
    ...analysedAssets.flatMap((asset) => asset.analysis.logoDetails),
    ...analysedAssets.flatMap((asset) => asset.analysis.materialDetails),
    ...analysedAssets.flatMap((asset) => asset.analysis.faceDetails),
  ]).slice(0, 14);
  const negativeConstraints = unique([...DEFAULT_NEGATIVES, ...memoryUsed.filter((rule) => /avoid|no|never|do not/i.test(rule))]).slice(0, 16);
  const compactAssetContext = analysedAssets.map((asset) => asset.analysis.compactSummary).join(" | ");
  const strategy = chooseStrategy(params.settings, analysedAssets, params.rawPrompt);
  const scenePlan = params.route === "generate_plan" ? createScenePlan({ settings: params.settings, subject, location, mustPreserve, negativeConstraints }) : [];
  const finalPromptRaw = buildFinalPrompt({
    rawPrompt: params.rawPrompt,
    settings: params.settings,
    subject,
    location,
    audience,
    compactAssetContext,
    strategy,
    scenePlan,
    mustPreserve,
    memoryUsed,
    negativeConstraints,
  });
  const maxAllowedTokens = params.maxAllowedTokens ?? 2400;
  const estimatedTokens = estimateTokens(finalPromptRaw);
  const withinBudget = estimatedTokens <= maxAllowedTokens;
  const finalPrompt = withinBudget ? finalPromptRaw : compressPrompt({ subject, location, settings: params.settings, compactAssetContext, mustPreserve, negativeConstraints });

  return {
    userId: params.userId,
    route: params.route,
    rawPrompt: params.rawPrompt,
    settings: params.settings,
    analysedAssets,
    activeContext: {
      subject,
      location,
      audience,
      compactAssetContext,
      colourCodes,
      mustPreserve,
      memoryUsed,
      negativeConstraints,
    },
    strategy,
    scenePlan,
    finalPrompt,
    negativePrompt: negativeConstraints.join(", "),
    tokenBudget: {
      estimatedTokens: estimateTokens(finalPrompt),
      maxAllowedTokens,
      withinBudget: estimateTokens(finalPrompt) <= maxAllowedTokens,
      compressionApplied: !withinBudget,
    },
    readyForVideoGenerator: true,
  };
}

export async function analyseAssets(assets: RawAsset[]): Promise<AnalysedAsset[]> {
  return assets.map((asset) => {
    if (asset.type.startsWith("image/")) return analyseImage(asset);
    if (asset.type.startsWith("video/")) return analyseVideo(asset);
    if (asset.type === "url") return analyseUrl(asset);
    return analyseFile(asset);
  });
}

export function reviseSceneOnly(params: { packet: GenerationPacket; sceneId: string; revisionPrompt: string }): GenerationPacket {
  const revisedScenes = params.packet.scenePlan.map((scene) => {
    if (scene.id !== params.sceneId) return scene;
    return {
      ...scene,
      description: params.revisionPrompt,
      imagePrompt: [
        "Photorealistic revised keyframe.",
        params.revisionPrompt,
        `Preserve unchanged details: ${params.packet.activeContext.mustPreserve.slice(0, 8).join(", ")}.`,
        "Do not change unrelated scenes.",
        "Maintain continuity with approved scenes.",
      ].join(" "),
      status: "needs_revision" as const,
    };
  });
  const finalPrompt = buildFinalPrompt({
    rawPrompt: params.packet.rawPrompt,
    settings: params.packet.settings,
    subject: params.packet.activeContext.subject,
    location: params.packet.activeContext.location,
    audience: params.packet.activeContext.audience,
    compactAssetContext: params.packet.activeContext.compactAssetContext,
    strategy: params.packet.strategy,
    scenePlan: revisedScenes,
    mustPreserve: params.packet.activeContext.mustPreserve,
    memoryUsed: params.packet.activeContext.memoryUsed,
    negativeConstraints: params.packet.activeContext.negativeConstraints,
  });
  return {
    ...params.packet,
    scenePlan: revisedScenes,
    finalPrompt,
    tokenBudget: {
      ...params.packet.tokenBudget,
      estimatedTokens: estimateTokens(finalPrompt),
      withinBudget: estimateTokens(finalPrompt) <= params.packet.tokenBudget.maxAllowedTokens,
    },
  };
}

export function attachCloudflareVideo(packet: GenerationPacket, video: GenerationPacket["cloudflareVideo"]): GenerationPacket {
  return { ...packet, cloudflareVideo: video };
}

export function getPlayableCloudflareUrl(packet: GenerationPacket): string | null {
  if (!packet.cloudflareVideo || packet.cloudflareVideo.status !== "ready") return null;
  return packet.cloudflareVideo.playbackUrl || null;
}

function analyseImage(asset: RawAsset): AnalysedAsset {
  const colours = guessColoursFromName(asset.name);
  return {
    ...asset,
    analysis: {
      kind: "image",
      colourCodes: colours,
      productDetails: ["preserve product proportions from reference image", "preserve visible product surface details"],
      logoDetails: ["preserve logo position if visible", "avoid logo warping during motion"],
      materialDetails: ["preserve visible material or fabric texture"],
      faceDetails: ["preserve face identity if a person is visible"],
      motionDetails: [],
      cameraDetails: ["infer camera angle from image reference"],
      lightingDetails: ["match lighting direction from image reference where suitable"],
      styleTags: ["photorealistic", "reference-locked"],
      compactSummary: `IMAGE_REF ${asset.name}: colours=${colours.join("/")}; preserve product shape, logo position, material texture, lighting direction.`,
    },
  };
}

function analyseVideo(asset: RawAsset): AnalysedAsset {
  return {
    ...asset,
    analysis: {
      kind: "video",
      colourCodes: [],
      productDetails: [],
      logoDetails: [],
      materialDetails: [],
      faceDetails: [],
      cameraDetails: ["use uploaded video as camera movement reference"],
      lightingDetails: ["match overall lighting mood from video if relevant"],
      motionDetails: ["use uploaded video for pacing", "use uploaded video for transition rhythm", "use uploaded video for motion energy"],
      styleTags: ["motion-reference", "video-style-reference"],
      compactSummary: `VIDEO_REF ${asset.name}: use for pacing, camera motion, transition rhythm, movement style.`,
    },
  };
}

function analyseFile(asset: RawAsset): AnalysedAsset {
  return {
    ...asset,
    analysis: {
      kind: "file",
      colourCodes: [],
      productDetails: [],
      logoDetails: [],
      materialDetails: [],
      faceDetails: [],
      cameraDetails: [],
      lightingDetails: [],
      motionDetails: [],
      styleTags: ["supporting-file"],
      compactSummary: `FILE_REF ${asset.name}: extract only relevant brand, product, CTA, and restriction details.`,
    },
  };
}

function analyseUrl(asset: RawAsset): AnalysedAsset {
  return {
    ...asset,
    analysis: {
      kind: "url",
      colourCodes: [],
      productDetails: [],
      logoDetails: [],
      materialDetails: [],
      faceDetails: [],
      cameraDetails: ["infer camera style from linked reference"],
      lightingDetails: ["infer lighting mood from linked reference"],
      motionDetails: ["infer pacing and transition structure from linked reference"],
      styleTags: ["external-reference"],
      compactSummary: `URL_REF ${asset.url || asset.name}: use as style, pacing, hook, camera and scene rhythm reference.`,
    },
  };
}

function chooseStrategy(settings: VideoSettings, assets: AnalysedAsset[], prompt: string) {
  const hasImage = assets.some((asset) => asset.analysis.kind === "image");
  const hasVideo = assets.some((asset) => asset.analysis.kind === "video");
  const hasStart = assets.some((asset) => asset.role === "start_frame");
  const hasEnd = assets.some((asset) => asset.role === "end_frame");
  const complex = isComplex(prompt, settings, assets);
  if (hasStart && hasEnd) {
    return { mode: "first_last_frame" as const, reason: "Start and end frames exist, so use first-last-frame control for stronger continuity.", draftFirst: true, generateKeyframesFirst: true, splitIntoClips: complex };
  }
  if (hasVideo || settings.task === "Video to video") {
    return { mode: "video_to_video" as const, reason: "Video reference exists, so use it for motion, pacing and camera rhythm.", draftFirst: true, generateKeyframesFirst: true, splitIntoClips: complex };
  }
  if (hasImage || settings.task === "Image to video") {
    return { mode: "image_to_video" as const, reason: "Image reference exists, so image-to-video improves realism and product consistency.", draftFirst: true, generateKeyframesFirst: true, splitIntoClips: complex };
  }
  return { mode: "text_to_video" as const, reason: "No visual reference provided, so use text-to-video with strict subject lock and low motion.", draftFirst: true, generateKeyframesFirst: /product|cap|logo|model|person/i.test(prompt), splitIntoClips: complex };
}

function createScenePlan(params: { settings: VideoSettings; subject: string; location: string; mustPreserve: string[]; negativeConstraints: string[] }): ClientScenePlan[] {
  const { settings, subject, location, mustPreserve, negativeConstraints } = params;
  const timestamps = settings.length === "15 sec" ? ["0s", "4s", "9s", "15s"] : settings.length === "10 sec" ? ["0s", "3s", "6s", "10s"] : ["0s", "2s", "4s", "6s"];
  const scenes = [
    { title: "Opening realistic hook", description: `Show ${subject} clearly in the first moment with realistic texture and exact colour family.`, camera: "stable product close-up or medium close-up", motion: "very slow push-in", action: "subject fully visible; no text overlay" },
    { title: "Main controlled action", description: `Show one simple action involving ${subject}; preserve product identity and material.`, camera: "stable 35mm-style framing", motion: settings.pace === "Fast" ? "controlled energetic motion" : "slow natural motion", action: "one clean action only; avoid complex hand movement" },
    { title: "Lifestyle/context frame", description: `Place ${subject} in ${location} with ${settings.style} mood and realistic lighting.`, camera: "mobile-first composed frame", motion: "subtle environmental movement", action: "show mood and context without hiding product" },
    { title: "Final hero frame", description: `End with ${subject} clearly visible in a premium hero composition.`, camera: "locked-off or very slow push-in", motion: "minimal final hold", action: "clean final frame, CTA-ready space if needed" },
  ];
  return scenes.map((scene, index) => ({
    id: safeId("scene"),
    order: index + 1,
    timestamp: timestamps[index],
    title: scene.title,
    description: scene.description,
    camera: scene.camera,
    lighting: "realistic soft directional light, natural shadows, no plastic look",
    motion: scene.motion,
    subjectAction: scene.action,
    imagePrompt: [
      `Photorealistic ${settings.style.toLowerCase()} keyframe for ${settings.platform}.`,
      scene.description,
      `Subject lock: ${subject}.`,
      `Location: ${location}.`,
      `Camera: ${scene.camera}.`,
      "Lighting: realistic soft directional light, natural shadows.",
      `Preserve: ${mustPreserve.slice(0, 8).join(", ")}.`,
      "Vertical 9:16, mobile-first, premium, clean, uncluttered.",
      "No distorted logo, no wrong colour, no random text.",
    ].join(" "),
    negativePrompt: negativeConstraints.join(", "),
    status: "draft",
  }));
}

function buildFinalPrompt(params: { rawPrompt: string; settings: VideoSettings; subject: string; location: string; audience: string; compactAssetContext: string; strategy: ReturnType<typeof chooseStrategy>; scenePlan: ClientScenePlan[]; mustPreserve: string[]; memoryUsed: string[]; negativeConstraints: string[] }) {
  const sceneText = params.scenePlan.length > 0 ? params.scenePlan.map((scene) => `${scene.order}. ${scene.title}: ${scene.description}; camera=${scene.camera}; motion=${scene.motion}`).join(" ") : "Use simple controlled motion, stable camera, and clear subject visibility.";
  return [
    `Create a realistic vertical 9:16 ${params.settings.style.toLowerCase()} ${params.settings.realism.toLowerCase()} short video for ${params.settings.platform}.`,
    `User request: ${params.rawPrompt.trim()}.`,
    `Audience: ${params.audience}.`,
    `Subject lock: ${params.subject}.`,
    `Location: ${params.location}.`,
    `Strategy: ${params.strategy.mode}; reason=${params.strategy.reason}.`,
    params.compactAssetContext ? `Reference analysis: ${params.compactAssetContext}.` : "",
    `Scene plan: ${sceneText}.`,
    `Preserve: ${params.mustPreserve.join("; ")}.`,
    params.memoryUsed.length ? `User memory: ${params.memoryUsed.join("; ")}.` : "",
    `Avoid: ${params.negativeConstraints.join("; ")}.`,
  ].filter(Boolean).join(" ");
}

function distilMemory(memory: UserMemory, prompt: string, settings: VideoSettings): string[] {
  const query = [prompt, settings.platform, settings.style, settings.pace, settings.realism].join(" ").toLowerCase();
  return memory.rules
    .map((rule) => {
      const tagScore = rule.appliesTo.some((tag) => query.includes(tag.toLowerCase())) ? 3 : 0;
      const priorityScore = rule.priority === "critical" ? 4 : rule.priority === "high" ? 3 : rule.priority === "medium" ? 2 : 1;
      return { rule: rule.rule, score: tagScore + priorityScore + rule.confidence };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.rule);
}

function inferSubject(prompt: string, assets: AnalysedAsset[]) {
  const lower = prompt.toLowerCase();
  if (lower.includes("warm grey curved-brim cap")) return "warm grey curved-brim cap";
  if (lower.includes("cap")) return "cap";
  if (lower.includes("shoe")) return "shoe";
  if (lower.includes("watch")) return "watch";
  if (lower.includes("bag")) return "bag";
  const productAsset = assets.find((asset) => asset.role === "product_reference");
  if (productAsset) return `product from ${productAsset.name}`;
  return "main subject from user prompt";
}

function inferLocation(prompt: string) {
  if (/kathmandu rooftop/i.test(prompt)) return "Kathmandu rooftop";
  if (/kathmandu/i.test(prompt)) return "Kathmandu";
  if (/studio/i.test(prompt)) return "clean studio";
  if (/street/i.test(prompt)) return "urban street";
  return "location inferred from user prompt";
}

function inferAudience(prompt: string, settings: VideoSettings) {
  const match = prompt.match(/for ([a-zA-Z ]+ consumers|[a-zA-Z ]+ audience|[a-zA-Z ]+ people)/i);
  if (match?.[1]) return match[1];
  if (settings.platform === "TikTok") return "short-form social audience";
  return "young urban social media audience";
}

function isComplex(prompt: string, settings: VideoSettings, assets: AnalysedAsset[]) {
  let score = 0;
  if (/model|person|man|woman|face/i.test(prompt)) score += 2;
  if (/logo|product|cap|shoe|watch|bag/i.test(prompt)) score += 2;
  if (/text|caption|slogan|cta/i.test(prompt)) score += 2;
  if (/zoom|pan|dolly|tracking|camera/i.test(prompt)) score += 1;
  if (settings.length === "15 sec") score += 2;
  if (settings.pace === "Fast") score += 2;
  if (assets.some((asset) => asset.analysis.kind === "video")) score += 1;
  return score >= 7;
}

function guessColoursFromName(name: string): string[] {
  const lower = name.toLowerCase();
  if (lower.includes("grey") || lower.includes("gray")) return ["#8B8C89", "#A0A19C"];
  if (lower.includes("black")) return ["#111111", "#2A2A2A"];
  if (lower.includes("white")) return ["#F3F2EE", "#FFFFFF"];
  if (lower.includes("red")) return ["#B91C1C"];
  if (lower.includes("blue")) return ["#1D4ED8"];
  return [];
}

function compressPrompt(params: { subject: string; location: string; settings: VideoSettings; compactAssetContext: string; mustPreserve: string[]; negativeConstraints: string[] }) {
  return [
    "REALISTIC 9:16 VIDEO.",
    `SUBJECT=${params.subject}.`,
    `LOCATION=${params.location}.`,
    `STYLE=${params.settings.style}; REALISM=${params.settings.realism}; PACE=${params.settings.pace}.`,
    params.compactAssetContext ? `REF=${params.compactAssetContext}.` : "",
    `LOCK=${params.mustPreserve.slice(0, 8).join("; ")}.`,
    `AVOID=${params.negativeConstraints.slice(0, 10).join("; ")}.`,
  ].filter(Boolean).join(" ");
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items.filter(Boolean)));
}
