#!/usr/bin/env node
// 环境检查：第一次用、或者出错时跑一下，看缺什么、怎么补。不会读出或打印密钥。
// 用法：node doctor.mjs [--online]
//   --online  再连一下语音服务，确认密钥能用（MiniMax 查一次音色列表，不合成、不计费）
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { KEYS } from "./tts-providers.mjs";

const HOME = os.homedir(), SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const USER_DIR = (process.env.PODCAST_MAKER_HOME || path.join(HOME, ".config", "podcast-maker")).replace(/^~(?=\/)/, HOME);
let bad = 0, warnN = 0;
const ok = (m) => console.log(`  ✓ ${m}`), no = (m, fix) => { bad++; console.log(`  ✗ ${m}${fix ? `\n      → ${fix}` : ""}`); }, opt = (m, fix) => { warnN++; console.log(`  ○ ${m}${fix ? `\n      → ${fix}` : ""}`); };
const runs = (cands, flag = "--version") => cands.find((c) => spawnSync(c, [flag], { encoding: "utf8" }).status === 0);
const readJson = (f) => { if (!existsSync(f)) return {}; try { return JSON.parse(readFileSync(f, "utf8")); } catch (e) { no(`${f} 不是合法的 JSON：${e.message}`, "改正格式（常见：多了逗号、少了引号）"); return {}; } };
const brew = process.platform === "darwin";

console.log(`podcast-maker 环境检查（${SKILL}）\n\n必需`);
const nodeMajor = +process.versions.node.split(".")[0];
nodeMajor >= 18 ? ok(`Node.js ${process.versions.node}`) : no(`Node.js ${process.versions.node}，需要 18 以上`, brew ? "brew install node" : "到 nodejs.org 装新版");
const ff = runs(["ffmpeg", path.join(HOME, ".local/bin/ffmpeg"), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"], "-version");
ff ? ok(`ffmpeg（${ff}）`) : no("找不到 ffmpeg：配音、拼接、转写都要用", brew ? "brew install ffmpeg" : "apt install ffmpeg，或到 ffmpeg.org 下载");

// 配置和密钥
const LOCAL = { ...readJson(path.join(SKILL, "config.local.json")), ...readJson(path.join(USER_DIR, "config.json")) };
const layers = [readJson(path.join(SKILL, "voices.json")), LOCAL];
const provider = [...layers].reverse().map((l) => l.provider).find(Boolean) || "minimax";
const providers = new Set([provider, ...layers.flatMap((l) => Object.values(l.speakers || {}).map((s) => s.provider).filter(Boolean))]);
const envFile = (LOCAL.env_file || path.join(USER_DIR, ".env")).replace(/^~(?=\/)/, HOME);
const fileEnv = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").map((l) => /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*?)"?\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]])) : {};
const env = { ...fileEnv, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(MINIMAX|DOUBAO|ELEVENLABS)_/.test(k))) };
for (const p of providers) {
  if (!KEYS[p]) { no(`配置里的语音服务「${p}」不认识`, `可选：${Object.keys(KEYS).join("、")}`); continue; }
  const miss = KEYS[p].filter((k) => !env[k]);
  miss.length ? no(`${p} 缺密钥：${miss.join("、")}`, `写进 ${envFile}（格式见 ${path.join(SKILL, ".env.example")}），或设成环境变量`) : ok(`${p} 密钥已设置${existsSync(envFile) && KEYS[p].every((k) => fileEnv[k]) ? `（来自 ${envFile}）` : "（来自环境变量）"}`);
}

console.log("\n可选");
existsSync(path.join(USER_DIR, "config.json")) ? ok(`个人配置 ${path.join(USER_DIR, "config.json")}`) : opt("没有个人配置，用的是 voices.json 里的默认声音", `想用自己的声音、自动发到手机：cp "${path.join(SKILL, "config.example.json")}" "${path.join(USER_DIR, "config.json")}"`);
existsSync(path.join(USER_DIR, "听众档案.md")) ? ok("听众档案") : opt("没有听众档案：写稿时不知道你的背景和偏好", `cp "${path.join(SKILL, "听众档案.example.md")}" "${path.join(USER_DIR, "听众档案.md")}"，再按自己的情况改`);
const findWhisper = () => { const c = runs(["mlx_whisper", "/opt/homebrew/bin/mlx_whisper", "/usr/local/bin/mlx_whisper"], "--help"); if (c) return c; const b = path.join(HOME, "Library", "Python"); if (!existsSync(b)) return null; for (const v of spawnSync("ls", [b], { encoding: "utf8" }).stdout.split("\n").filter(Boolean)) { const f = path.join(b, v, "bin", "mlx_whisper"); if (existsSync(f)) return f; } return null; };
const w = findWhisper();
w ? ok(`mlx-whisper（${w}）：配音后逐句听写复查、音视频转文字`) : opt("没有 mlx-whisper：配音后不做听写复查，音视频也转不了文字", process.platform === "darwin" && process.arch === "arm64" ? "pip3 install mlx-whisper" : "只支持 Apple 芯片的 Mac；其他系统跳过这两项");
const yt = runs(["yt-dlp", path.join(HOME, ".local/bin/yt-dlp"), "/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"]);
yt ? ok(`yt-dlp（${yt}）：YouTube、B 站等视频`) : opt("没有 yt-dlp：读不了 YouTube、B 站的视频（小宇宙和本地文件不受影响）", brew ? "brew install yt-dlp" : "pip install yt-dlp");
if (Array.isArray(LOCAL.send) && LOCAL.send.length) {
  const bin = LOCAL.send[0];
  spawnSync("sh", ["-c", `command -v "${bin.replace(/"/g, "")}"`]).status === 0 ? ok(`发送命令：${bin}`) : no(`发送命令「${bin}」找不到`, "装上这个工具，或者改 config.json 里的 send");
} else opt("没有配置发送命令：做完不会自动发到手机", "需要的话在 config.json 里写 send（见 references/语音服务.md）");

if (process.argv.includes("--online")) {
  console.log("\n连接测试");
  if (providers.has("minimax") && env.MINIMAX_API_KEY) {
    const host = (env.MINIMAX_API_HOST || "https://api.minimaxi.com").replace(/\/$/, "");
    try {
      const r = await fetch(`${host}/v1/get_voice`, { method: "POST", headers: { Authorization: `Bearer ${env.MINIMAX_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ voice_type: "all" }), signal: AbortSignal.timeout(20000) });
      const j = await r.json().catch(() => ({})); const code = j.base_resp?.status_code;
      if (r.ok && code === 0) { const n = (j.system_voice || []).length, mine = [...(j.voice_cloning || []), ...(j.voice_generation || [])].length; ok(`MiniMax 连得上，密钥有效（系统音色 ${n} 个${mine ? `，你自己的声音 ${mine} 个` : ""}）`); }
      else no(`MiniMax 返回错误：${j.base_resp?.status_msg || "HTTP " + r.status}`, code === 1004 || r.status === 401 ? "密钥不对，或者用错了站点（海外站要设 MINIMAX_API_HOST=https://api.minimax.io）" : "看一下密钥和账户余额");
    } catch (e) { no(`连不上 MiniMax：${e.message}`, "检查网络和代理"); }
  }
  for (const p of providers) if (p !== "minimax") opt(`${p}：没有做连接测试，第一次用请先配 examples/样片 试试`);
}

console.log(`\n${bad ? `有 ${bad} 项必须先解决。` : "必需的都齐了，可以开始做播客。"}${warnN ? ` ${warnN} 项可选的没装，不影响基本使用。` : ""}${process.argv.includes("--online") ? "" : "\n想确认密钥能用：node scripts/doctor.mjs --online（不计费）"}`);
process.exit(bad ? 1 : 0);
