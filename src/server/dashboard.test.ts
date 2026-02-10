import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";

// HTML request helper for UI tests
async function fetchHTML(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.end();
  });
}

describe("Costs Summary Cards UI", () => {
  let server: http.Server;
  const TEST_PORT = 33338;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("costs-view contains summary-cards container", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="summary-cards"'), "Should have summary-cards container");
    assert.ok(html.includes('class="summary-cards"'), "Should have summary-cards class");
  });

  test("has 4 summary cards with correct labels", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Check all 4 card labels exist
    assert.ok(html.includes('>Total Input Tokens</div>'), "Should have Total Input Tokens card");
    assert.ok(html.includes('>Total Output Tokens</div>'), "Should have Total Output Tokens card");
    assert.ok(html.includes('>Total Cost (USD)</div>'), "Should have Total Cost (USD) card");
    assert.ok(html.includes('>Total Requests</div>'), "Should have Total Requests card");
  });

  test("each card has value element with correct id", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="card-input-tokens"'), "Should have card-input-tokens element");
    assert.ok(html.includes('id="card-output-tokens"'), "Should have card-output-tokens element");
    assert.ok(html.includes('id="card-total-cost"'), "Should have card-total-cost element");
    assert.ok(html.includes('id="card-total-requests"'), "Should have card-total-requests element");
  });

  test("summary cards have proper structure with label and value", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Each card should have both summary-card-label and summary-card-value classes
    const cardCount = (html.match(/class="summary-card"/g) || []).length;
    assert.strictEqual(cardCount, 4, "Should have exactly 4 summary cards");
    
    const labelCount = (html.match(/class="summary-card-label"/g) || []).length;
    assert.strictEqual(labelCount, 4, "Should have exactly 4 card labels");
    
    const valueCount = (html.match(/class="summary-card-value"/g) || []).length;
    assert.strictEqual(valueCount, 4, "Should have exactly 4 card values");
  });

  test("has CSS styles for summary cards grid layout", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.summary-cards'), "Should have .summary-cards CSS rule");
    assert.ok(html.includes('grid-template-columns'), "Should use grid layout");
    assert.ok(html.includes('.summary-card{'), "Should have .summary-card CSS rule");
    assert.ok(html.includes('.summary-card-label'), "Should have .summary-card-label CSS rule");
    assert.ok(html.includes('.summary-card-value'), "Should have .summary-card-value CSS rule");
  });

  test("has JavaScript for loading costs summary", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('loadCostsSummary'), "Should have loadCostsSummary function");
    assert.ok(html.includes('formatNumber'), "Should have formatNumber helper");
    assert.ok(html.includes('formatCurrency'), "Should have formatCurrency helper");
  });

  test("tab switching calls loadCostsSummary when costs tab is activated", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // The switchTab function should call loadCostsSummary when tabName is 'costs'
    assert.ok(
      html.includes("if (tabName === 'costs') loadCostsSummary()"),
      "Should call loadCostsSummary when costs tab is activated"
    );
  });

  test("formatNumber uses locale string with thousands separators", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("toLocaleString('en-US')"), "formatNumber should use toLocaleString for thousands separators");
  });
});

describe("Tab Navigation UI", () => {
  let server: http.Server;
  const TEST_PORT = 33337;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("serves HTML with tab bar containing Runs and Costs tabs", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Tab bar exists
    assert.ok(html.includes('class="tab-bar"'), "Should have tab-bar element");
    assert.ok(html.includes('id="tab-bar"'), "Tab bar should have id");
    
    // Both tabs exist
    assert.ok(html.includes('data-tab="runs"'), "Should have Runs tab with data attribute");
    assert.ok(html.includes('data-tab="costs"'), "Should have Costs tab with data attribute");
    assert.ok(html.includes('>Runs</button>'), "Should have Runs button text");
    assert.ok(html.includes('>Costs</button>'), "Should have Costs button text");
  });

  test("Runs tab is active by default", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Runs tab should have 'active' class
    const runsTabMatch = html.match(/<button[^>]*data-tab="runs"[^>]*>/);
    assert.ok(runsTabMatch, "Should find Runs tab button");
    assert.ok(runsTabMatch[0].includes('class="tab-btn active"'), "Runs tab should be active by default");
    
    // Costs tab should NOT have 'active' class
    const costsTabMatch = html.match(/<button[^>]*data-tab="costs"[^>]*>/);
    assert.ok(costsTabMatch, "Should find Costs tab button");
    assert.ok(!costsTabMatch[0].includes('active'), "Costs tab should not be active by default");
  });

  test("has runs-view and costs-view containers", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="runs-view"'), "Should have runs-view container");
    assert.ok(html.includes('id="costs-view"'), "Should have costs-view container");
    assert.ok(html.includes('class="view-container active"'), "Should have one active view container");
  });

  test("runs-view is active by default, costs-view is not", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Check runs-view has active class
    const runsViewMatch = html.match(/<div[^>]*id="runs-view"[^>]*>/);
    assert.ok(runsViewMatch, "Should find runs-view container");
    assert.ok(runsViewMatch[0].includes('active'), "runs-view should be active by default");
    
    // Check costs-view does NOT have active class
    const costsViewMatch = html.match(/<div[^>]*id="costs-view"[^>]*>/);
    assert.ok(costsViewMatch, "Should find costs-view container");
    assert.ok(!costsViewMatch[0].includes('active'), "costs-view should not be active by default");
  });

  test("has CSS styles for tab navigation", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.tab-bar'), "Should have .tab-bar CSS rule");
    assert.ok(html.includes('.tab-btn'), "Should have .tab-btn CSS rule");
    assert.ok(html.includes('.tab-btn.active'), "Should have .tab-btn.active CSS rule");
    assert.ok(html.includes('.view-container'), "Should have .view-container CSS rule");
  });

  test("has JavaScript for tab switching", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('initTabs'), "Should have initTabs function");
    assert.ok(html.includes('switchTab'), "Should have switchTab function");
    assert.ok(html.includes("dataset.tab"), "Should use data-tab attribute in JS");
  });
});

// HTTP request helper
async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, data });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("GET /api/usage", () => {
  let server: http.Server;
  const TEST_PORT = 33336;
  // Use unique prefix to isolate test data
  const TEST_PREFIX = `test-${Date.now()}`;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Insert test data for aggregation tests with unique identifiers
    await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: `${TEST_PREFIX}-alpha`,
      model: `${TEST_PREFIX}-sonnet`,
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.01,
      task_label: `${TEST_PREFIX}-coding`,
    });
    await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: `${TEST_PREFIX}-alpha`,
      model: `${TEST_PREFIX}-opus`,
      input_tokens: 2000,
      output_tokens: 1000,
      cost_usd: 0.05,
      task_label: `${TEST_PREFIX}-analysis`,
    });
    await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: `${TEST_PREFIX}-beta`,
      model: `${TEST_PREFIX}-sonnet`,
      input_tokens: 500,
      output_tokens: 250,
      cost_usd: 0.005,
      task_label: `${TEST_PREFIX}-coding`,
    });
  });

  after(async () => {
    server.close();
  });

  test("returns aggregated totals without group_by", async () => {
    const { status, data } = await request(TEST_PORT, "GET", "/api/usage");

    assert.strictEqual(status, 200);
    const result = data as { totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number; recordCount: number };
    assert.strictEqual(typeof result.totalInputTokens, "number");
    assert.strictEqual(typeof result.totalOutputTokens, "number");
    assert.strictEqual(typeof result.totalCostUsd, "number");
    assert.strictEqual(typeof result.recordCount, "number");
    assert.ok(result.recordCount >= 3, "Should have at least 3 records");
  });

  test("groups by agent when group_by=agent", async () => {
    const { status, data } = await request(TEST_PORT, "GET", `/api/usage?group_by=agent&agent_id=${TEST_PREFIX}-alpha`);

    assert.strictEqual(status, 200);
    const results = data as Array<{ groupKey: string; totalInputTokens: number; recordCount: number }>;
    assert.ok(Array.isArray(results), "Should return an array");
    
    const alphaGroup = results.find(r => r.groupKey === `${TEST_PREFIX}-alpha`);
    assert.ok(alphaGroup, "Should have alpha group");
    assert.strictEqual(alphaGroup!.recordCount, 2, "alpha should have 2 records");
  });

  test("groups by model when group_by=model", async () => {
    const { status, data } = await request(TEST_PORT, "GET", `/api/usage?group_by=model&model=${TEST_PREFIX}-sonnet`);

    assert.strictEqual(status, 200);
    const results = data as Array<{ groupKey: string; totalInputTokens: number; recordCount: number }>;
    assert.ok(Array.isArray(results), "Should return an array");
    
    const sonnetGroup = results.find(r => r.groupKey === `${TEST_PREFIX}-sonnet`);
    assert.ok(sonnetGroup, "Should have sonnet group");
    assert.strictEqual(sonnetGroup!.recordCount, 2, "sonnet should have 2 records");
  });

  test("groups by task when group_by=task", async () => {
    const { status, data } = await request(TEST_PORT, "GET", `/api/usage?group_by=task&agent_id=${TEST_PREFIX}-alpha`);

    assert.strictEqual(status, 200);
    const results = data as Array<{ groupKey: string; totalInputTokens: number; recordCount: number }>;
    assert.ok(Array.isArray(results), "Should return an array");
    
    const codingGroup = results.find(r => r.groupKey === `${TEST_PREFIX}-coding`);
    const analysisGroup = results.find(r => r.groupKey === `${TEST_PREFIX}-analysis`);
    assert.ok(codingGroup, "Should have coding group");
    assert.ok(analysisGroup, "Should have analysis group");
    assert.strictEqual(codingGroup!.recordCount, 1, "coding for alpha should have 1 record");
    assert.strictEqual(analysisGroup!.recordCount, 1, "analysis for alpha should have 1 record");
  });

  test("groups by day when group_by=day", async () => {
    const { status, data } = await request(TEST_PORT, "GET", `/api/usage?group_by=day&agent_id=${TEST_PREFIX}-alpha`);

    assert.strictEqual(status, 200);
    const results = data as Array<{ groupKey: string; recordCount: number }>;
    assert.ok(Array.isArray(results), "Should return an array");
    assert.ok(results.length >= 1, "Should have at least one day group");
    
    // Each groupKey should look like a date (YYYY-MM-DD format)
    for (const result of results) {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result.groupKey), `groupKey should be date format: ${result.groupKey}`);
    }
  });

  test("filters by agent_id", async () => {
    const { status, data } = await request(TEST_PORT, "GET", `/api/usage?agent_id=${TEST_PREFIX}-beta`);

    assert.strictEqual(status, 200);
    const result = data as { totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number; recordCount: number };
    assert.strictEqual(result.recordCount, 1, "Should have 1 record for beta");
    assert.strictEqual(result.totalInputTokens, 500);
    assert.strictEqual(result.totalOutputTokens, 250);
  });

  test("filters by model", async () => {
    const { status, data } = await request(TEST_PORT, "GET", `/api/usage?model=${TEST_PREFIX}-opus`);

    assert.strictEqual(status, 200);
    const result = data as { totalInputTokens: number; recordCount: number };
    assert.strictEqual(result.recordCount, 1, "Should have 1 record for opus");
    assert.strictEqual(result.totalInputTokens, 2000);
  });

  test("combines group_by with filter", async () => {
    const { status, data } = await request(TEST_PORT, "GET", `/api/usage?group_by=model&agent_id=${TEST_PREFIX}-alpha`);

    assert.strictEqual(status, 200);
    const results = data as Array<{ groupKey: string; recordCount: number }>;
    assert.ok(Array.isArray(results), "Should return an array");
    
    // alpha uses both sonnet and opus
    const sonnetGroup = results.find(r => r.groupKey === `${TEST_PREFIX}-sonnet`);
    const opusGroup = results.find(r => r.groupKey === `${TEST_PREFIX}-opus`);
    
    assert.ok(sonnetGroup, "Should have sonnet group for alpha");
    assert.ok(opusGroup, "Should have opus group for alpha");
    assert.strictEqual(sonnetGroup!.recordCount, 1);
    assert.strictEqual(opusGroup!.recordCount, 1);
  });

  test("returns 400 for invalid group_by", async () => {
    const { status, data } = await request(TEST_PORT, "GET", "/api/usage?group_by=invalid");

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "Invalid group_by value. Must be one of: agent, model, task, day" });
  });

  test("returns empty aggregate for non-matching filter", async () => {
    const { status, data } = await request(TEST_PORT, "GET", "/api/usage?agent_id=non-existent-agent-xyz123");

    assert.strictEqual(status, 200);
    const result = data as { totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number; recordCount: number };
    assert.strictEqual(result.recordCount, 0);
    assert.strictEqual(result.totalInputTokens, 0);
    assert.strictEqual(result.totalOutputTokens, 0);
    assert.strictEqual(result.totalCostUsd, 0);
  });
});

describe("POST /api/usage", () => {
  let server: http.Server;
  const TEST_PORT = 33335;

  before(async () => {
    // Dynamically import the dashboard
    const { startDashboard } = await import("./dashboard.js");
    
    server = startDashboard(TEST_PORT);
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("returns 400 if agent_id is missing", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      model: "claude-sonnet-4-5",
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "agent_id is required" });
  });

  test("returns 400 if model is missing", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "test-agent",
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "model is required" });
  });

  test("returns 400 if agent_id is not a string", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: 123,
      model: "claude-sonnet-4-5",
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "agent_id is required" });
  });

  test("returns 400 if model is not a string", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "test-agent",
      model: 123,
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "model is required" });
  });

  test("returns 201 with id on success with minimal fields", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "minimal-agent",
      model: "claude-sonnet-4-5",
    });

    assert.strictEqual(status, 201);
    assert.ok((data as { id: string }).id, "Should return an id");
    assert.strictEqual(typeof (data as { id: string }).id, "string");
  });

  test("returns 201 with id on success with all fields", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "full-agent",
      model: "claude-opus-4",
      input_tokens: 1500,
      output_tokens: 800,
      cost_usd: 0.025,
      // Note: run_id/step_id can be any string since they're optional and no FK constraint enforced for this table
      task_label: "feature development",
    });

    assert.strictEqual(status, 201);
    const result = data as { id: string };
    assert.ok(result.id, "Should return an id");
    assert.strictEqual(typeof result.id, "string");
  });

  test("returns 400 when run_id references non-existent run", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "linked-agent",
      model: "test-model",
      run_id: "non-existent-run-id",
      step_id: "some-step-id",
    });

    // FK constraint rejects invalid run_id
    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "Invalid run_id reference" });
  });

  test("handles zero token values", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {
      agent_id: "zero-tokens-agent",
      model: "test-model",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
    });

    assert.strictEqual(status, 201);
    assert.ok((data as { id: string }).id, "Should return an id");
  });

  test("returns 400 on invalid JSON body", async () => {
    const { status, data } = await new Promise<{ status: number; data: unknown }>((resolve, reject) => {
      const options = {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path: "/api/usage",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };

      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode!, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode!, data: body });
          }
        });
      });

      req.on("error", reject);
      req.write("{ invalid json }");
      req.end();
    });

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "Invalid JSON body" });
  });

  test("returns 400 on empty body", async () => {
    const { status, data } = await request(TEST_PORT, "POST", "/api/usage", {});

    assert.strictEqual(status, 400);
    assert.deepStrictEqual(data, { error: "agent_id is required" });
  });
});
