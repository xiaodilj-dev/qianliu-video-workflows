// Toonflow 2.0.11 媒体供应商。模型、令牌和费用可在 www.plusapi.cn 核对。
type Context = {
  config: { apiKey?: string };
  signal?: AbortSignal;
  saveTaskData?: (data: { taskId: string }) => Promise<void>;
  tool: { fetch: typeof fetch };
};

type FrameImage =
  | { type: "url"; url: string }
  | { type: "base64"; data: string; mimeType: string }
  | { type: "binary"; data: Uint8Array; mimeType: string };

type ContentPart = { type: "text"; text: string } | {
  type: "image_url"; role: "first_frame" | "last_frame"; image_url: { url: string };
};

type VideoRequest = {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  ratio?: string;
  mode?: unknown;
  generateAudio?: boolean;
  watermark?: boolean;
  images?: unknown[];
  videos?: unknown[];
  audios?: unknown[];
  firstFrame?: FrameImage;
  lastFrame?: FrameImage;
  other?: Record<string, unknown>;
};

const tasksUrl = "https://www.plusapi.cn/api/v3/contents/generations/tasks";
const standardModelId = "doubao-seedance-2-5-260628";
const flashModelId = "doubao-seedance-2-5-flash-261115";

function frameSource(frame: FrameImage): string {
  if (frame.type === "url") {
    if (!URL.canParse(frame.url)) throw new Error("请使用完整的 HTTPS 图片地址，或连接本地图片节点。");
    const url = new URL(frame.url);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("远程帧图片须使用 HTTPS 地址，并允许模型服务读取。");
    return url.href;
  }
  const mime = frame.mimeType?.toLowerCase().replace(/^image\/jpg$/, "image/jpeg");
  if (!mime || !["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif"].includes(mime)) {
    throw new Error("帧图片请选择 JPEG、PNG、WebP、BMP、TIFF 或 GIF 文件。");
  }
  let encoded: string;
  if (frame.type === "binary" && ArrayBuffer.isView(frame.data) && frame.data.BYTES_PER_ELEMENT === 1) {
    if (!frame.data.byteLength || frame.data.byteLength >= 30_000_000) throw new Error("每张帧图片须小于 30 MB 且不能为空。");
    encoded = Buffer.from(frame.data).toString("base64");
  } else if (frame.type === "base64" && typeof frame.data === "string") {
    encoded = frame.data;
    if (encoded.startsWith("data:")) {
      const prefix = "data:" + mime + ";base64,";
      if (!encoded.startsWith(prefix)) throw new Error("帧图片的格式与数据标记不一致。");
      encoded = encoded.slice(prefix.length);
    }
    if (!encoded.length || encoded.length > 40_000_000 || encoded.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(encoded)) throw new Error("请检查帧图片的 Base64 数据或改用 HTTPS 图片地址。");
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length >= 30_000_000) throw new Error("每张帧图片须小于 30 MB 且不能为空。");
    const canonical = bytes.toString("base64");
    if (encoded !== canonical && encoded !== canonical.replace(/=+$/, "")) throw new Error("帧图片的 Base64 数据不完整。");
    encoded = canonical;
  } else {
    throw new Error("无法读取帧图片，请重新连接图片节点。");
  }
  return "data:" + mime + ";base64," + encoded;
}

function token(context: Context) {
  const key = context.config.apiKey?.trim();
  if (!key) throw new Error("请在此供应商的 API Key 栏填入千流 Seedance-2 分组令牌。");
  return key;
}

function deadline(context: Context, milliseconds: number) {
  const timeout = AbortSignal.timeout(milliseconds);
  return context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
}

function wait(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function taskIdFrom(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw new Error("没有可查询的任务编号。请先核对千流任务记录，以免重复生成。");
  }
  return value;
}

async function collectVideo(context: Context, taskId: string) {
  const key = token(context);
  const signal = deadline(context, 30 * 60_000);
  const url = tasksUrl + "/" + encodeURIComponent(taskId);
  while (true) {
    signal.throwIfAborted();
    const response = await context.tool.fetch(url, {
      method: "GET", headers: { Authorization: "Bearer " + key }, signal, redirect: "error",
    });
    if (!response.ok) {
      throw new Error("查询任务 " + taskId + " 时收到 HTTP " + response.status + "。可稍后继续查询同一任务。");
    }
    const result = await response.json();
    if (result.id !== taskId) throw new Error("查询结果与任务编号不一致。请核对 " + taskId + "。");
    if (result.status === "succeeded") {
      const output = result.content?.video_url;
      if (typeof output !== "string" || !URL.canParse(output)) throw new Error("任务 " + taskId + " 缺少视频地址。");
      const video = new URL(output);
      if (video.protocol !== "https:" || video.username || video.password) throw new Error("任务返回的视频地址无效。");
      return [{ mediaType: "video" as const, type: "url" as const, url: output }];
    }
    if (["failed", "cancelled", "expired"].includes(result.status)) {
      throw Object.assign(new Error("千流任务 " + taskId + " 已结束，状态为 " + result.status + "。"), { code: "MEDIA_TASK_FAILED" });
    }
    if (!["pending", "queued", "running"].includes(result.status)) {
      throw new Error("任务 " + taskId + " 返回了未知状态。请按原编号查看千流任务记录。");
    }
    await wait(6000, signal);
  }
}

export default {
  id: "qianliuSeedance",
  label: "千流 API · Seedance 2.5 视频",
  version: "1.2.0",
  readme: "在千流控制台创建 Seedance-2 分组令牌。标准版和 Flash 均支持文字分镜、首帧图生视频和首尾帧过渡。按首帧、尾帧的顺序连入一或两张图片。生成时会把所连帧图交给千流及模型服务，帧模式按图片自适应画幅。两款均支持 480p、720p，1080p 请选择标准版。按所选型号与回执用量计费。中断时按原任务编号查询。",
  rules: [{
    type: "input", field: "apiKey", title: "API Key", value: "",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  }],
  models: [{
    id: "doubao-seedance-2-5-260628", label: "Seedance 2.5 标准版", type: "video",
    mode: ["text", "endFrameOptional"], audio: "optional",
    durationResolutionMap: [{
      duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      resolution: ["480p", "720p", "1080p"],
    }],
  }, {
    id: "doubao-seedance-2-5-flash-261115", label: "Seedance 2.5 Flash", type: "video",
    mode: ["text", "endFrameOptional"], audio: "optional",
    durationResolutionMap: [{
      duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      resolution: ["480p", "720p"],
    }],
  }],
  async generateVideo(this: Context, request: VideoRequest) {
    const key = token(this);
    const prompt = request.prompt?.trim();
    if (![standardModelId, flashModelId].includes(request.model) || !prompt) throw new Error("请选择 Seedance 2.5 标准版或 Flash 并填写文字分镜。");
    const useFrames = request.mode === "endFrameOptional";
    if ((!useFrames && request.mode && request.mode !== "text") || request.images?.length || request.videos?.length ||
        request.audios?.length || Object.keys(request.other ?? {}).length) {
      throw new Error("请选择文字或首尾帧模式，并移除额外的参考素材和自定义参数。");
    }
    if (useFrames && !request.firstFrame) throw new Error("请先连接首帧图。需要指定结尾时再连接第二张图。");
    if (!useFrames && (request.firstFrame || request.lastFrame)) throw new Error("已连接帧图片，请选择首尾帧模式。");
    const duration = request.duration ?? 5;
    const resolution = request.resolution ?? "720p";
    const ratio = useFrames ? "adaptive" : request.ratio ?? "9:16";
    if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error("时长须为 4 到 30 之间的整数秒。");
    if (!["480p", "720p", "1080p"].includes(resolution)) throw new Error("请选择 480p、720p 或 1080p。");
    if (request.model === flashModelId && resolution === "1080p") throw new Error("Flash 支持 480p、720p。需要 1080p 时请选择标准版。");
    if (!["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].includes(ratio)) throw new Error("请选择受支持的画面比例。");
    const signal = deadline(this, 60_000);
    signal.throwIfAborted();
    const content: ContentPart[] = [{ type: "text", text: prompt }];
    if (request.firstFrame) content.push({ type: "image_url", role: "first_frame", image_url: { url: frameSource(request.firstFrame) } });
    if (request.lastFrame) content.push({ type: "image_url", role: "last_frame", image_url: { url: frameSource(request.lastFrame) } });
    const body = JSON.stringify({
      model: request.model, content, duration, resolution, ratio,
      generate_audio: request.generateAudio, watermark: request.watermark,
    });
    if (useFrames && Buffer.byteLength(body, "utf8") > 64_000_000) throw new Error("请求超过 64 MB，请缩小帧图片或改用 HTTPS 图片地址。");
    let response: Response;
    try {
      response = await this.tool.fetch(tasksUrl, {
        method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body, signal, redirect: "error",
      });
    } catch {
      throw new Error("未取得提交回执。请先核对千流任务和用量记录，避免重复计费。");
    }
    if (!response.ok) throw new Error("提交返回 HTTP " + response.status + "。请先核对令牌分组、余额及任务记录。");
    let result;
    try { result = await response.json(); }
    catch { throw new Error("无法读取提交回执。请先核对千流任务和用量记录。"); }
    const taskId = taskIdFrom(result?.id);
    try { await this.saveTaskData?.({ taskId }); }
    catch { throw new Error("千流已接单，任务编号 " + taskId + "。本机保存编号失败，请保留该编号查询。"); }
    return collectVideo(this, taskId);
  },
  async resumeTask(this: Context, data: Record<string, unknown>) {
    return collectVideo(this, taskIdFrom(data.taskId));
  },
};
