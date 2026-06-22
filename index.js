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

  const loading = await bot.sendMessage(chatId, '📥 Processando link em Full HD 1080p...');
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

  // Fingir ser um navegador real para o Instagram não bloquear e liberar 1080p
  const userAgent = '--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"';

  // CONFIGURAÇÃO ULTRAFAST 1080P
  const forceMaxFormat = '-f "bestvideo+bestaudio/best" --merge-output-format mp4 --recode-video mp4 --postprocessor-args "ffmpeg:-vcodec libx264 -preset ultrafast -pix_fmt yuv420p -acodec aac"';
    
  let command = '';
  let fallbackCommand = `yt-dlp ${ffmpegLocationCmd} ${userAgent} ${forceMaxFormat} --no-playlist --force-overwrites -o "${fileName}" "${text.split('?')[0]}"`;

  if (isInstagram) {
    const cleanUrl = text.split('?')[0];
    if (fs.existsSync(localCookies)) {
      command = `yt-dlp ${ffmpegLocationCmd} --cookies "${localCookies}" ${userAgent} ${forceMaxFormat} --no-playlist --force-overwrites -o "${fileName}" "${cleanUrl}"`;
    } else {
      command = fallbackCommand;
    }
  } else {
    command = `yt-dlp ${ffmpegLocationCmd} ${userAgent} ${forceMaxFormat} --no-playlist --force-overwrites -o "${fileName}" "${text}"`;
  }

  console.log("\n⏳ Tentando download...");

  const runDownload = (cmd, isFallback = false) => {
    exec(cmd, async (error, stdout, stderr) => {
      if (error) {
        console.log(`❌ Erro no comando (Fallback: ${isFallback}):`, error);
        
        if (!isFallback && isInstagram && fs.existsSync(localCookies)) {
          console.log("⚠️ Comando com cookies falhou. Tentando modo público com User-Agent...");
          runDownload(fallbackCommand, true);
          return;
        }

        bot.editMessageText('❌ Erro ao processar este vídeo em 1080p. O link pode ser privado ou o Instagram bloqueou.', { chat_id: chatId, message_id: loading.message_id });
        if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
        return;
      }

      try {
        if (!fs.existsSync(fileName)) {
          bot.editMessageText('❌ Erro: Arquivo final não gerado.', { chat_id: chatId, message_id: loading.message_id });
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
  };

  runDownload(command);
});
