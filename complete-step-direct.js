import { completeStep } from './dist/installer/step-ops.js';

const stepId = 'b5c9f59c-5ce9-4236-b295-7c8fb310d79b';
const output = 'STATUS: done\nPR: https://github.com/snarktank/antfarm/pull/351';

try {
  const result = completeStep(stepId, output);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
