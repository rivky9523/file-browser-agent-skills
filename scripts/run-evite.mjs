// Launches electron-vite with a clean env.
//
// This machine sets ELECTRON_RUN_AS_NODE=1 globally (e.g. from the editor/host
// shell). Electron treats that var as a *flag* — any value, including "0",
// forces it to run as plain Node, so require('electron').app is undefined and
// the app crashes with "Cannot read properties of undefined (reading 'whenReady')".
// cross-env can set but not delete a var, so we delete it here and spawn fresh.
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const args = process.argv.slice(2);
const child = spawn('electron-vite', args, { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
