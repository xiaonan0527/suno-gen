#!/usr/bin/env node
/**
 * Suno 音乐生成脚本
 * 提交生成任务 → 轮询任务状态 → 下载音频到本地
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.nange-ai', 'config.json');
const BASE_URL = 'https://api.nange-ai.com/suno/v1';

/**
 * 读取 API Key（优先级：环境变量 > 配置文件）
 */
function loadApiKey() {
  const envKey = process.env.NANGE_SUNO_API_KEY || process.env.SUNO_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.api_key && config.api_key !== 'YOUR_KEY' && config.api_key.trim()) {
        return config.api_key.trim();
      }
    } catch (_) { /* ignore parse errors */ }
  }

  console.error('错误：未找到 API Key');
  console.error('');
  console.error('请选择以下任一方式配置：');
  console.error('');
  console.error('  方式 A（环境变量）：');
  console.error('    export NANGE_SUNO_API_KEY="your-api-key"');
  console.error('');
  console.error('  方式 B（配置文件）：');
  if (process.platform === 'win32') {
    console.error(`    mkdir "%USERPROFILE%\\.nange-ai" && echo {"api_key":"YOUR_KEY"} > "%USERPROFILE%\\.nange-ai\\config.json"`);
  } else {
    console.error(`    mkdir -p ~/.nange-ai && echo '{"api_key":"YOUR_KEY"}' > ~/.nange-ai/config.json`);
  }
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
    body.tags = opts.tags;
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

async function pollTask(apiKey, taskId, interval) {
  const timeout = 10 * 60 * 1000; // 音乐生成可能需要更长时间
  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeout) {
      throw new Error('任务超时（超过 10 分钟）');
    }

    const result = await request(`${BASE_URL}/music/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const data = result.data || result;
    const status = (data.status || '').toLowerCase();

    if (status === 'completed') {
      const music = (data.result && data.result.music) || [];
      if (music.length === 0) {
        throw new Error('任务完成但未返回音乐数据');
      }
      return music;
    }
    if (status === 'failed') {
      const errMsg = (data.error && data.error.message) || data.message || '任务失败';
      throw new Error(errMsg);
    }

    const progress = data.progress || 0;
    process.stderr.write(`生成中... ${progress}% (状态: ${status})\n`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
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

  if (!parsed.prompt) {
    console.error('错误：--prompt 参数是必填的');
    console.error('');
    printUsage();
    process.exit(1);
  }
  return parsed;
}

function printUsage() {
  console.error('用法: node generate.js --prompt "提示词" [选项]');
  console.error('');
  console.error('选项:');
  console.error('  --prompt <text>          音乐描述或歌词（必填）');
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

  const mode = opts.custom ? '自定义模式' : '灵感模式';
  const instrLabel = opts.instrumental ? '（纯音乐）' : '';
  process.stderr.write(`正在提交 Suno ${opts.version} ${mode}${instrLabel}任务\n`);
  process.stderr.write(`  prompt: ${opts.prompt}\n`);
  if (opts.title) process.stderr.write(`  title: ${opts.title}\n`);
  if (opts.tags) process.stderr.write(`  tags: ${opts.tags}\n`);
  if (opts.vocalGender) process.stderr.write(`  vocal_gender: ${opts.vocalGender}\n`);

  const taskId = await submitTask(apiKey, opts);
  process.stderr.write(`任务已提交: ${taskId}\n`);
  process.stderr.write(`轮询结果中...\n`);

  const music = await pollTask(apiKey, taskId, opts.pollInterval);

  const track = music[0];
  const audioUrl = track.audio_url;
  if (!audioUrl) {
    throw new Error('任务完成但未返回音频链接');
  }

  process.stderr.write(`歌曲标题: ${track.title || '未知'}\n`);
  if (track.tags) process.stderr.write(`音乐风格: ${track.tags}\n`);
  if (track.duration) process.stderr.write(`时长: ${track.duration}s\n`);

  const outPath = path.resolve(opts.out);
  const outDir = path.dirname(outPath);
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  process.stderr.write(`正在下载音频到 ${outPath} ...\n`);
  await downloadFile(audioUrl, outPath, apiKey);
  process.stderr.write(`下载完成\n`);

  // 如果有封面图，也输出信息
  if (track.image_url) {
    process.stderr.write(`封面图片: ${track.image_url}\n`);
  }
  if (track.video_url) {
    process.stderr.write(`音乐视频: ${track.video_url}\n`);
  }

  // stdout 输出本地文件路径
  console.log(outPath);
}

main().catch((err) => {
  console.error(`错误：${err.message}`);
  process.exit(1);
});
