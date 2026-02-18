/**
 * installer/gateway-api.ts unit tests
 *
 * Tests config-reading (readOpenClawConfig / getGatewayConfig) and
 * HTTP-based cron operations (createAgentCronJob, listCronJobs,
 * deleteCronJob, deleteAgentCronJobs).
 * Mocks node:fs/promises, node:os, node:child_process and globalThis.fetch.
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let readFileContent = '{}';
let readFileShouldThrow = false;

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => "/fake/home",
  },
});

mock.module("node:fs/promises", {
  defaultExport: {
    readFile: async (_p: string, _enc: string) => {
      if (readFileShouldThrow) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return readFileContent;
    },
    access: async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
  },
});

mock.module("node:child_process", {
  namedExports: {
    execFile: (_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
      // Always fail so CLI fallback doesn't interfere
      if (typeof _opts === "function") {
        (_opts as Function)(new Error("not found"), "", "not found");
      } else if (cb) {
        cb(new Error("not found"), "", "not found");
      }
    },
  },
});

// Import after mocks
const {
  createAgentCronJob,
  listCronJobs,
  deleteCronJob,
  deleteAgentCronJobs,
  checkCronToolAvailable,
} = await import("../dist/installer/gateway-api.js");

// ── Helpers ─────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(impl: (...args: any[]) => Promise<any>) {
  globalThis.fetch = mock.fn(impl) as any;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function makeJob(overrides: Record<string, any> = {}) {
  return {
    name: "test/agent",
    schedule: { kind: "every", everyMs: 300_000 },
    sessionTarget: "isolated",
    agentId: "test-agent",
    payload: { kind: "agentTurn", message: "test prompt" },
    enabled: true,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("gateway-api config reading", () => {
  beforeEach(() => {
    readFileShouldThrow = false;
    readFileContent = '{}';
  });

  afterEach(() => {
    restoreFetch();
  });

  it("uses port from openclaw.json when present", async () => {
    readFileContent = JSON.stringify({ gateway: { port: 12345 } });
    mockFetch(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "j1" } }),
    }));

    await createAgentCronJob(makeJob());

    const fetchMock = globalThis.fetch as any;
    const calledUrl = fetchMock.mock.calls[0].arguments[0];
    assert.ok(
      calledUrl.startsWith("http://127.0.0.1:12345"),
      `Expected URL to use port 12345, got: ${calledUrl}`
    );
  });

  it("defaults to port 18789 when openclaw.json is missing", async () => {
    readFileShouldThrow = true;
    mockFetch(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "j2" } }),
    }));

    await createAgentCronJob(makeJob());

    const fetchMock = globalThis.fetch as any;
    const calledUrl = fetchMock.mock.calls[0].arguments[0];
    assert.ok(
      calledUrl.startsWith("http://127.0.0.1:18789"),
      `Expected URL to use default port 18789, got: ${calledUrl}`
    );
  });

  it("defaults to port 18789 when config has no gateway section", async () => {
    readFileContent = JSON.stringify({ someOtherKey: true });
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "j3" } }),
    }));

    await createAgentCronJob(makeJob());

    const fetchMock = globalThis.fetch as any;
    const calledUrl = fetchMock.mock.calls[0].arguments[0];
    assert.ok(
      calledUrl.startsWith("http://127.0.0.1:18789"),
      `Expected default port 18789, got: ${calledUrl}`
    );
  });

  it("reads token from openclaw.json gateway config", async () => {
    readFileContent = JSON.stringify({
      gateway: { port: 9999, auth: { token: "secret-tok" } },
    });
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "j4" } }),
    }));

    await createAgentCronJob(makeJob());

    const fetchMock = globalThis.fetch as any;
    const callOpts = fetchMock.mock.calls[0].arguments[1];
    assert.equal(callOpts.headers["Authorization"], "Bearer secret-tok");
  });

  it("omits Authorization header when token is not set", async () => {
    readFileContent = JSON.stringify({ gateway: { port: 9999 } });
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "j5" } }),
    }));

    await createAgentCronJob(makeJob());

    const fetchMock = globalThis.fetch as any;
    const callOpts = fetchMock.mock.calls[0].arguments[1];
    assert.equal(callOpts.headers["Authorization"], undefined);
  });
});

describe("createAgentCronJob", () => {
  beforeEach(() => {
    readFileShouldThrow = true; // use defaults
  });

  afterEach(() => {
    restoreFetch();
  });

  it("sends POST to /tools/invoke endpoint", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "new-id" } }),
    }));

    await createAgentCronJob(makeJob());

    const fetchMock = globalThis.fetch as any;
    const [url, opts] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, "http://127.0.0.1:18789/tools/invoke");
    assert.equal(opts.method, "POST");
  });

  it("sends correct request body with job payload", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "new-id" } }),
    }));

    const job = makeJob({ payload: { kind: "agentTurn", message: "hello", model: "claude-sonnet-4-20250514" } });
    await createAgentCronJob(job);

    const fetchMock = globalThis.fetch as any;
    const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
    assert.equal(body.tool, "cron");
    assert.equal(body.args.action, "add");
    assert.equal(body.args.job.payload.model, "claude-sonnet-4-20250514");
    assert.equal(body.args.job.name, "test/agent");
  });

  it("returns ok:true with id on success", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "cron-123" } }),
    }));

    const result = await createAgentCronJob(makeJob());
    assert.equal(result.ok, true);
    assert.equal(result.id, "cron-123");
  });

  it("returns ok:false with error on non-404 HTTP error", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    const result = await createAgentCronJob(makeJob());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("500"));
  });

  it("returns ok:false with error when gateway response not ok", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: { message: "bad payload" } }),
    }));

    const result = await createAgentCronJob(makeJob());
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("bad payload"));
  });

  it("falls back to CLI on 404 (returns error since CLI mock fails)", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 404,
    }));

    const result = await createAgentCronJob(makeJob());
    // CLI mock always fails, so result.ok should be false
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("CLI fallback failed"));
  });

  it("falls back to CLI on fetch network error", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await createAgentCronJob(makeJob());
    // Network error → null → CLI fallback → CLI fails
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("CLI fallback failed"));
  });

  it("includes auth token header when token is configured", async () => {
    readFileShouldThrow = false;
    readFileContent = JSON.stringify({
      gateway: { port: 18789, auth: { token: "my-token" } },
    });
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { id: "tok-id" } }),
    }));

    await createAgentCronJob(makeJob());

    const fetchMock = globalThis.fetch as any;
    const headers = fetchMock.mock.calls[0].arguments[1].headers;
    assert.equal(headers["Authorization"], "Bearer my-token");
    assert.equal(headers["Content-Type"], "application/json");
  });
});

describe("listCronJobs", () => {
  beforeEach(() => {
    readFileShouldThrow = true;
  });

  afterEach(() => {
    restoreFetch();
  });

  it("returns parsed jobs array from gateway response (content format)", async () => {
    const jobs = [{ id: "j1", name: "agent/poll" }, { id: "j2", name: "agent/check" }];
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { content: [{ text: JSON.stringify({ jobs }) }] },
      }),
    }));

    const result = await listCronJobs();
    assert.equal(result.ok, true);
    assert.equal(result.jobs?.length, 2);
    assert.equal(result.jobs?.[0].id, "j1");
    assert.equal(result.jobs?.[1].name, "agent/check");
  });

  it("returns jobs from result.jobs fallback", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { jobs: [{ id: "x1", name: "my-job" }] },
      }),
    }));

    const result = await listCronJobs();
    assert.equal(result.ok, true);
    assert.equal(result.jobs?.length, 1);
    assert.equal(result.jobs?.[0].id, "x1");
  });

  it("returns empty jobs array when no jobs exist", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { content: [{ text: JSON.stringify({ jobs: [] }) }] },
      }),
    }));

    const result = await listCronJobs();
    assert.equal(result.ok, true);
    assert.equal(result.jobs?.length, 0);
  });

  it("returns ok:false on gateway error", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 502,
    }));

    const result = await listCronJobs();
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it("falls back to CLI on fetch error", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await listCronJobs();
    // CLI mock fails too
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("CLI fallback failed"));
  });
});

describe("deleteCronJob", () => {
  beforeEach(() => {
    readFileShouldThrow = true;
  });

  afterEach(() => {
    restoreFetch();
  });

  it("sends POST to /tools/invoke with remove action", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));

    await deleteCronJob("job-42");

    const fetchMock = globalThis.fetch as any;
    const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
    assert.equal(body.tool, "cron");
    assert.equal(body.args.action, "remove");
    assert.equal(body.args.id, "job-42");
  });

  it("returns ok:true on successful deletion", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));

    const result = await deleteCronJob("job-42");
    assert.equal(result.ok, true);
  });

  it("returns ok:false on gateway error", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 500,
    }));

    const result = await deleteCronJob("job-42");
    assert.equal(result.ok, false);
  });

  it("falls back to CLI on network error", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await deleteCronJob("job-42");
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("CLI fallback failed"));
  });
});

describe("deleteAgentCronJobs", () => {
  beforeEach(() => {
    readFileShouldThrow = true;
  });

  afterEach(() => {
    restoreFetch();
  });

  it("deletes jobs matching the name prefix", async () => {
    const deletedIds: string[] = [];
    let callCount = 0;

    mockFetch(async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body);
      callCount++;

      // First call is listCronJobs
      if (body.args.action === "list") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              jobs: [
                { id: "id-1", name: "myprefix/poll" },
                { id: "id-2", name: "myprefix/check" },
                { id: "id-3", name: "other/job" },
              ],
            },
          }),
        };
      }

      // Subsequent calls are deleteCronJob
      if (body.args.action === "remove") {
        deletedIds.push(body.args.id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      }

      return { ok: false, status: 400 };
    });

    await deleteAgentCronJobs("myprefix/");

    assert.deepEqual(deletedIds.sort(), ["id-1", "id-2"]);
    // "other/job" should NOT have been deleted
    assert.ok(!deletedIds.includes("id-3"));
  });

  it("does nothing when list returns no matching jobs", async () => {
    let deleteCallCount = 0;

    mockFetch(async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body);

      if (body.args.action === "list") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { jobs: [{ id: "id-x", name: "other/job" }] },
          }),
        };
      }

      if (body.args.action === "remove") {
        deleteCallCount++;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }

      return { ok: false, status: 400 };
    });

    await deleteAgentCronJobs("nonexistent/");
    assert.equal(deleteCallCount, 0);
  });

  it("handles list failure gracefully", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    // Should not throw
    await deleteAgentCronJobs("prefix/");
  });
});

describe("checkCronToolAvailable", () => {
  beforeEach(() => {
    readFileShouldThrow = true;
  });

  afterEach(() => {
    restoreFetch();
  });

  it("returns ok:true when gateway responds successfully", async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));

    const result = await checkCronToolAvailable();
    assert.equal(result.ok, true);
  });

  it("returns ok:false when both HTTP and CLI fail", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await checkCronToolAvailable();
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("Cannot access cron"));
  });

  it("returns ok:false with error on non-404 HTTP error", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    }));

    const result = await checkCronToolAvailable();
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("503"));
  });
});
