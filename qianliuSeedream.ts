// Toonflow 2.0.11 图像供应商。与视频供应商分别配置相应分组的令牌。
type Reference =
  | { type: "url"; url: string }
  | { type: "base64"; data: string; mimeType: string }
  | { type: "binary"; data: Uint8Array; mimeType: string };

type ImageRequest = {
  model: string;
  prompt: string;
  images?: Reference[];
  ratio?: string;
  size?: string;
  n?: number;
  mask?: unknown;
  quality?: string;
  outputFormat?: string;
  other?: Record<string, unknown>;
};

type Context = {
  config: { apiKey?: string };
  signal?: AbortSignal;
  tool: { fetch: typeof fetch };
};

const dimensions: Record<string, string> = {
  "9:16": "1080x1920",
  "16:9": "1920x1080",
  "1:1": "2048x2048",
};

function referenceValue(image: Reference) {
  if (image.type === "url") {
    const url = new URL(image.url);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("请使用模型服务可读取的 HTTPS 图片地址，或连接本地 PNG、JPEG。");
    return url.href;
  }
  const mime = image.mimeType?.toLowerCase().replace(/^image\/jpg$/, "image/jpeg");
  if (mime !== "image/png" && mime !== "image/jpeg") throw new Error("本地参考图请用 PNG 或 JPEG。");
  const prefix = "data:" + mime + ";base64,";
  if (image.type === "binary" && ArrayBuffer.isView(image.data) && image.data.byteLength) {
    return prefix + Buffer.from(image.data).toString("base64");
  }
  if (image.type === "base64" && typeof image.data === "string") {
    const data = image.data.startsWith(prefix) ? image.data.slice(prefix.length) : image.data;
    if (data && /^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      const canonical = Buffer.from(data, "base64").toString("base64");
      if (canonical && (data === canonical || data === canonical.replace(/=+$/, ""))) return prefix + canonical;
    }
  }
  throw new Error("参考图数据不完整，请重新连接原图。");
}

export default {
  id: "qianliuSeedream",
  label: "千流 API · Seedream 5.5 分镜图",
  version: "1.0.0",
  readme: "在图片生成节点输入分镜，或连接一张有权使用的图片并描述改动。生成会向千流及上游发送提示词和所连素材，并按实际输入、输出图片计费。竖屏为 1080×1920，横屏为 1920×1080，方图为 2048×2048。成功后可将结果接到视频节点作首帧，运行视频节点另行计费。现价 https://www.plusapi.cn/pricing?keyword=doubao-seedream-5-5-261028",
  rules: [{
    type: "input", field: "apiKey", title: "doubao-image-2 API Key", value: "",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  }],
  models: [{
    id: "doubao-seedream-5-5-261028", label: "Seedream 5.5 分镜图", type: "image",
    mode: ["text", "singleImage"], imageSizes: ["分镜尺寸"], imageRatios: ["9:16", "16:9", "1:1"],
  }],
  async generateImage(this: Context, request: ImageRequest) {
    const key = this.config.apiKey?.trim();
    if (!key) throw new Error("请先填写千流 doubao-image-2 分组令牌。");
    const prompt = request.prompt?.trim();
    if (request.model !== "doubao-seedream-5-5-261028" || !prompt) throw new Error("请选择 Seedream 5.5 并填写分镜或修改说明。");
    const ratio = request.ratio ?? "16:9";
    if (!Object.hasOwn(dimensions, ratio) || (request.size && request.size !== "分镜尺寸")) throw new Error("请在节点内选择分镜尺寸和支持的画幅。");
    const images = request.images ?? [];
    if (images.length > 1 || (request.n ?? 1) !== 1 || request.mask || request.quality || request.outputFormat || Object.keys(request.other ?? {}).length) {
      throw new Error("这个节点每次生成一张分镜，支持零或一张参考图。请移除蒙版、额外素材及自定义选项。");
    }
    const image = images.length ? referenceValue(images[0]) : undefined;
    const timeout = AbortSignal.timeout(180_000);
    const signal = this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
    signal.throwIfAborted();
    const checkLog = "请先按时间、模型和分组核对千流使用日志，再决定是否重新生成。";
    let response;
    try {
      response = await this.tool.fetch("https://www.plusapi.cn/v1/images/generations", {
        method: "POST", redirect: "error", signal,
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: request.model, prompt, image, size: dimensions[ratio], response_format: "b64_json" }),
      });
    } catch {
      throw new Error("未收到出图回执。" + checkLog);
    }
    if (!response.ok) throw new Error("千流出图请求返回 HTTP " + response.status + "。" + checkLog);
    const result = await response.json().catch(() => null);
    const item = Array.isArray(result?.data) && result.data.length === 1 ? result.data[0] : undefined;
    const data = item?.b64_json;
    if (typeof data !== "string") throw new Error("回执中没有预期的单张图片。" + checkLog);
    const signature = Buffer.from(data.slice(0, 16), "base64").toString("hex");
    const mimeType = signature.startsWith("89504e470d0a1a0a") ? "image/png" : signature.startsWith("ffd8ff") ? "image/jpeg" : undefined;
    if (!mimeType) throw new Error("回执图片的格式无法识别。" + checkLog);
    return [{ type: "base64", mediaType: "image", mimeType, data }];
  },
};
