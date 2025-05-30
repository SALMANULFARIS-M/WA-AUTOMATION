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
import { pino } from "pino"; // add this import at the top

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
      logger: pino({ level: "silent" })
    });

    // Handle connection events
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Update connection status
      status.connectionStatus = connection || status.connectionStatus;

      if (qr && !qrCodeGenerated) {
        qrcode.generate(qr, { small: true });
        status.qrCode = qr;
        qrCodeGenerated = true;
        console.log("Scan the QR code above to login");
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect.error instanceof Boom
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

    // Reset status
    status.status = "Running";
    status.isRunning = true;
    status.shouldPause = false;
    isPaused = false;
    isStopped = false;
    status.progress.total = contacts.length;
    status.progress.sent = 0;

    // Wait for connection to be open
    await new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        if (status.connectionStatus === "connected") {
          clearInterval(checkConnection);
          resolve(true);
        }
      }, 1000);
    });

    console.log(
      "Starting bulk message sending...",
      contacts.length,
      "contacts found."
    );
    let messagesSinceLastBreak = 0;
    let nextBreakAfter = getRandomDelay(93, 100); // Random first break point

    // Process contacts
    for (let i = 0; i < contacts.length; i++) {
      if (isStopped) break;
      console.log(
        `Processing contact ${i + 1}/${contacts.length}:`,
        contacts[i]
      );

      while (isPaused) {
        status.shouldPause = true;
        await delay(6000);
      }

      status.shouldPause = false;
      status.isProcessing = true;

      const number = contacts[i].replace(/\D/g, "");
      status.currentContact = {
        number,
        index: i,
        totalContacts: contacts.length,
      };

      try {
        const finalMsg = randomizeMessage(message);
        const jid = `${number}@s.whatsapp.net`;

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
        console.log("✅ Sent to:", number);
      } catch (err) {
        console.error("❌ Error sending to", number, err);
      }

      await delay(getRandomDelay(25000, 35000));
      // ☕ Check for random long break
      messagesSinceLastBreak++;
      if (messagesSinceLastBreak >= nextBreakAfter) {
        console.log(
          `🛑 Taking a long break after ${messagesSinceLastBreak} messages...`
        );
        await delay(getRandomDelay(10 * 60 * 1000, 15 * 60 * 1000)); // 10–20 minutes
        messagesSinceLastBreak = 0;
        nextBreakAfter = getRandomDelay(93, 100); // Recalculate next break point
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