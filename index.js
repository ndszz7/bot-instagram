const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
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

  const loading = await bot.sendMessage(chatId, '📥 Baixando em qualidade máxima (1080p)...');
  const downloadsDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

  const fileName = path.join(downloadsDir, `video_${Date.now()}.mp4`);
  const localCookies = path.join(__dirname, 'cookies.txt');

  let ffmpegLocationCmd = '';
  if (process.platform === 'win32') {
    ffmpegLocationCmd = `--ffmpeg-location "${__dirname}"`;
  } else {
    try {
      const ffmpegStatic = require('ffmpeg-static');
      ffmpegLocationCmd = `--ffmpeg-location "${path.dirname(ffmpegStatic)}"`;
    } catch (e) {
      ffmpegLocationCmd = '';
    }
  }

  // COMANDO FORÇA MÁXIMA: Pede o melhor formato absoluto de vídeo e áudio disponível
  // E converte em super velocidade para não estourar os 512MB do Render
  const forceMaxFormat = '-f "bestvideo+bestaudio/best" --merge-output-format mp4 --recode-video mp4 --postprocessor-args "ffmpeg:-vcodec libx264 -preset ultrafast -pix_fmt yuv420p -acodec aac"';
    
  let command = '';
  if (isInstagram) {
    const cleanUrl = text.split('?')[0];
    
    // Se você enviou o cookies.txt para o GitHub, o Render vai entrar por aqui logado na sua conta
    if (fs.existsSync(localCookies)) {
      console.log("🔑 Usando cookies.txt para liberar o 1080p...");
      command = `yt-dlp ${ffmpegLocationCmd} --cookies "${localCookies}" ${forceMaxFormat} --no-playlist --force-overwrites -o "${fileName}" "${cleanUrl}"`;
    } else {
      console.log("⚠️ Cookies não encontrados, baixando como modo público (pode limitar a 720p)...");
      command = `yt-dlp ${ffmpegLocationCmd} ${forceMaxFormat} --no-playlist --force-overwrites -o "${fileName}" "${cleanUrl}"`;
    }
  } else {
    // TikTok geralmente não bloqueia 1080p no modo público
    command = `yt-dlp ${ffmpegLocationCmd} ${forceMaxFormat} --no-playlist --force-overwrites -o "${fileName}" "${text}"`;
  }

  console.log("\n⏳ Iniciando processo Full HD...");

  exec(command, async (error, stdout, stderr) => {
    console.log("📄 SAÍDA:", stdout);

    if (error) {
      bot.editMessageText('❌ Erro ao baixar vídeo.', { chat_id: chatId, message_id: loading.message_id });
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
      return;
    }

    try {
      if (!fs.existsSync(fileName)) {
        bot.editMessageText('❌ Arquivo sumiu.', { chat_id: chatId, message_id: loading.message_id });
        return;
      }

      await bot.editMessageText('🚀 Enviando vídeo FullHD...', { chat_id: chatId, message_id: loading.message_id });

      await bot.sendVideo(chatId, fileName, {
        caption: '✅ Vídeo em alta qualidade!',
        supports_streaming: true
      });

    } catch (err) {
      bot.sendMessage(chatId, '❌ Erro no envio.');
    } finally {
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      }
    }
  });
});
