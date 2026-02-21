import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("install gateway tool allowlist", () => {
  it("adds sessions_spawn to gateway.tools.allow", async () => {
    const mod = await import(`../dist/installer/install.js?v=gwallow-${Date.now()}`);
    const config: any = {};
    mod.ensureGatewayToolsAllow(config);

    assert.ok(config.gateway);
    assert.ok(config.gateway.tools);
    assert.deepEqual(config.gateway.tools.allow, ["sessions_spawn"]);
  });

  it("preserves existing allow entries and does not duplicate sessions_spawn", async () => {
    const mod = await import(`../dist/installer/install.js?v=gwallow2-${Date.now()}`);
    const config: any = {
      gateway: {
        tools: {
          allow: ["cron", "sessions_spawn", "cron"],
        },
      },
    };
    mod.ensureGatewayToolsAllow(config);

    assert.deepEqual(config.gateway.tools.allow, ["cron", "sessions_spawn", "cron"]);
  });
});
