const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');

// SERVIDOR WEB (Necessário para plataformas de hospedagem)
const app = express();
app.get('/', (req, res) => res.send('BOT ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Web server online'));

// TOKEN DO TELEGRAM
const token = '8910812106:AAG-eNClV2rJTbimoAObi8kxWZhmTwrFVpI';
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Bot online...');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  // IDENTIFICAÇÃO DOS LINKS
  const isTikTok = text.includes('tiktok.com') || text.includes('vm.tiktok.com') || text.includes('vt.tiktok.com');
  const isInstagram = text.includes('instagram.com');

  if (!isTikTok && !isInstagram) {
    bot.sendMessage(chatId, '📎 Envie um link válido do TikTok ou do Instagram.');
    return;
  }

  const loading = await bot.sendMessage(chatId, '📥 Baixando e convertendo vídeo para celular...');
  const downloadsDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

  const fileName = path.join(downloadsDir, `video_${Date.now()}.mp4`);
  const localCookies = path.join(__dirname, 'cookies.txt');

  // Aponta para a pasta do bot onde estão os arquivos ffmpeg.exe e ffprobe.exe
  const ffmpegPath = __dirname;

  // Parâmetros robustos que forçam o FFmpeg a converter o vídeo para H.264 padrão (Universal para celulares)
  const forceMobileFormat = '--recode-video mp4 --postprocessor-args "ffmpeg:-vcodec libx264 -pix_fmt yuv420p -profile:v main -level 3.1 -acodec aac"';

  let command = '';
  if (isInstagram) {
    const cleanUrl = text.split('?')[0];
    command = `yt-dlp --ffmpeg-location "${ffmpegPath}" --cookies "${localCookies}" -f "bestvideo+bestaudio/best" ${forceMobileFormat} --no-playlist --force-overwrites -o "${fileName}" "${cleanUrl}"`;
  } else {
    command = `yt-dlp --ffmpeg-location "${ffmpegPath}" -f "bestvideo+bestaudio/best" ${forceMobileFormat} --no-playlist --force-overwrites -o "${fileName}" "${text}"`;
  }

  console.log("\n⏳ Iniciando download e conversão do link enviado...");

  // EXECUTA O YT-DLP
  exec(command, async (error, stdout, stderr) => {
    console.log("📄 SAÍDA DO TERMINAL (stdout):\n", stdout);
    if (stderr) console.log("⚠️ AVISOS/ERROS DO TERMINAL (stderr):\n", stderr);

    if (error) {
      console.log("❌ ERRO CRÍTICO NO PROCESSO:\n", error);
      bot.editMessageText('❌ Erro ao baixar vídeo. Verifique o terminal.', {
        chat_id: chatId,
        message_id: loading.message_id
      });
      return;
    }

    try {
      // VALIDA SE O ARQUIVO REALMENTE FOI GERADO
      if (!fs.existsSync(fileName)) {
        bot.editMessageText('❌ Arquivo não encontrado após o download.', {
          chat_id: chatId,
          message_id: loading.message_id
        });
        return;
      }

      await bot.editMessageText('🚀 Enviando vídeo...', {
        chat_id: chatId,
        message_id: loading.message_id
      });

      // ENVIA PARA O TELEGRAM
      await bot.sendVideo(chatId, fileName, {
        caption: '✅ Vídeo baixado em HD',
        supports_streaming: true
      });

      // REMOVE O ARQUIVO DO DISCO LOCAL
      fs.unlinkSync(fileName);
      console.log("📌 Vídeo enviado e arquivo temporário excluído com sucesso.");

    } catch (err) {
      console.log("❌ Erro no bloco de envio:", err);
      bot.sendMessage(chatId, '❌ Erro ao enviar arquivo de vídeo.');
    }
  });
});