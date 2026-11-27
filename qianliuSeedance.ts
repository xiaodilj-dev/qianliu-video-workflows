// Toonflow 2.0.11 媒体供应商。模型、令牌和费用可在 www.plusapi.cn 核对。
type Context = {
  config: { apiKey?: string };
  signal?: AbortSignal;
  saveTaskData?: (data: { taskId: string }) => Promise<void>;
  tool: { fetch: typeof fetch };
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
  firstFrame?: unknown;
  lastFrame?: unknown;
  other?: Record<string, unknown>;
};

const tasksUrl = "https://www.plusapi.cn/api/v3/contents/generations/tasks";
const standardModelId = "doubao-seedance-2-5-260628";
const flashModelId = "doubao-seedance-2-5-flash-261115";

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
  label: "千流 API · Seedance 2.5 文生视频",
  version: "1.1.0",
  readme: "在千流控制台创建 Seedance-2 分组令牌，填入此供应商的 API Key。视频节点可选标准版或 Flash 做纯文字分镜。两款均支持 480p、720p，1080p 请选标准版。按所选型号与实际用量计费。已接单任务中断时，按原任务编号继续查询。视频地址有时效，请及时保存。",
  rules: [{
    type: "input", field: "apiKey", title: "API Key", value: "",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  }],
  models: [{
    id: "doubao-seedance-2-5-260628", label: "Seedance 2.5 标准版 · 文生视频", type: "video",
    mode: ["text"], audio: "optional",
    durationResolutionMap: [{
      duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      resolution: ["480p", "720p", "1080p"],
    }],
  }, {
    id: "doubao-seedance-2-5-flash-261115", label: "Seedance 2.5 Flash · 文生视频", type: "video",
    mode: ["text"], audio: "optional",
    durationResolutionMap: [{
      duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      resolution: ["480p", "720p"],
    }],
  }],
  async generateVideo(this: Context, request: VideoRequest) {
    const key = token(this);
    const prompt = request.prompt?.trim();
    if (![standardModelId, flashModelId].includes(request.model) || !prompt) throw new Error("请选择 Seedance 2.5 标准版或 Flash 并填写文字分镜。");
    if ((request.mode && request.mode !== "text") || request.images?.length || request.videos?.length ||
        request.audios?.length || request.firstFrame || request.lastFrame || Object.keys(request.other ?? {}).length) {
      throw new Error("此适配文件支持纯文字分镜。请移除参考素材和自定义参数。");
    }
    const duration = request.duration ?? 5;
    const resolution = request.resolution ?? "720p";
    const ratio = request.ratio ?? "9:16";
    if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error("时长须为 4 到 30 之间的整数秒。");
    if (!["480p", "720p", "1080p"].includes(resolution)) throw new Error("请选择 480p、720p 或 1080p。");
    if (request.model === flashModelId && resolution === "1080p") throw new Error("Flash 支持 480p、720p。需要 1080p 时请选择标准版。");
    if (!["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].includes(ratio)) throw new Error("请选择受支持的画面比例。");
    const signal = deadline(this, 60_000);
    signal.throwIfAborted();
    const body = {
      model: request.model, content: [{ type: "text", text: prompt }], duration, resolution, ratio,
      generate_audio: request.generateAudio, watermark: request.watermark,
    };
    let response: Response;
    try {
      response = await this.tool.fetch(tasksUrl, {
        method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal, redirect: "error",
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
