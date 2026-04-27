const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const outputFile = path.join(process.env.TEMP, 'antfarm-step-output.txt');
const output = fs.readFileSync(outputFile, 'utf8');

const cliPath = path.join(__dirname, 'dist', 'cli', 'cli.js');
const stepId = 'f54a531b-b664-4c5c-8a50-9fdf1edffa73';

const command = `node "${cliPath}" step complete "${stepId}"`;

const child = exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`Stderr: ${stderr}`);
    return;
  }
  console.log(stdout);
});

child.stdin.write(output);
child.stdin.end();
