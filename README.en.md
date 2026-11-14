<p align="center">
  <img src="assets/banner.png" alt="podcast-maker: hand it an article, hear two people talk it through on your commute" width="100%">
</p>

<p align="center">
  <a href="README.md">中文</a> · <b>English</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Agent%20Skill-Claude%20Code%20%7C%20Codex-D9774A" alt="Agent Skill">
  <img src="https://img.shields.io/badge/TTS-MiniMax%20%7C%20Doubao%20%7C%20ElevenLabs-3F6B5B" alt="TTS">
  <img src="https://img.shields.io/badge/Node.js-18%2B-1F1B16" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/License-MIT-B9A88F" alt="MIT">
</p>

**podcast-maker** is an Agent Skill that turns an article, a web page, a paper, a policy document or a book chapter (English sources included) into a **two-host, Mandarin Chinese podcast**: it writes the script, voices it line by line, checks every line, and hands you an MP3.

Listen once on your commute and you know what the piece says, which numbers matter, and whether it is worth reading in full.

```text
You: Turn this into a podcast: https://mp.weixin.qq.com/s/...

Agent:
  ✓ Article fetched: ~8,700 characters
  ✓ Study brief: 5 key points, 29 must-mention facts marked
  ✓ Dialogue script: 122 turns, ~11 min, health check passed, all 29 facts covered
  ✓ Voiced 150 lines, each one transcribed back and compared
  ✓ MP3: 10:57, sent to Feishu
```

> The podcasts it produces are in Chinese. Source material can be in English or other languages; it is translated first.

## How it works

| Step | What happens | Output |
|---|---|---|
| 1. Read | Extract the article text from web pages and WeChat posts; read PDF / Word; translate foreign-language sources in full | `原文.md` (`译文.md`) |
| 2. Brief | Keep only the core: one-line summary, 3–5 key points, what's worth debating; mark must-mention facts with 【】 | `精讲稿.md` |
| 3. Script | Rewrite as a conversation: opening → topics → discussion → self-quiz → close | `对谈稿.md` |
| 4. Health check | Free, offline checks: who talks too much, lecture-style monologues, too smooth, jargon, missing 【】 facts | warnings |
| 5. Voice | Synthesize line by line → QC → regenerate failures → match loudness → assemble with pauses and overlaps | `<title>.mp3` |

You can stop after any step: brief only, script only, or all the way to MP3.

## Features

**Scripts that sound like a conversation, and still teach**
- **Brief first, then dialogue.** The brief is a standalone study note; the dialogue is its audio version.
- **Nothing important gets dropped.** Facts marked 【】 in the brief (claims, numbers, names, dates) are checked one by one against the script.
- **Written for smart non-experts by default.** Deep content, plain words. Jargon is explained by what it does before it is named.
- **Per-genre writing guides** for tech, policy documents, politics & world news, history, books & papers, business & finance, science & health, news & opinion.
- **Your angle, your audience.** "Explain it for my parents", "focus on what it means for ordinary people", "from a product manager's view" — the episode follows it.
- **Discussion and a quiz.** The hosts can disagree; 2–3 quiz questions at the end, each followed by a few seconds of silence.

**Natural, reliable voice**
- **Line-by-line synthesis** with interruptions, quick replies, breaths, light laughs and quiz pauses laid out on a timeline.
- **Line-by-line QC**: duration, speaking rate, odd silences, clipping, plus local speech recognition that transcribes each line and compares it with the script. Mismatches are regenerated (up to 3 takes).
- **Loudness matched** between the two voices; final MP3 normalized.
- **Cached per line**: edit one line, re-voice one line.

**Easy to plug in**
- **Many sources**: WeChat posts, regular web pages (built-in extractor, no dependencies), PDF, Word, EPUB, pasted text.
- **Swappable TTS**: MiniMax by default (voice cloning, sound tags); Doubao and ElevenLabs adapters included; add your own.
- **Send to your phone** when done, with any command you configure (Feishu/Lark, Telegram, …).
- **Works with any agent that supports Agent Skills**: Claude Code, Codex and others.

## Quick start

```bash
# Claude Code
git clone https://github.com/bingfeng131415/podcast-maker ~/.claude/skills/podcast-maker
# Codex
git clone https://github.com/bingfeng131415/podcast-maker ~/.codex/skills/podcast-maker
# Other Agent Skills-compatible tools
git clone https://github.com/bingfeng131415/podcast-maker ~/.agents/skills/podcast-maker

# API key (MiniMax by default)
mkdir -p ~/.config/podcast-maker
cp ~/.claude/skills/podcast-maker/.env.example ~/.config/podcast-maker/.env
# then fill in MINIMAX_API_KEY
```

Requires Node.js 18+ and ffmpeg. Optional: [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) for transcription QC on Apple Silicon (skipped automatically if missing).

Then just ask your agent:

- "Make a podcast from this: https://…"
- "Chapter 3 of this PDF, brief only."
- "Turn this policy document into a two-person discussion for my parents. No audio yet."

Try `examples/样片` first (30 seconds) to hear the default voices.

## Voices and providers

Default: MiniMax `speech-2.8-hd`, female host "Warm Bestie", male explainer "Reliable Executive". Switch with `--voice <preset>`; put cloned voices, a different provider or a send-to-phone command in `~/.config/podcast-maker/config.json` (see `config.example.json` and `references/语音服务.md`).

| Provider | Status |
|---|---|
| MiniMax | Tested. Sound tags, emotions, pronunciation dictionary, cloned voices |
| Doubao (Volcengine) | Implemented from public docs, not yet tested |
| ElevenLabs | Implemented from public docs, not yet tested |

## Real-world numbers

One ~11-minute episode from a ~8,700-character Chinese tech article: ~2,800-character script, 150 lines, about 10 minutes to synthesize and check on an Apple Silicon Mac, ~3,500 characters billed by MiniMax (including 7 regenerated lines).

## Notes

- The health check (`--plan`) costs nothing; only the voicing step calls a paid TTS API.
- Everything except mlx-whisper QC works on any OS.
- Books and articles remain their authors' copyright. Make podcasts for your own listening, not for publication.

## Credits

Script-writing ideas borrowed from [wang-h/natural-ai-podcast](https://github.com/wang-h/natural-ai-podcast) and [zarazhangrui/personalized-podcast](https://github.com/zarazhangrui/personalized-podcast).

## License

[MIT](LICENSE)
