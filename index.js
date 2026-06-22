
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');

// SERVIDOR WEB
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('BOT ONLINE'));
app.listen(PORT, () => console.log(`🌐 Web server online na porta ${PORT}`));

// TOKEN DO TELEGRAM
const token = process.env.TELEGRAM_TOKEN || '8910812106:AAG-eNClV2rJTbimoAObi8kxWZhmTwrFVpI'; 
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Bot online...');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  const isTikTok = text.includes('tiktok.com') || text.includes('vm.tiktok.com') || text.includes('vt.tiktok.com');
  const isInstagram = text.includes('instagram.com');

  if (!isTikTok && !isInstagram) {
    bot.sendMessage(chatId, '📎 Envie um link válido do TikTok ou do Instagram.');
    return;
  }

  const loading = await bot.sendMessage(chatId, '📥 Processando link em Full HD 1080p (Pode levar de 1 a 2 minutos)...');
  const downloadsDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

  const fileName = path.join(downloadsDir, `video_${Date.now()}.mp4`);
  const localCookies = path.join(__dirname, 'cookies.txt');

  let ffmpegPath = '';
  if (process.platform === 'win32') {
    ffmpegPath = __dirname;
  } else {
    try {
      const ffmpegStatic = require('ffmpeg-static');
      ffmpegPath = path.dirname(ffmpegStatic);
    } catch (e) {
      ffmpegPath = '';
    }
  }

  // Desmembrando os argumentos do yt-dlp de forma segura para o Spawn
  const args = [
    '-f', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--recode-video', 'mp4',
    '--postprocessor-args', 'ffmpeg:-vcodec libx264 -preset ultrafast -pix_fmt yuv420p -acodec aac',
    '--no-playlist',
    '--force-overwrites',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-o', fileName
  ];

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  // Se houver cookies corretos, injeta no comando
  if (isInstagram && fs.existsSync(localCookies)) {
    args.push('--cookies', localCookies);
  }

  // Adiciona a URL no final dos argumentos
  const cleanUrl = text.split('?')[0];
  args.push(cleanUrl);

  console.log("\n⏳ Iniciando download via Stream (Spawn)...");

  // Dispara o yt-dlp de forma segura
  const child = spawn('yt-dlp', args);

  // Monitora a saída em tempo real (impede o congelamento por estouro de buffer)
  child.stdout.on('data', (data) => {
    console.log(`[yt-dlp]: ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.log(`[yt-dlp-warning]: ${data.toString().trim()}`);
  });

  child.on('close', async (code) => {
    console.log(`Processo finalizado com código: ${code}`);

    if (code !== 0) {
      bot.editMessageText('❌ Erro ao baixar o vídeo em 1080p. O link pode ser privado ou os cookies expiraram.', { chat_id: chatId, message_id: loading.message_id });
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
      return;
    }

    try {
      if (!fs.existsSync(fileName)) {
        bot.editMessageText('❌ Erro: Arquivo final não encontrado.', { chat_id: chatId, message_id: loading.message_id });
        return;
      }

      await bot.editMessageText('🚀 Enviando vídeo em Full HD...', { chat_id: chatId, message_id: loading.message_id });

      await bot.sendVideo(chatId, fileName, {
        caption: '✅ Baixado em Full HD 1080p!',
        supports_streaming: true
      });

    } catch (err) {
      console.log("❌ Erro no envio do Telegram:", err);
      bot.sendMessage(chatId, '❌ Erro ao enviar o arquivo de vídeo.');
    } finally {
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
    }
  });
});
