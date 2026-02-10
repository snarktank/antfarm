import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(__dirname, '..', 'workflow.yml');
const parsed = YAML.parse(readFileSync(workflowPath, 'utf-8'));

describe('feature-dev workflow compound step', () => {
  it('has a compound agent with role: coding', () => {
    const agent = parsed.agents.find(a => a.id === 'compound');
    assert.ok(agent, 'compound agent not found');
    assert.equal(agent.role, 'coding');
  });

  it('compound agent references shared compound persona files', () => {
    const agent = parsed.agents.find(a => a.id === 'compound');
    assert.ok(agent.workspace.files['AGENTS.md'].includes('compound/AGENTS.md'));
    assert.ok(agent.workspace.files['SOUL.md'].includes('compound/SOUL.md'));
    assert.ok(agent.workspace.files['IDENTITY.md'].includes('compound/IDENTITY.md'));
  });

  it('has a compound step after the review step', () => {
    const stepIds = parsed.steps.map(s => s.id);
    const reviewIdx = stepIds.indexOf('review');
    const compoundIdx = stepIds.indexOf('compound');
    assert.ok(compoundIdx > -1, 'compound step not found');
    assert.ok(compoundIdx > reviewIdx, 'compound step should be after review step');
  });

  it('compound step references agent: compound', () => {
    const step = parsed.steps.find(s => s.id === 'compound');
    assert.equal(step.agent, 'compound');
  });

  it('compound step input includes required template variables', () => {
    const step = parsed.steps.find(s => s.id === 'compound');
    assert.ok(step.input.includes('{{task}}'), 'missing {{task}}');
    assert.ok(step.input.includes('{{repo}}'), 'missing {{repo}}');
    assert.ok(step.input.includes('{{branch}}'), 'missing {{branch}}');
    assert.ok(step.input.includes('{{progress}}'), 'missing {{progress}}');
    assert.ok(step.input.includes('{{changes}}'), 'missing {{changes}}');
    assert.ok(step.input.includes('{{results}}'), 'missing {{results}}');
  });

  it('compound step expects STATUS: done', () => {
    const step = parsed.steps.find(s => s.id === 'compound');
    assert.equal(step.expects, 'STATUS: done');
  });

  it('compound step has max_retries: 1 and escalate_to: human', () => {
    const step = parsed.steps.find(s => s.id === 'compound');
    assert.equal(step.max_retries, 1);
    assert.equal(step.on_fail.escalate_to, 'human');
  });

  it('compound step is not a loop step', () => {
    const step = parsed.steps.find(s => s.id === 'compound');
    assert.ok(!step.type || step.type !== 'loop', 'compound step should not be a loop');
    assert.ok(!step.loop, 'compound step should not have loop config');
  });

  it('workflow YAML is valid and parseable by loadWorkflowSpec', async () => {
    const { loadWorkflowSpec } = await import('../../../dist/installer/workflow-spec.js');
    const spec = await loadWorkflowSpec(resolve(__dirname, '..'));
    assert.ok(spec.id === 'feature-dev');
    assert.ok(spec.agents.find(a => a.id === 'compound'));
    assert.ok(spec.steps.find(s => s.id === 'compound'));
  });
});
