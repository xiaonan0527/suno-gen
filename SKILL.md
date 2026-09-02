---
name: suno-music
description: 使用 Nange AI Suno API 生成音乐，支持灵感模式和自定义模式。当用户说"生成音乐"、"写歌"、"作曲"、"suno"、"帮我写一首歌"、"generate music"、"create a song"、"make a beat"等涉及 AI 音乐生成的请求时触发此技能。首次使用会引导配置 API Key，后续直接生成。
---

# Suno 音乐生成

通过 Nange AI 的 Suno API 生成音乐。支持灵感模式（描述生成）和自定义模式（歌词生成）。异步任务模式：提交 → 轮询 → 返回音频文件。

## 前置检查

每次触发时按顺序检查：

### 1. 检查 Node.js

运行 `node -v`，如果失败则提示用户：

> 此技能需要 Node.js 环境，请先安装：https://nodejs.org/
> 或参考文档中的 Node.js 环境安装指南。

### 2. 检查 API Key 配置

优先读取环境变量 `NANGE_SUNO_API_KEY`，如果未设置则检查 Suno 专属配置文件 `~/.nange-ai/suno-config.json`。

> ⚠ **注意**：Suno 与 GPT-Image 使用不同的 API Key 和配置文件，互不冲突。
> - Suno：环境变量 `NANGE_SUNO_API_KEY`，配置文件 `~/.nange-ai/suno-config.json`
> - GPT-Image：环境变量 `NANGE_API_KEY`，配置文件 `~/.nange-ai/config.json`

如果都不存在，引导用户选择一种方式配置：

**方式 A：环境变量（推荐）**
```bash
export NANGE_SUNO_API_KEY="这里粘贴你的Key"
```

**方式 B：Suno 专属配置文件**

**macOS / Linux：**
```bash
mkdir -p ~/.nange-ai && echo '{"api_key":"这里粘贴你的Key"}' > ~/.nange-ai/suno-config.json
```

**Windows (PowerShell)：**
```powershell
mkdir -Force "$env:USERPROFILE\.nange-ai" | Out-Null; '{"api_key":"这里粘贴你的Key"}' | Set-Content "$env:USERPROFILE\.nange-ai\suno-config.json"
```

告知用户 API Key 在这里创建：https://api.nange-ai.com/keys （选择 **Suno** 分组）

用户配置完成后才继续生成流程。已配置过的用户直接跳到生成步骤。

## 生成流程

读取配置后调用脚本：

**灵感模式（默认）— 用自然语言描述想要的音乐：**
```bash
node "$SKILL_DIR/scripts/generate.js" \
  --prompt "一首轻快的流行歌曲，关于夏天的海边" \
  --version "v5.5" \
  --out "./summer-song.mp3"
```

**自定义模式 — 传入歌词，AI 谱曲演唱：**
```bash
node "$SKILL_DIR/scripts/generate.js" \
  --prompt "在那遥远的地方，有一片蔚蓝的海..." \
  --custom \
  --title "远方的海" \
  --tags "pop, ballad" \
  --version "v5.5" \
  --out "./distant-sea.mp3"
```

**纯音乐（无人声）：**
```bash
node "$SKILL_DIR/scripts/generate.js" \
  --prompt "ambient electronic, peaceful meditation background music" \
  --instrumental \
  --version "v5.5" \
  --out "./meditation.mp3"
```

脚本自动完成：提交任务 → 轮询状态 → 下载音频到本地 → stdout 输出本地文件路径。

### 判断使用灵感模式还是自定义模式

- 用户只给了风格/主题描述（如"写一首关于春天的歌"）→ **灵感模式**，不加 `--custom`
- 用户提供了具体歌词 → **自定义模式**，加 `--custom`，歌词作为 `--prompt`
- 用户说"纯音乐"/"无人声"/"BGM"/"背景音乐" → 加 `--instrumental`
- 用户指定了性别（如"女声"/"男声"）→ 加 `--vocal-gender female` 或 `--vocal-gender male`

### 参数选择

根据用户需求选择参数：

- **version（版本）**：默认 `v5.5`（最新最优）。用户无特殊要求就用默认。
  - 支持：`v3.5`, `v4`, `v4.5`, `v4.5+`, `v4.5-all`, `v5`, `v5.5`
- **custom（模式）**：默认灵感模式。用户提供歌词 → 加 `--custom`
- **instrumental（纯音乐）**：默认有人声。用户要 BGM/纯音乐 → 加 `--instrumental`
- **vocal-gender（性别）**：默认不指定。用户要求男/女声 → `--vocal-gender male/female`
- **title（标题）**：自定义模式下可选，给歌曲命名
- **tags（风格标签）**：自定义模式下可选，如 `"pop, rock, energetic"`

## 输出

脚本成功后将音频下载到 `--out` 指定的本地路径（默认 `./output.mp3`），stdout 输出本地文件的绝对路径。将该路径展示给用户即可。

stderr 还会输出歌曲标题、风格标签、时长、封面图片链接、视频链接等元信息，可展示给用户。
