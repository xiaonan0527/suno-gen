---
name: "nange-suno-gen"
description: "Use when the user wants to generate music using Suno through Nange AI. Supports inspiration mode and custom mode with lyrics, multiple Suno versions."
---

# Suno 音乐生成 Skill (Nange AI)

AI 编码工具（Claude Code / Codex）的一键音乐生成技能，通过 Nange AI 平台调用 Suno 音乐生成 API。

## 安装

将以下内容发送给你的 AI 编码助手：

```
帮我安装 https://github.com/xiaonan0527/suno-gen/blob/main/README.md 这个 skill，并生成一首歌
```

AI 会自动完成安装和配置。

## 配置

**方式 A：环境变量（推荐）**

```bash
export NANGE_SUNO_API_KEY="your-api-key-here"
```

**方式 B：Suno 专属配置文件**

```bash
mkdir -p ~/.nange-ai && echo '{"api_key":"your-api-key-here"}' > ~/.nange-ai/suno-config.json
```

如果还没有 API Key，前往 [Nange AI 控制台](https://api.nange-ai.com/keys) 创建一个 **Suno 分组** 的密钥。

> **注意**：Suno 与 GPT-Image 使用不同的 Key 和配置，互不冲突。Suno 用 `NANGE_SUNO_API_KEY` + `suno-config.json`，GPT-Image 用 `NANGE_API_KEY` + `config.json`。

## 使用

安装后，直接对 AI 说：

- "帮我写一首关于夏天的歌"
- "生成一首轻快的流行音乐"
- "用这段歌词生成音乐：在那遥远的地方..."
- "帮我做一段纯音乐背景"

## 脚本用法

### 灵感模式（默认）

用自然语言描述想要的音乐风格和主题：

```bash
node scripts/generate.js \
  --prompt "一首轻快的流行歌曲，关于夏天的海边，青春活力" \
  --version "v5.5" \
  --out ./summer-song.mp3
```

### 自定义模式

传入歌词，AI 谱曲并演唱：

```bash
node scripts/generate.js \
  --prompt "在那遥远的地方，有一片蔚蓝的海\n微风轻轻吹过，带走所有尘埃" \
  --custom \
  --title "远方的海" \
  --tags "pop, ballad, chinese" \
  --version "v5.5" \
  --out ./distant-sea.mp3
```

### 纯音乐

```bash
node scripts/generate.js \
  --prompt "ambient electronic, peaceful meditation" \
  --instrumental \
  --out ./meditation.mp3
```

### 指定人声性别

```bash
node scripts/generate.js \
  --prompt "a romantic love song, acoustic guitar" \
  --vocal-gender female \
  --out ./love-song.mp3
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--prompt` | 音乐描述或歌词（必填） | - |
| `--out` | 输出文件路径 | `./output.mp3` |
| `--version` | Suno 版本 | `v5.5` |
| `--custom` | 启用自定义模式（传歌词） | `false` |
| `--instrumental` | 生成纯音乐（无人声） | `false` |
| `--vocal-gender` | 人声性别 `male`/`female` | 不指定 |
| `--title` | 歌曲标题（自定义模式可选） | - |
| `--tags` | 风格标签（自定义模式可选） | - |
| `--poll-interval` | 轮询间隔（秒） | `5` |

## 支持的版本

| 版本 | 说明 |
|------|------|
| `v5.5` | 最新版本，音质最佳（推荐） |
| `v5` | 上一代旗舰版本 |
| `v4.5+` | v4.5 增强版 |
| `v4.5-all` | v4.5 全功能版 |
| `v4.5` | v4.5 标准版 |
| `v4` | v4 版本 |
| `v3.5` | 经典版本 |

## 两种生成模式

### 灵感模式 (Inspiration)

- 用自然语言描述你想要的音乐风格、主题、情感
- AI 自动创作歌词和旋律
- 适合快速生成，不需要准备歌词
- **不传 `--custom` 参数**

### 自定义模式 (Custom)

- 传入你写好的歌词，AI 负责谱曲和演唱
- 可通过 `--tags` 指定音乐风格
- 可通过 `--title` 指定歌曲标题
- 适合对歌词有要求的场景
- **传入 `--custom` 参数**

## 输出文件

脚本完成后会自动下载以下文件到 `--out` 指定路径的同级目录：

| 文件 | 命名规则 | 说明 |
|------|---------|------|
| 音频 | `<name>.mp3` | 生成的歌曲（stdout 输出此路径） |
| 封面 | `<name>_cover.jpg` | 歌曲封面图片 |
| 歌词 | `<name>_lyrics.txt` | 完整歌词文本 |
| 视频 | `<name>_video.mp4` | 音乐视频（如上游返回） |

## API 说明

- 接口地址：`https://api.nange-ai.com/suno/v1`
- 异步模式：提交后返回 `task_id`，轮询 `/music/tasks/{task_id}` 获取结果
- 完成后自动下载音频、封面图、歌词、视频等完整媒体
- 计费：只在任务完成后扣费，失败不扣费

## License

MIT
