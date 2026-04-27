import { spawn } from 'child_process';
import fs from 'fs';

const stepId = 'b5c9f59c-5ce9-4236-b295-7c8fb310d79b';
const output = 'STATUS: done\nPR: https://github.com/snarktank/antfarm/pull/351';

const cliPath = 'C:\\Users\\main\\.openclaw\\workspace\\antfarm\\dist\\cli\\cli.js';
const args = ['step', 'complete', stepId];

const child = spawn('node', args, {
  cwd: 'C:\\Users\\main\\.openclaw\\workspace\\antfarm',
  stdio: ['pipe', 'inherit', 'inherit']
});

child.stdin.write(output);
child.stdin.end();

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});
