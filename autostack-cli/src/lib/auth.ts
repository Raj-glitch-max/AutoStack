import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'autostack');
const CRED_FILE = path.join(CONFIG_DIR, 'credentials.json');

export interface Credentials {
  access_token: string;
  refresh_token: string;
}

export const getCredentials = (): Credentials | null => {
  if (process.env.AUTOSTACK_TOKEN) {
    return {
      access_token: process.env.AUTOSTACK_TOKEN,
      refresh_token: ''
    };
  }
  
  try {
    if (!fs.existsSync(CRED_FILE)) return null;
    const data = fs.readFileSync(CRED_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export const saveCredentials = (creds: Credentials) => {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
};

export const clearCredentials = () => {
  if (fs.existsSync(CRED_FILE)) {
    fs.unlinkSync(CRED_FILE);
  }
};
