import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('vps-dashboard: runCmd has security warning comment', () => {
  const serverPath = join(process.cwd(), '..', 'vps-dashboard', 'src', 'server.js');
  const content = readFileSync(serverPath, 'utf-8');
  
  const runCmdMatch = content.match(/function runCmd\(cmd\)/);
  assert.ok(runCmdMatch, 'runCmd function should exist');
  
  const beforeRunCmd = content.substring(Math.max(0, runCmdMatch.index - 500), runCmdMatch.index);
  assert.ok(
    beforeRunCmd.includes('SECURITY WARNING') || beforeRunCmd.includes('SECURITY:'),
    'runCmd should have security warning comment documenting exec() risks'
  );
});

test('vps-dashboard: service restart validates input format', () => {
  const serverPath = join(process.cwd(), '..', 'vps-dashboard', 'src', 'server.js');
  const content = readFileSync(serverPath, 'utf-8');
  
  const restartEndpoint = content.match(/app\.post\(['"]\/api\/services\/:name\/restart['"]/);
  assert.ok(restartEndpoint, 'Service restart endpoint should exist');
  
  const endpointStart = restartEndpoint.index;
  const endpointSection = content.substring(endpointStart, endpointStart + 1000);
  
  assert.ok(
    endpointSection.includes('req.params.name'),
    'Should read service name from params'
  );
  
  assert.ok(
    /test\(serviceName\)|\/\^[^\/]+\$\/\.test\(serviceName\)/.test(endpointSection),
    'Should validate serviceName format with regex test'
  );
  
  assert.ok(
    endpointSection.includes('Invalid service name'),
    'Should return error for invalid service name format'
  );
});

test('vps-dashboard: no unvalidated user input in exec calls', () => {
  const serverPath = join(process.cwd(), '..', 'vps-dashboard', 'src', 'server.js');
  const content = readFileSync(serverPath, 'utf-8');
  
  const lines = content.split('\n');
  const execCalls = lines
    .map((line, idx) => ({ line, num: idx + 1 }))
    .filter(({ line }) => line.includes('runCmd(') && line.includes('${'));
  
  for (const { line, num } of execCalls) {
    const contextStart = Math.max(0, num - 30);
    const contextLines = lines.slice(contextStart, num);
    const context = contextLines.join('\n');
    
    if (line.includes('${serviceName}')) {
      assert.ok(
        context.includes('test(serviceName)') || context.includes('.test(serviceName)'),
        `Line ${num}: serviceName must be validated before use in runCmd: ${line.trim()}`
      );
    }
  }
});
