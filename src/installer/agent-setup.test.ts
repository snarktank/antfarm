import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('US-001: Developer agent workspace setup', () => {
  const base = '/Users/froelich/.openclaw/workspaces/workflows/feature-dev/agents';
  const agentBase = '/Users/froelich/.openclaw/agents';
  const personaFiles = ['AGENTS.md', 'IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'USER.md'];

  for (const num of ['2', '3']) {
    const dir = path.join(base, `developer-${num}`);

    describe(`developer-${num} workspace`, () => {
      it('directory exists', () => {
        assert.ok(fs.existsSync(dir));
      });

      for (const file of personaFiles) {
        it(`has ${file}`, () => {
          assert.ok(fs.existsSync(path.join(dir, file)));
        });
      }

      it(`IDENTITY.md contains Developer ${num}`, () => {
        const content = fs.readFileSync(path.join(dir, 'IDENTITY.md'), 'utf-8');
        assert.ok(content.includes(`Developer ${num}`));
      });
    });

    describe(`developer-${num} agent dir`, () => {
      it('auth-profiles.json exists', () => {
        const p = path.join(agentBase, `feature-dev-developer-${num}`, 'agent', 'auth-profiles.json');
        assert.ok(fs.existsSync(p));
      });

      it('auth-profiles.json matches original (structure)', () => {
        const orig = JSON.parse(fs.readFileSync(path.join(agentBase, 'feature-dev-developer', 'agent', 'auth-profiles.json'), 'utf-8'));
        const copy = JSON.parse(fs.readFileSync(path.join(agentBase, `feature-dev-developer-${num}`, 'agent', 'auth-profiles.json'), 'utf-8'));
        // Strip volatile timestamp fields before comparison
        function stripTimestamps(obj: any): any {
          if (Array.isArray(obj)) return obj.map(stripTimestamps);
          if (obj && typeof obj === 'object') {
            const result: any = {};
            for (const [k, v] of Object.entries(obj)) {
              if (k === 'lastUsed' || k === 'usageStats') continue;
              result[k] = stripTimestamps(v);
            }
            return result;
          }
          return obj;
        }
        assert.deepStrictEqual(stripTimestamps(copy), stripTimestamps(orig));
      });
    });
  }

  describe('openclaw.json', () => {
    const config = JSON.parse(fs.readFileSync('/Users/froelich/.openclaw/openclaw.json', 'utf-8'));
    const agents = config.agents.list;

    for (const num of ['2', '3']) {
      const id = `feature-dev-developer-${num}`;

      it(`has agent entry ${id}`, () => {
        const agent = agents.find((a: any) => a.id === id);
        assert.ok(agent, `Agent ${id} not found`);
        assert.equal(agent.workspace, `/Users/froelich/.openclaw/workspaces/workflows/feature-dev/agents/developer-${num}`);
        assert.equal(agent.agentDir, `/Users/froelich/.openclaw/agents/${id}/agent`);
      });
    }

    it('allowlist contains both new agent IDs', () => {
      // Find arrays containing feature-dev-developer and check new IDs are there
      function findAllowlists(obj: any): string[][] {
        const result: string[][] = [];
        if (Array.isArray(obj)) {
          if (obj.includes('feature-dev-developer')) result.push(obj);
          obj.forEach(item => result.push(...findAllowlists(item)));
        } else if (obj && typeof obj === 'object') {
          Object.values(obj).forEach(v => result.push(...findAllowlists(v)));
        }
        return result;
      }
      const lists = findAllowlists(config);
      assert.ok(lists.length > 0, 'No allowlists found containing feature-dev-developer');
      for (const list of lists) {
        assert.ok(list.includes('feature-dev-developer-2'), 'developer-2 missing from allowlist');
        assert.ok(list.includes('feature-dev-developer-3'), 'developer-3 missing from allowlist');
      }
    });
  });
});
