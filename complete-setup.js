import { execSync } from 'child_process';

const stepId = 'c17b1d2e-ba79-4886-a829-aa5a5fd4b5ea';
const output = `STATUS: done
BUILD_CMD: npm run build
TEST_CMD: node --test dist/**/*.test.js
CI_NOTES: TypeScript project with npm build and node:test
BASELINE: Build passes, tests pass
`;

try {
  const result = execSync(`node C:\\Users\\main\\.openclaw\\workspace\\antfarm\\dist\\cli\\cli.js step complete ${stepId}`, {
    input: output,
    encoding: 'utf-8'
  });
  console.log(result);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stderr:', error.stderr);
}
