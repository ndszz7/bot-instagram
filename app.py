import os
import re
import asyncio
import threading
import tempfile
from http.server import SimpleHTTPRequestHandler, HTTPServer
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import yt_dlp

# 🔐 COLE SEU TOKEN DO TELEGRAM ENTRE AS ASPAS ABAIXO:
TOKEN = "8910812106:AAGLHszTgkxwhobcVXP7-WhRofACJ7iHUlA"

# 🍪 TEXTO DO SEU ARQUIVO DE COOKIES DO INSTAGRAM
COOKIES_DATA = """# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
# This is a generated file! Do not edit.

.instagram.com	TRUE	/	TRUE	1813622599	datr	RlcKaqUGEKdP5P5RxVrjThWK
.instagram.com	TRUE	/	TRUE	1810598602	ig_did	3A74E9BC-4858-4590-A034-8ADD1D4D2E54
.instagram.com	TRUE	/	TRUE	1810598601	ig_nrcb	1
.instagram.com	TRUE	/	TRUE	1813622601	mid	agpXRgALAAHnipDSlxoWvc_zb5kE
.instagram.com	TRUE	/	TRUE	1816659610	csrftoken	esadYygUHC5kq3UnOHp0BPIaMQY4TCqR
.instagram.com	TRUE	/	TRUE	1789875610	ds_user_id	77626382622
.instagram.com	TRUE	/	TRUE	1815278734	ps_l	1
.instagram.com	TRUE	/	TRUE	1815278734	ps_n	1
.instagram.com	TRUE	/	TRUE	1813635592	sessionid	77626382622%3ABxfwkyJHPiBLom%3A4%3AAYgR9MFOkG5Z8dzpzQh3VFpk9CqACjTl9hmImSebfw
.instagram.com	TRUE	/	TRUE	1782704392	wd	1810x802
.instagram.com	TRUE	/	TRUE	1782704392	dpr	0.75
.instagram.com	TRUE	/	TRUE	0	rur	"LDC\05477626382622\0541813635610:01ff5c27b12ce4c047a90201a396f3500764b03810717ceda0ee6f27dc80e848c1003e86"
"""

# --- SERVIDOR WEB AUXILIAR PARA O RENDER ---
def iniciar_servidor_falso():
    """Cria um servidor HTTP simples para o Render detectar uma porta aberta."""
    porta = int(os.environ.get("PORT", 5000))
    server_address = ('', porta)
    
    class SilentHandler(SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

    httpd = HTTPServer(server_address, SilentHandler)
    print(f"🌍 Servidor Web auxiliar ativo na porta {porta}")
    httpd.serve_forever()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando inicial do Bot."""
    await update.message.reply_text(
        "👋 **Olá! Eu sou o Bot Downloader do Instagram!**\n\n"
        "Envie qualquer link de **Reels, Vídeo ou IGTV** do Instagram.\n"
        "⚡ **MODO TURBO AUTO-AUTENTICADO:** Downloads rápidos e sem bloqueios!"
    )

def limpar_link_instagram(url):
    """Remove parâmetros de rastreamento do Instagram."""
    if "?" in url:
        return url.split("?")[0]
    return url

def extrair_video_instagram(url, output_filename):
    """Gera um arquivo temporário de cookies e tenta o download pelo yt-dlp."""
    
    # Cria um arquivo de texto temporário para o yt-dlp ler os cookies com segurança
    with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.txt') as cookie_file:
        cookie_file.write(COOKIES_DATA)
        cookie_file_path = cookie_file.name

    # 🎯 Configuração: Modo Turbo Autenticado com Cookies
    ydl_opts_turbo = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', 
        'outtmpl': output_filename,
        'quiet': True,
        'no_warnings': True,
        'cookiefile': cookie_file_path, # Aplica seus cookies aqui 🍪
        'external_downloader': 'aria2c', 
        'external_downloader_args': [
            '--min-split-size=1M', 
            '--max-connection-per-server=16', 
            '--split=16', 
            '--jget-timeout=10',
            '--connect-timeout=10',
        ],
        'buffersize': 1024 * 1024,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.instagram.com',
            'Referer': 'https://www.instagram.com/',
        }
    }

    # 🛡️ Configuração 2: Modo de Compatibilidade Autenticado (Sem Aria2c)
    ydl_opts_compativel = {
        'format': 'best[ext=mp4]/best', 
        'outtmpl': output_filename,
        'quiet': True,
        'no_warnings': True,
        'cookiefile': cookie_file_path,
        'http_headers': ydl_opts_turbo['http_headers']
    }
    
    try:
        try:
            print("[INFO] Tentando Modo Turbo com Cookies + Aria2c...")
            with yt_dlp.YoutubeDL(ydl_opts_turbo) as ydl:
                ydl.download([url])
            return True
        except Exception as e_turbo:
            print(f"[AVISO TURBO FALHOU]: {e_turbo}. Tentando modo seguro com cookies...")
            with yt_dlp.YoutubeDL(ydl_opts_compativel) as ydl:
                ydl.download([url])
            return True
    except Exception as e_critico:
        print(f"[ERRO CRÍTICO INSTAGRAM]: {e_critico}")
        return False
    finally:
        # Garante a remoção do arquivo temporário de cookies após o download
        if os.path.exists(cookie_file_path):
            os.remove(cookie_file_path)

async def responder_mensagem(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Processa a mensagem e envia o vídeo."""
    texto = update.message.text.strip()
    
    if "instagram.com" not in texto.lower():
        await update.message.reply_text("❌ Por favor, envie um link válido do Instagram (Reels, Post ou IGTV).")
        return

    url_match = re.search(r'(https?://[^\s]+)', texto)
    if not url_match:
        await update.message.reply_text("❌ Nenhum link encontrado.")
        return
        
    url_bruta = url_match.group(1)
    url_instagram = limpar_link_instagram(url_bruta)
    
    msg_status = await update.message.reply_text("⚡ **Baixando vídeo autenticado no Modo Turbo...**")
    
    nome_arquivo = f"insta_{update.message.message_id}.mp4"

    loop = asyncio.get_event_loop()
    sucesso = await loop.run_in_executor(None, extrair_video_instagram, url_instagram, nome_arquivo)

    if sucesso and os.path.exists(nome_arquivo):
        try:
            await msg_status.edit_text("🚀 **Download concluído! Enviando para o Telegram...**")
            
            with open(nome_arquivo, 'rb') as video_file:
                await update.message.reply_video(
                    video=video_file,
                    caption="🎬 Seu vídeo do Instagram está pronto!",
                    supports_streaming=True,
                    read_timeout=600,   
                    write_timeout=600,  
                    connect_timeout=600
                )
            
            await msg_status.delete()
            
        except Exception as e:
            if "Message to edit not found" not in str(e):
                await update.message.reply_text(f"❌ Erro ao enviar o vídeo: {e}")
        finally:
            if os.path.exists(nome_arquivo):
                os.remove(nome_arquivo)
    else:
        await msg_status.edit_text("❌ **Falha ao extrair o vídeo.** O link pode estar quebrado ou seus cookies do Instagram expiraram.")

def main():
    threading.Thread(target=iniciar_servidor_falso, daemon=True).start()

    application = Application.builder().token(TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, responder_mensagem))
    
    print("🤖 Bot Instagram TURBO Ativo!")
    application.run_polling()

if __name__ == '__main__':
    main()