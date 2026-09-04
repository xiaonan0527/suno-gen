#!/usr/bin/env node
/**
 * Suno 音乐生成脚本
 * 支持两种模式：
 *   1. 提交新任务：--prompt → 提交 → 轮询 → 下载
 *   2. 下载已有任务：--task-id → 查询 → 下载
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SUNO_CONFIG_PATH = path.join(os.homedir(), '.nange-ai', 'suno-config.json');
const LEGACY_CONFIG_PATH = path.join(os.homedir(), '.nange-ai', 'config.json');
const BASE_URL = 'https://api.nange-ai.com/suno/v1';

/**
 * 读取 API Key（优先级：环境变量 > Suno 专属配置 > 通用配置的 suno_api_key 字段）
 */
function loadApiKey() {
  const envKey = process.env.NANGE_SUNO_API_KEY || process.env.SUNO_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  // Suno 专属配置文件
  if (fs.existsSync(SUNO_CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(SUNO_CONFIG_PATH, 'utf-8'));
      if (config.api_key && config.api_key !== 'YOUR_KEY' && config.api_key.trim()) {
        return config.api_key.trim();
      }
    } catch (_) { /* ignore parse errors */ }
  }

  // 兼容：从通用配置读取 suno_api_key 字段
  if (fs.existsSync(LEGACY_CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(LEGACY_CONFIG_PATH, 'utf-8'));
      if (config.suno_api_key && config.suno_api_key !== 'YOUR_KEY' && config.suno_api_key.trim()) {
        return config.suno_api_key.trim();
      }
    } catch (_) { /* ignore parse errors */ }
  }

  console.error('错误：未找到 Suno API Key');
  console.error('');
  console.error('请选择以下任一方式配置：');
  console.error('');
  console.error('  方式 A（环境变量，推荐）：');
  console.error('    export NANGE_SUNO_API_KEY="your-api-key"');
  console.error('');
  console.error('  方式 B（Suno 专属配置文件）：');
  if (process.platform === 'win32') {
    console.error(`    mkdir "%USERPROFILE%\\.nange-ai" && echo {"api_key":"YOUR_KEY"} > "%USERPROFILE%\\.nange-ai\\suno-config.json"`);
  } else {
    console.error(`    mkdir -p ~/.nange-ai && echo '{"api_key":"YOUR_KEY"}' > ~/.nange-ai/suno-config.json`);
  }
  console.error('');
  console.error('  ⚠ 注意：Suno 与 GPT-Image 使用不同的 API Key，请勿混用。');
  console.error('');
  console.error('API Key 创建地址：https://api.nange-ai.com/keys（选择 Suno 分组）');
  process.exit(1);
}

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
          }
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function downloadFile(url, dest, apiKey) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const options = { headers: {} };
    if (urlObj.hostname.includes('nange-ai.com')) {
      options.headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const doDownload = (targetUrl) => {
      const m = targetUrl.startsWith('https') ? https : http;
      m.get(targetUrl, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doDownload(res.headers.location);
        }
        if (res.statusCode >= 400) {
          reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          return;
        }
        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); resolve(); });
        ws.on('error', reject);
      }).on('error', reject);
    };
    doDownload(url);
  });
}

async function submitTask(apiKey, opts) {
  const body = {
    model: 'suno',
    version: opts.version,
    prompt: opts.prompt,
    custom: opts.custom,
    instrumental: opts.instrumental,
  };

  if (opts.vocalGender) {
    body.vocal_gender = opts.vocalGender;
  }
  if (opts.title) {
    body.title = opts.title;
  }
  if (opts.tags) {
    body.style = opts.tags;
  }

  const payload = JSON.stringify(body);

  const result = await request(`${BASE_URL}/music/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  }, payload);

  if (result.error) {
    throw new Error(result.error.message || JSON.stringify(result.error));
  }

  const taskIds = [];
  if (Array.isArray(result.data)) {
    for (const item of result.data) {
      if (item.task_id) taskIds.push(item.task_id);
    }
  }
  if (taskIds.length === 0) {
    throw new Error('未获取到任务 ID，响应: ' + JSON.stringify(result).substring(0, 300));
  }
  return taskIds[0];
}

/**
 * 查询任务状态（单次），返回 { status, music, progress }
 */
async function fetchTaskStatus(apiKey, taskId) {
  const result = await request(`${BASE_URL}/music/tasks/${taskId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  const data = result.data || result;
  const status = (data.status || '').toLowerCase();
  const music = (data.result && data.result.music) || [];
  const progress = data.progress || 0;
  const errorMsg = (data.error && data.error.message) || data.message || '';

  return { status, music, progress, errorMsg };
}

/**
 * 轮询任务直到完成或失败
 */
async function pollTask(apiKey, taskId, interval) {
  const timeout = 15 * 60 * 1000; // Suno 生成可能需要 5-10 分钟
  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeout) {
      throw new Error('任务超时（超过 15 分钟）');
    }

    const { status, music, progress, errorMsg } = await fetchTaskStatus(apiKey, taskId);

    if (status === 'completed') {
      if (music.length === 0) {
        throw new Error('任务完成但未返回音乐数据');
      }
      return music;
    }
    if (status === 'failed') {
      throw new Error(errorMsg || '任务失败');
    }

    process.stderr.write(`生成中... ${progress}% (状态: ${status})\n`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

/**
 * 下载所有曲目的媒体文件（音频、封面、歌词、视频）
 */
async function downloadAllTracks(music, outPath, apiKey) {
  const outDir = path.dirname(outPath);
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outExt = path.extname(outPath);
  const outBase = path.basename(outPath, outExt);
  const downloadedPaths = [];

  for (let ti = 0; ti < music.length; ti++) {
    const track = music[ti];
    const trackSuffix = music.length > 1 ? `_${ti + 1}` : '';
    const trackBase = outBase + trackSuffix;

    process.stderr.write(`\n--- 曲目 ${ti + 1}/${music.length} ---\n`);
    process.stderr.write(`歌曲标题: ${track.title || '未知'}\n`);
    if (track.tags) process.stderr.write(`音乐风格: ${track.tags}\n`);
    if (track.duration) process.stderr.write(`时长: ${track.duration}s\n`);

    const audioUrl = track.audio_url;
    if (!audioUrl) {
      process.stderr.write(`警告：曲目 ${ti + 1} 无音频链接，跳过\n`);
      continue;
    }

    const audioPath = path.join(outDir, trackBase + outExt);
    process.stderr.write(`正在下载音频到 ${audioPath} ...\n`);
    try {
      await downloadFile(audioUrl, audioPath, apiKey);
      process.stderr.write(`音频下载完成\n`);
      downloadedPaths.push(audioPath);
    } catch (e) {
      process.stderr.write(`音频下载失败: ${e.message}\n`);
      continue;
    }

    // 下载封面图片
    if (track.image_url || track.image_large_url) {
      const imgUrl = track.image_large_url || track.image_url;
      const imgExt = imgUrl.includes('.png') ? '.png' : '.jpg';
      const imgPath = path.join(outDir, trackBase + '_cover' + imgExt);
      try {
        process.stderr.write(`正在下载封面到 ${imgPath} ...\n`);
        await downloadFile(imgUrl, imgPath, apiKey);
        process.stderr.write(`封面下载完成\n`);
      } catch (e) {
        process.stderr.write(`封面下载失败: ${e.message}\n`);
      }
    }

    // 保存歌词
    if (track.lyrics) {
      const lyricsPath = path.join(outDir, trackBase + '_lyrics.txt');
      fs.writeFileSync(lyricsPath, track.lyrics, 'utf-8');
      process.stderr.write(`歌词已保存到 ${lyricsPath}\n`);
    }

    // 下载视频（如果有）
    if (track.video_url) {
      const videoPath = path.join(outDir, trackBase + '_video.mp4');
      try {
        process.stderr.write(`正在下载视频到 ${videoPath} ...\n`);
        await downloadFile(track.video_url, videoPath, apiKey);
        process.stderr.write(`视频下载完成\n`);
      } catch (e) {
        process.stderr.write(`视频下载失败: ${e.message}\n`);
      }
    }
  }

  return downloadedPaths;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    prompt: '',
    taskId: '',
    version: 'v5.5',
    custom: false,
    instrumental: false,
    out: './output.mp3',
    pollInterval: 5000,
    vocalGender: '',
    title: '',
    tags: '',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--prompt': parsed.prompt = args[++i]; break;
      case '--task-id': parsed.taskId = args[++i]; break;
      case '--version': parsed.version = args[++i]; break;
      case '--custom': parsed.custom = true; break;
      case '--instrumental': parsed.instrumental = true; break;
      case '--vocal-gender': parsed.vocalGender = args[++i]; break;
      case '--title': parsed.title = args[++i]; break;
      case '--tags': parsed.tags = args[++i]; break;
      case '--out': parsed.out = args[++i]; break;
      case '--poll-interval': parsed.pollInterval = parseInt(args[++i], 10) * 1000; break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  if (!parsed.prompt && !parsed.taskId) {
    console.error('错误：必须提供 --prompt（提交新任务）或 --task-id（下载已有任务）');
    console.error('');
    printUsage();
    process.exit(1);
  }
  return parsed;
}

function printUsage() {
  console.error('用法:');
  console.error('  提交新任务:  node generate.js --prompt "提示词" [选项]');
  console.error('  下载旧任务:  node generate.js --task-id "task_xxx" --out ./output.mp3');
  console.error('');
  console.error('选项:');
  console.error('  --prompt <text>          音乐描述或歌词（提交新任务时必填）');
  console.error('  --task-id <id>           已有任务 ID（直接查询并下载，跳过提交步骤）');
  console.error('  --version <ver>          Suno 版本（默认 v5.5）');
  console.error('                           支持: v3.5, v4, v4.5, v4.5+, v4.5-all, v5, v5.5');
  console.error('  --custom                 使用自定义模式（传歌词）');
  console.error('  --instrumental           生成纯音乐（无人声）');
  console.error('  --vocal-gender <gender>  人声性别（male/female）');
  console.error('  --title <text>           歌曲标题（自定义模式）');
  console.error('  --tags <text>            音乐风格标签（自定义模式，如 "pop, rock"）');
  console.error('  --out <path>             输出文件路径（默认 ./output.mp3）');
  console.error('  --poll-interval <sec>    轮询间隔秒数（默认 5）');
}

async function main() {
  const opts = parseArgs();
  const apiKey = loadApiKey();

  let taskId;
  let music;

  if (opts.taskId) {
    // 模式 B：直接用已有的 task_id 查询并下载
    taskId = opts.taskId;
    process.stderr.write(`查询已有任务: ${taskId}\n`);

    const { status, music: fetchedMusic, progress, errorMsg } = await fetchTaskStatus(apiKey, taskId);

    if (status === 'failed') {
      throw new Error(`任务已失败: ${errorMsg || '未知原因'}`);
    }

    if (status === 'completed') {
      if (fetchedMusic.length === 0) {
        throw new Error('任务已完成但未返回音乐数据');
      }
      process.stderr.write(`任务已完成，开始下载\n`);
      music = fetchedMusic;
    } else {
      // 任务还没完成，继续轮询
      process.stderr.write(`任务进行中 (${progress}%)，继续轮询...\n`);
      music = await pollTask(apiKey, taskId, opts.pollInterval);
    }
  } else {
    // 模式 A：提交新任务
    const mode = opts.custom ? '自定义模式' : '灵感模式';
    const instrLabel = opts.instrumental ? '（纯音乐）' : '';
    process.stderr.write(`正在提交 Suno ${opts.version} ${mode}${instrLabel}任务\n`);
    process.stderr.write(`  prompt: ${opts.prompt}\n`);
    if (opts.title) process.stderr.write(`  title: ${opts.title}\n`);
    if (opts.tags) process.stderr.write(`  tags: ${opts.tags}\n`);
    if (opts.vocalGender) process.stderr.write(`  vocal_gender: ${opts.vocalGender}\n`);

    taskId = await submitTask(apiKey, opts);
    process.stderr.write(`任务已提交: ${taskId}\n`);
    process.stderr.write(`轮询结果中...\n`);

    music = await pollTask(apiKey, taskId, opts.pollInterval);
  }

  if (music.length === 0) {
    throw new Error('任务完成但未返回音乐数据');
  }

  process.stderr.write(`\n共生成 ${music.length} 首曲目\n`);

  const outPath = path.resolve(opts.out);
  const downloadedPaths = await downloadAllTracks(music, outPath, apiKey);

  if (downloadedPaths.length === 0) {
    throw new Error('所有曲目下载均失败');
  }

  // stdout 输出所有下载的文件路径（每行一个）
  downloadedPaths.forEach(p => console.log(p));
}

main().catch((err) => {
  console.error(`错误：${err.message}`);
  process.exit(1);
});
