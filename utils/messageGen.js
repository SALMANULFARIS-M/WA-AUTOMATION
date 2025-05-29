// utils/messageGen.js

// Zero-width characters to inject
const INVISIBLES = [
  '\u200B', // Zero Width Space
  '\u200C', // Zero Width Non-Joiner
  '\u200D', // Zero Width Joiner
  '\u2060'  // Word Joiner
];

function randomizeMessage(msg) {
  const msgArr = msg.split(' ');

  // Insert invisible characters in random words
  for (let i = 0; i < msgArr.length; i++) {
    if (Math.random() < 0.3) {
      const randChar = INVISIBLES[Math.floor(Math.random() * INVISIBLES.length)];
      msgArr[i] += randChar;
    }
  }

  return msgArr.join(' ');
}

export default randomizeMessage;