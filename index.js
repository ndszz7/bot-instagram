const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');

// SERVIDOR WEB (O Render exige que essa porta responda para não dar erro de Timeout)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('BOT ONLINE'));
app.listen(PORT, () => console.log(`🌐 Web server online na porta ${PORT}`));

// TOKEN DO TELEGRAM (Pegando das variáveis de ambiente na nuvem ou usando o seu local)
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

  const loading = await bot.sendMessage(chatId, '📥 Baixando vídeo...');
  const downloadsDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

  const fileName = path.join(downloadsDir, `video_${Date.now()}.mp4`);
  const localCookies = path.join(__dirname, 'cookies.txt');

  // CONFIGURAÇÃO DO FFMPEG INTELIGENTE (Detecta se está no Windows ou Linux/Render)
  let ffmpegLocationCmd = '';
  if (process.platform === 'win32') {
    // Se for no seu PC (Windows), aponta para a pasta atual onde estão os arquivos .exe
    ffmpegLocationCmd = `--ffmpeg-location "${__dirname}"`;
  } else {
    // Se for no Render (Linux), ele localiza dinamicamente o pacote 'ffmpeg-static'
    try {
      const ffmpegStatic = require('ffmpeg-static');
      ffmpegLocationCmd = `--ffmpeg-location "${path.dirname(ffmpegStatic)}"`;
    } catch (e) {
      console.log("⚠️ Avançando sem ffmpeg-static específico, tentando global...");
      ffmpegLocationCmd = '';
    }
  }

  // ESTRATÉGIA LEVE: Busca formatos pré-comprimidos em MP4/M4A para não travar no celular e nem estourar a RAM do Render
  const lightFormat = '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
    
  let command = '';
  if (isInstagram) {
    const cleanUrl = text.split('?')[0];
    
    // Verifica se os cookies existem (Local ou injetados na nuvem)
    if (fs.existsSync(localCookies)) {
      command = `yt-dlp ${ffmpegLocationCmd} --cookies "${localCookies}" ${lightFormat} --no-playlist --force-overwrites -o "${fileName}" "${cleanUrl}"`;
    } else {
      // Se não achar o arquivo cookies.txt, tenta baixar de forma pública
      command = `yt-dlp ${ffmpegLocationCmd} ${lightFormat} --no-playlist --force-overwrites -o "${fileName}" "${cleanUrl}"`;
    }
  } else {
    command = `yt-dlp ${ffmpegLocationCmd} ${lightFormat} --no-playlist --force-overwrites -o "${fileName}" "${text}"`;
  }

  console.log("\n⏳ Iniciando download estável do link enviado...");

  exec(command, async (error, stdout, stderr) => {
    console.log("📄 SAÍDA DO TERMINAL:\n", stdout);
    if (stderr) console.log("⚠️ AVISOS DO TERMINAL:\n", stderr);

    if (error) {
      console.log("❌ ERRO CRÍTICO NO PROCESSO:\n", error);
      bot.editMessageText('❌ Erro ao baixar vídeo.', { chat_id: chatId, message_id: loading.message_id });
      if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
      return;
    }

    try {
      if (!fs.existsSync(fileName)) {
        bot.editMessageText('❌ Arquivo não encontrado após o download.', { chat_id: chatId, message_id: loading.message_id });
        return;
      }

      await bot.editMessageText('🚀 Enviando vídeo...', { chat_id: chatId, message_id: loading.message_id });

      await bot.sendVideo(chatId, fileName, {
        caption: '✅ Vídeo baixado!',
        supports_streaming: true
      });

    } catch (err) {
      console.log("❌ Erro no envio:", err);
      bot.sendMessage(chatId, '❌ Erro ao enviar arquivo de vídeo.');
    } finally {
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
        console.log("🗑️ Arquivo temporário deletado com sucesso.");
      }
    }
  });
});
