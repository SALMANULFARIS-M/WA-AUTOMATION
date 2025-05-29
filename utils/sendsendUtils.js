import { readFileSync } from 'fs';
import randomizeMessage from './messageGen.js';

export async function sendBulkMessages(sock, contacts, baseMessage, imagePath, shouldPause) {
  for (const number of contacts) {
    const jid = number.replace(/^\+/, '') + "@s.whatsapp.net";
    console.log(`Sending to ${jid}`);

    while (shouldPause()) {
      console.log('Paused... waiting to resume.');
      await new Promise(res => setTimeout(res, 1000));
    }

    const finalMessage = randomizeMessage(baseMessage);

    try {
      if (imagePath) {
        const imageBuffer = readFileSync(imagePath);
        await sock.sendMessage(jid, {
          image: imageBuffer,
          caption: finalMessage,
        });
      } else {
        await sock.sendMessage(jid, { text: finalMessage });
      }
    } catch (err) {
      console.error(`❌ Error sending to ${jid}:`, err);
    }

    await new Promise(res => setTimeout(res, 2000)); // delay between messages
  }
}
