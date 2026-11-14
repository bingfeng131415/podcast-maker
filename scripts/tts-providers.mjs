// 语音合成服务商。每个服务商一个函数：发一次请求，成功返回 { audio: Buffer, chars }，失败返回 { error, retry, fatal }。
// 重试、限流、质检都在 podcast-tts.mjs 里统一做，这里只管"怎么调这家的接口"。
// 加一家新的服务商：照着下面写一个函数，放进 PROVIDERS，并在 KEYS 里写它需要哪些环境变量。
import { randomUUID } from "node:crypto";

// 只有 MiniMax 认识的声音标记和停顿标记；别家会把它们当文字念出来，所以发送前去掉
const plain = (t) => String(t).replace(/<#[\d.]+#>/g, "，").replace(/\((?:laughs|chuckle|coughs|clear-throat|groans|breath|pant|inhale|exhale|gasps|sniffs|sighs|snorts|burps|lip-smacking|humming|hissing|emm|sneezes)\)/gi, "").replace(/\s{2,}/g, " ").replace(/^[，,\s]+/, "").trim();

const post = async (url, headers, body) => {
  try { return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }); }
  catch (e) { return { ok: false, status: -1, json: async () => ({ message: e.message }), text: async () => e.message, arrayBuffer: async () => new ArrayBuffer(0) }; }
};

// 每家需要的环境变量（写在 .env 里或直接设成环境变量）
export const KEYS = {
  minimax: ["MINIMAX_API_KEY"],
  doubao: ["DOUBAO_APPID", "DOUBAO_ACCESS_TOKEN"],
  elevenlabs: ["ELEVENLABS_API_KEY"],
};

// 每家的默认设置（可在 voices.json 的 providers 里改）
export const DEFAULTS = {
  minimax: { model: "speech-2.8-hd", host: "https://api.minimaxi.com", min_interval_ms: 1500, sound_tags: true },
  doubao: { cluster: "volcano_tts", host: "https://openspeech.bytedance.com", min_interval_ms: 300, sound_tags: false },
  elevenlabs: { model: "eleven_multilingual_v2", host: "https://api.elevenlabs.io", min_interval_ms: 500, stability: 0.45, similarity_boost: 0.8, style: 0, sound_tags: false },
};

export const PROVIDERS = {
  // MiniMax：https://platform.minimaxi.com（国内站）/ https://www.minimax.io（海外站，host 改成 https://api.minimax.io）
  async minimax(u, cfg, env, attempt) {
    const vs = { voice_id: u.voice_id, speed: u.speed, vol: u.vol, pitch: u.pitch };
    if (u.emotion !== "auto" && attempt < 3) vs.emotion = u.emotion; // 这个声音不支持该情绪时，第 3 次起去掉
    const body = { model: cfg.model, text: u.text, stream: false, language_boost: "Chinese", output_format: "hex", voice_setting: vs,
      audio_setting: { sample_rate: 44100, format: "wav", channel: 1 },
      ...(u.pron.length && attempt < 2 ? { pronunciation_dict: { tone: u.pron } } : {}) }; // 发音词典写错时，第 2 次起去掉
    const r = await post((env.MINIMAX_API_HOST || cfg.host) + "/v1/t2a_v2", { Authorization: `Bearer ${env.MINIMAX_API_KEY}` }, body);
    const j = await r.json().catch(() => ({}));
    const code = j.base_resp?.status_code;
    if (code === 0 && j.data?.audio) return { audio: Buffer.from(j.data.audio, "hex"), chars: j.extra_info?.usage_characters || u.text.length };
    return { error: `MiniMax ${code ?? r.status} ${j.base_resp?.status_msg || ""}`, fatal: [1004, 2013, 2049].includes(code), slow: code === 1002 };
  },

  // 豆包（火山引擎语音合成，HTTP 非流式接口）：火山引擎文档中心 → 语音技术 → 语音合成 → HTTP 接口。
// 注意：这一家没有实测过（作者没有密钥），请求格式按公开文档和社区示例写的，用之前先跑一段样片。
  // voice_id 填控制台里的音色 ID（voice_type）。用大模型音色时，cluster 一般仍是 volcano_tts。
  async doubao(u, cfg, env) {
    const body = {
      app: { appid: env.DOUBAO_APPID, token: "access_token", cluster: cfg.cluster },
      user: { uid: "podcast-maker" },
      audio: { voice_type: u.voice_id, encoding: "wav", rate: 24000, speed_ratio: u.speed, volume_ratio: u.vol, pitch_ratio: 1 + (u.pitch || 0) * 0.05 },
      request: { reqid: randomUUID(), text: plain(u.text), text_type: "plain", operation: "query" },
    };
    if (u.emotion !== "auto" && cfg.emotion !== false) Object.assign(body.audio, { emotion: u.emotion, enable_emotion: true });
    const r = await post(cfg.host + "/api/v1/tts", { Authorization: `Bearer;${env.DOUBAO_ACCESS_TOKEN}` }, body);
    const j = await r.json().catch(() => ({}));
    if (j.code === 3000 && j.data) return { audio: Buffer.from(j.data, "base64"), chars: plain(u.text).length };
    // 3001 参数不对、3003 并发超限、3005 服务繁忙、3010 文本太长、3011 文本无效、3050 音色不存在（以官方文档为准）
    return { error: `豆包 ${j.code ?? r.status} ${j.message || ""}`, fatal: [3001, 3010, 3011, 3050].includes(j.code) || r.status === 401 || r.status === 403, slow: j.code === 3003 || j.code === 3005 };
  },

  // ElevenLabs：https://elevenlabs.io/docs/api-reference/text-to-speech/convert
// 注意：这一家也没有实测过，用之前先跑一段样片。
  // voice_id 填 ElevenLabs 的音色 ID。中文建议用 eleven_multilingual_v2 或更新的多语言模型。
  async elevenlabs(u, cfg, env) {
    const url = `${cfg.host}/v1/text-to-speech/${encodeURIComponent(u.voice_id)}?output_format=mp3_44100_128`;
    const body = { text: plain(u.text), model_id: cfg.model,
      voice_settings: { stability: cfg.stability, similarity_boost: cfg.similarity_boost, style: cfg.style, use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, u.speed)) } };
    const r = await post(url, { "xi-api-key": env.ELEVENLABS_API_KEY, Accept: "audio/mpeg" }, body);
    if (r.ok) { const audio = Buffer.from(await r.arrayBuffer()); if (audio.length > 1000) return { audio, chars: body.text.length }; }
    const msg = await r.text().catch(() => "");
    return { error: `ElevenLabs ${r.status} ${msg.slice(0, 160)}`, fatal: [400, 401, 403, 404, 422].includes(r.status), slow: r.status === 429 };
  },
};
