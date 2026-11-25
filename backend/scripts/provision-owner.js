import 'dotenv/config';
import readline from 'node:readline';
import { isSupabaseConfigured } from '../src/config/env.js';
import { getSupabaseClient } from '../src/config/supabase.js';

function promptInput(promptText, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    });

    const originalWrite = rl._writeToOutput;
    let muted = false;

    rl._writeToOutput = function writeMasked(chunk) {
      if (!muted) {
        originalWrite.call(rl, chunk);
      } else if (chunk.includes('\n') || chunk.includes('\r')) {
        originalWrite.call(rl, '\n');
      }
    };

    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });

    if (hidden) {
      muted = true;
    }

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('Provisioning cancelled.'));
    });
  });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function listAllUsers(supabaseAdmin) {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Unable to list Supabase Auth users: ${error.message}`);
    }
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 200) {
      break;
    }
    page += 1;
  }
  return users;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node backend/scripts/provision-owner.js');
    console.log('Creates or promotes a Supabase Auth user with trusted app_metadata.role = "owner".');
    console.log('Supports interactive prompts or OWNER_EMAIL / OWNER_PASSWORD env vars.');
    process.exit(0);
  }

  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in root .env.');
  }

  const rawEmail =
    process.env.OWNER_EMAIL || (await promptInput('Enter Salon Owner email: '));
  const email = rawEmail.trim().toLowerCase();

  if (!isValidEmail(email)) {
    throw new Error('A valid email address is required.');
  }

  const supabaseAdmin = getSupabaseClient();
  const users = await listAllUsers(supabaseAdmin);

  const existingOwner = users.find((u) => u.app_metadata?.role === 'owner');
  const existingByEmail = users.find((u) => (u.email || '').trim().toLowerCase() === email);

  if (existingOwner && (!existingByEmail || existingOwner.id !== existingByEmail.id)) {
    throw new Error(
      `An Owner account (${existingOwner.email || existingOwner.id}) already exists. Duplicate Owner accounts are blocked by default.`
    );
  }

  if (existingByEmail) {
    const nextMeta = { ...(existingByEmail.app_metadata || {}), role: 'owner' };
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existingByEmail.id, {
      app_metadata: nextMeta,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`Failed to update existing user to owner role: ${error.message}`);
    }
    console.log(`Updated existing Auth user (${data.user.email}) with app_metadata.role = "owner".`);
    return;
  }

  const password =
    process.env.OWNER_PASSWORD ||
    (await promptInput('Enter strong Owner password (min 10 characters): ', { hidden: true }));

  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('Owner password must be at least 10 characters long.');
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'owner' },
  });

  if (error) {
    throw new Error(`Failed to create Owner user: ${error.message}`);
  }

  console.log(`Created Owner account (${data.user.email}) with app_metadata.role = "owner".`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
