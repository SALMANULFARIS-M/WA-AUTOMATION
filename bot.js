import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import qrcode from "qrcode-terminal";
import randomizeMessage from "./utils/messageGen.js";
import { pino } from "pino";

let sock;
let isPaused = false;
let isStopped = false;
let qrCodeGenerated = false;

const status = {
  status: "Idle",
  isRunning: false,
  shouldPause: false,
  isProcessing: false,
  progress: {
    sent: 0,
    total: 0,
  },
  currentContact: null,
  qrCode: null,
  connectionStatus: "disconnected",
};

export const getBotStatus = () => status;

// Optional file to store sent numbers
const SENT_LOG_PATH = "./sent.json";
const sentNumbers = new Set(
  fs.existsSync(SENT_LOG_PATH) ? JSON.parse(fs.readFileSync(SENT_LOG_PATH)) : []
);

export async function startBot({ contacts, message, imagePath }) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      browser: ["WhatsApp Bulk Sender", "Chrome", "121.0.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      logger: pino({ level: "silent" }),
    });

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      status.connectionStatus = connection || status.connectionStatus;

      if (qr && !qrCodeGenerated) {
        qrcode.generate(qr, { small: true });
        status.qrCode = qr;
        qrCodeGenerated = true;
        console.log("Scan the QR code above to login");
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode !==
              DisconnectReason.loggedOut
            : true;
        if (shouldReconnect) {
          console.log("Connection closed, reconnecting...");
          startBot({ contacts, message, imagePath });
        } else {
          console.log("Connection closed, please restart the bot");
        }
      } else if (connection === "open") {
        qrCodeGenerated = false;
        status.qrCode = null;
        console.log("WhatsApp connected successfully!");
        status.connectionStatus = "connected";
      }
    });

    sock.ev.on("creds.update", saveCreds);

    // Reset bot status
    status.status = "Running";
    status.isRunning = true;
    status.shouldPause = false;
    isPaused = false;
    isStopped = false;
    status.progress.total = contacts.length;
    status.progress.sent = 0;

    // Wait until connected
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (status.connectionStatus === "connected") {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });

    console.log(
      "Starting bulk message sending...",
      contacts.length,
      "contacts found."
    );

    let messagesSinceLastBreak = 0;
    let nextBreakAfter = getRandomDelay(93, 100);

    for (let i = 0; i < contacts.length; i++) {
      if (isStopped) break;

      const number = contacts[i].replace(/\D/g, "");
      const jid = `${number}@s.whatsapp.net`;

      if (sentNumbers.has(number)) {
        console.log(`⚠️ Already sent to ${number}, skipping`);
        continue;
      }

      // Check if number is valid WhatsApp account
      const exists = await sock.onWhatsApp(jid);
      if (!exists?.[0]?.exists) {
        console.warn(`❌ ${number} is not a WhatsApp user, skipping`);
        continue;
      }

      while (isPaused) {
        status.shouldPause = true;
        await delay(6000);
      }

      status.shouldPause = false;
      status.isProcessing = true;
      status.currentContact = {
        number,
        index: i,
        totalContacts: contacts.length,
      };

      try {
        const finalMsg = randomizeMessage(message);

        if (imagePath && fs.existsSync(imagePath)) {
          await sock.sendMessage(jid, {
            image: { url: imagePath },
            caption: finalMsg,
          });
        } else {
          await sock.sendMessage(jid, { text: finalMsg });
          if (imagePath) console.warn("⚠️ Image not found, sent text only");
        }

        status.progress.sent++;
        sentNumbers.add(number);
        fs.writeFileSync(SENT_LOG_PATH, JSON.stringify([...sentNumbers]));
        console.log("✅ Sent to:", number);
      } catch (err) {
        console.error("❌ Error sending to", number, err?.message || err);
      }

      await delay(getRandomDelay(25000, 35000));

      messagesSinceLastBreak++;
      if (messagesSinceLastBreak >= nextBreakAfter) {
        console.log(
          `🛑 Taking a long break after ${messagesSinceLastBreak} messages...`
        );
        await delay(getRandomDelay(10 * 60 * 1000, 15 * 60 * 1000));
        messagesSinceLastBreak = 0;
        nextBreakAfter = getRandomDelay(93, 100);
      }
    }

    status.status = isStopped ? "Stopped" : "Completed";
    status.isRunning = false;
    status.isProcessing = false;
    status.currentContact = null;
  } catch (error) {
    console.error("Bot error:", error);
    status.status = "Error";
    status.isRunning = false;
    throw error;
  }
}

export function pauseBot() {
  isPaused = true;
  status.status = "Paused";
  status.shouldPause = true;
}

export function resumeBot() {
  isPaused = false;
  status.status = "Running";
  status.shouldPause = false;
}

export function stopBot() {
  isStopped = true;
  isPaused = false;
  status.status = "Stopped";
  status.isRunning = false;
  status.shouldPause = false;
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
