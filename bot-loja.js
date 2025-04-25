const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const config = require('./config.json');

async function digitarAntes(sock, jid, tempo = 1000) {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise(resolve => setTimeout(resolve, tempo));
    await sock.sendPresenceUpdate('paused', jid);
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    const session = {};

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation?.toLowerCase().trim() || msg.message.extendedTextMessage?.text?.toLowerCase().trim() || '';

        if (!session[sender]) {
            session[sender] = { pausado: false };
        }

        const user = session[sender];

        // Atendimento humano
        if (user.pausado) {
            if (text === "voltar" || text === "menu") {
                user.pausado = false;
                await digitarAntes(sock, sender);
                await sock.sendMessage(sender, { text: "🤖 Atendimento automático reativado. Envie 'oi' para começar." });
            }
            return;
        }

        if (/oi|ol[áa]|bom dia|boa tarde|in[íi]cio/.test(text)) {
            const menuMsg = `👋 Olá, bem-vindo à *${config.empresa}*!\n\nComo podemos te ajudar?\n\n${config.menu.join('\n')}`;
            await digitarAntes(sock, sender);
            await sock.sendMessage(sender, { text: menuMsg });
            return;
        }

        if (config.respostas[text]) {
            if (text === "4") {
                user.pausado = true;
            }
            await digitarAntes(sock, sender);
            await sock.sendMessage(sender, { text: config.respostas[text] });
            return;
        }

        await digitarAntes(sock, sender);
        await sock.sendMessage(sender, { text: "🤖 Desculpe, não entendi. Envie 'oi' para recomeçar." });
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (update.qr) {
            console.log("🔐 Escaneie o QR Code abaixo:");
            qrcode.generate(update.qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Desconectado. Tentando reconectar:', shouldReconnect);
            if (shouldReconnect) startBot();
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado ao WhatsApp!');
        }
    });
}

startBot();
