import readline from 'node:readline';
import { hashPin } from '../src/utils/pinCrypto.js';

function readPipedStdin() {
  return new Promise((resolve, reject) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
    });
    process.stdin.on('end', () => {
      resolve(buffer.replace(/[\r\n]+$/, ''));
    });
    process.stdin.on('error', reject);
  });
}

function promptHiddenPin(promptText) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const originalWrite = rl._writeToOutput;
    let muted = false;

    rl._writeToOutput = function writeMasked(stringToWrite) {
      if (!muted) {
        originalWrite.call(rl, stringToWrite);
      } else if (stringToWrite.includes('\n') || stringToWrite.includes('\r')) {
        originalWrite.call(rl, '\n');
      }
    };

    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });

    muted = true;
    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('Prompt cancelled.'));
    });
  });
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node backend/scripts/hash-pin.js');
    console.log('Prompts for a Reception/Staff PIN (or reads from stdin) and outputs RECEPTION_STAFF_PIN_HASH.');
    process.exit(0);
  }

  let pin = '';
  if (process.stdin.isTTY) {
    pin = await promptHiddenPin('Enter Reception/Staff PIN: ');
  } else {
    pin = await readPipedStdin();
  }

  const hash = await hashPin(pin);
  console.log('');
  console.log('Add this line to your root .env (never commit it):');
  console.log(`RECEPTION_STAFF_PIN_HASH=${hash}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
