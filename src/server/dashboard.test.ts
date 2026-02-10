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

describe("Agent Breakdown Table UI", () => {
  let server: http.Server;
  const TEST_PORT = 33340;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("costs-view contains agent-breakdown section", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="agent-breakdown"'), "Should have agent-breakdown container");
    assert.ok(html.includes('class="model-breakdown" id="agent-breakdown"'), "Should reuse model-breakdown class for styling");
  });

  test("has agent breakdown title", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('>Cost by Agent</div>'), "Should have correct title text");
  });

  test("has agent table with correct structure", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="agent-table"'), "Should have agent-table");
    assert.ok(html.includes('class="model-table" id="agent-table"'), "Should reuse model-table class for styling");
    assert.ok(html.includes('id="agent-table-body"'), "Should have tbody id for JS targeting");
  });

  test("agent table has correct column headers", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find the agent-table section and verify it has Agent column header
    const agentTableMatch = html.match(/id="agent-table"[\s\S]*?<\/table>/);
    assert.ok(agentTableMatch, "Should find agent-table");
    assert.ok(agentTableMatch[0].includes('<th>Agent</th>'), "Should have Agent column");
    assert.ok(agentTableMatch[0].includes('>Input Tokens</th>'), "Should have Input Tokens column");
    assert.ok(agentTableMatch[0].includes('>Output Tokens</th>'), "Should have Output Tokens column");
    assert.ok(agentTableMatch[0].includes('>Cost</th>'), "Should have Cost column");
    assert.ok(agentTableMatch[0].includes('>Requests</th>'), "Should have Requests column");
  });

  test("has JavaScript for loading agent breakdown", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('loadAgentBreakdown'), "Should have loadAgentBreakdown function");
    assert.ok(html.includes("group_by=agent"), "Should fetch with group_by=agent parameter");
  });

  test("loadCostsSummary calls loadAgentBreakdown", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(
      html.includes("loadAgentBreakdown()"),
      "loadCostsSummary should call loadAgentBreakdown"
    );
  });

  test("agent breakdown sorts by cost descending", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find loadAgentBreakdown function and check sorting
    const agentFuncMatch = html.match(/async function loadAgentBreakdown[\s\S]*?^}/m);
    assert.ok(agentFuncMatch, "Should find loadAgentBreakdown function");
    assert.ok(
      agentFuncMatch[0].includes("sort((a, b) => (b.totalCostUsd"),
      "Should sort data by totalCostUsd descending in loadAgentBreakdown"
    );
  });

  test("agent breakdown uses escapeHtml for XSS protection", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find loadAgentBreakdown function and check escaping
    const agentFuncMatch = html.match(/async function loadAgentBreakdown[\s\S]*?^}/m);
    assert.ok(agentFuncMatch, "Should find loadAgentBreakdown function");
    assert.ok(
      agentFuncMatch[0].includes("escapeHtml(row.groupKey)"),
      "Should use escapeHtml on agent name"
    );
  });

  test("agent breakdown displays agent IDs", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // The loadAgentBreakdown function should render row.groupKey which contains agent IDs
    const agentFuncMatch = html.match(/async function loadAgentBreakdown[\s\S]*?^}/m);
    assert.ok(agentFuncMatch, "Should find loadAgentBreakdown function");
    assert.ok(
      agentFuncMatch[0].includes('class="model-name"'),
      "Should render agent ID with model-name class for styling"
    );
  });

  test("agent breakdown appears after model breakdown in costs-view", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const modelPos = html.indexOf('id="model-breakdown"');
    const agentPos = html.indexOf('id="agent-breakdown"');
    
    assert.ok(modelPos > 0, "Should find model-breakdown");
    assert.ok(agentPos > 0, "Should find agent-breakdown");
    assert.ok(agentPos > modelPos, "agent-breakdown should appear after model-breakdown");
  });
});

describe("Model Breakdown Table UI", () => {
  let server: http.Server;
  const TEST_PORT = 33339;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("costs-view contains model-breakdown section", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="model-breakdown"'), "Should have model-breakdown container");
    assert.ok(html.includes('class="model-breakdown"'), "Should have model-breakdown class");
  });

  test("has model breakdown title", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('class="model-breakdown-title"'), "Should have title element");
    assert.ok(html.includes('>Cost by Model</div>'), "Should have correct title text");
  });

  test("has model table with correct structure", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="model-table"'), "Should have model-table");
    assert.ok(html.includes('class="model-table"'), "Should have model-table class");
    assert.ok(html.includes('<thead>'), "Should have thead");
    assert.ok(html.includes('<tbody'), "Should have tbody");
    assert.ok(html.includes('id="model-table-body"'), "Should have tbody id for JS targeting");
  });

  test("table has correct column headers", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('<th>Model</th>'), "Should have Model column");
    assert.ok(html.includes('>Input Tokens</th>'), "Should have Input Tokens column");
    assert.ok(html.includes('>Output Tokens</th>'), "Should have Output Tokens column");
    assert.ok(html.includes('>Cost</th>'), "Should have Cost column");
    assert.ok(html.includes('>Requests</th>'), "Should have Requests column");
  });

  test("numeric columns have numeric class", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find the model-table specifically and check its numeric columns
    const modelTableMatch = html.match(/id="model-table"[\s\S]*?<\/table>/);
    assert.ok(modelTableMatch, "Should find model-table");
    
    const numericHeaderMatches = (modelTableMatch[0].match(/<th class="numeric">/g) || []).length;
    assert.strictEqual(numericHeaderMatches, 4, "Should have 4 numeric column headers in model table (Input, Output, Cost, Requests)");
  });

  test("has CSS styles for model table", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.model-breakdown{'), "Should have .model-breakdown CSS rule");
    assert.ok(html.includes('.model-table{'), "Should have .model-table CSS rule");
    assert.ok(html.includes('.model-table th{'), "Should have .model-table th CSS rule");
    assert.ok(html.includes('.model-table td{'), "Should have .model-table td CSS rule");
    assert.ok(html.includes('.model-table tr:hover'), "Should have hover state for rows");
  });

  test("has JavaScript for loading model breakdown", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('loadModelBreakdown'), "Should have loadModelBreakdown function");
    assert.ok(html.includes("group_by=model"), "Should fetch with group_by=model parameter");
  });

  test("loadCostsSummary calls loadModelBreakdown", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // The loadCostsSummary function should call loadModelBreakdown
    assert.ok(
      html.includes("loadModelBreakdown()"),
      "loadCostsSummary should call loadModelBreakdown"
    );
  });

  test("model breakdown sorts by cost descending", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Check that the sorting logic exists
    assert.ok(
      html.includes("sort((a, b) => (b.totalCostUsd"),
      "Should sort data by totalCostUsd descending"
    );
  });

  test("has escapeHtml helper for XSS protection", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("function escapeHtml"), "Should have escapeHtml helper function");
    assert.ok(html.includes("escapeHtml(row.groupKey)"), "Should use escapeHtml on model name");
  });
});

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

describe("Model Filter Dropdown UI", () => {
  let server: http.Server;
  const TEST_PORT = 33346;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("model filter dropdown appears next to date filters", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="model-filter"'), "Should have model-filter element");
    
    // Model filter should be inside date-filter container
    const dateFilterMatch = html.match(/<div[^>]*class="date-filter"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
    assert.ok(dateFilterMatch, "Should find date-filter section");
    assert.ok(dateFilterMatch[0].includes('id="model-filter"'), "Model filter should be inside date-filter section");
    
    // Check position: model filter should appear after date-to
    const dateToPos = html.indexOf('id="date-to"');
    const modelFilterPos = html.indexOf('id="model-filter"');
    assert.ok(modelFilterPos > dateToPos, "Model filter should appear after date-to input");
  });

  test("model filter has 'All Models' as default option", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find the select element and check it has 'All Models' option with empty value
    assert.ok(html.includes('<option value="">All Models</option>'), "Should have 'All Models' option with empty value");
  });

  test("model filter is a select element with correct class", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('class="model-filter-select"'), "Should have model-filter-select class");
    assert.ok(html.includes('<select id="model-filter"'), "Should be a select element");
  });

  test("model filter has label matching date filter style", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('for="model-filter"'), "Should have label for model-filter");
    assert.ok(html.includes('>Model</label>'), "Should have Model label text");
    
    // Label should use date-filter-label class for consistent styling
    const labelMatch = html.match(/<label[^>]*for="model-filter"[^>]*>/);
    assert.ok(labelMatch, "Should find model-filter label");
    assert.ok(labelMatch[0].includes('date-filter-label'), "Label should use date-filter-label class");
  });

  test("has CSS styles for model filter select", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.model-filter-select{'), "Should have .model-filter-select style");
    assert.ok(html.includes('.model-filter-select:focus{'), "Should have focus style");
  });

  test("model filter CSS matches dashboard theme", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Check that model filter uses theme variables like date filter
    const cssMatch = html.match(/\.model-filter-select\{[^}]+\}/);
    assert.ok(cssMatch, "Should find .model-filter-select CSS");
    assert.ok(cssMatch[0].includes('var(--bg-surface)'), "Should use --bg-surface");
    assert.ok(cssMatch[0].includes('var(--border)'), "Should use --border");
    assert.ok(cssMatch[0].includes('border-radius:6px'), "Should have 6px border radius matching inputs");
  });

  test("has loadModelOptions function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('async function loadModelOptions'), "Should have loadModelOptions function");
    assert.ok(html.includes("group_by=model"), "loadModelOptions should fetch models using group_by=model");
  });

  test("loadModelOptions populates dropdown with models from API", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const funcMatch = html.match(/async function loadModelOptions[\s\S]*?^\}/m);
    assert.ok(funcMatch, "Should find loadModelOptions function");
    assert.ok(funcMatch[0].includes("modelSelect.innerHTML"), "Should update select innerHTML");
    assert.ok(funcMatch[0].includes('value="">All Models</option>'), "Should include All Models option");
  });

  test("has getModelFilterParam function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('function getModelFilterParam()'), "Should have getModelFilterParam function");
  });

  test("has getFilterParams function combining date and model filters", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('function getFilterParams()'), "Should have getFilterParams function");
    
    const funcMatch = html.match(/function getFilterParams\(\)[\s\S]*?return params\.toString\(\);\s*\}/);
    assert.ok(funcMatch, "Should find getFilterParams function");
    assert.ok(funcMatch[0].includes("params.set('model'"), "Should include model in filter params");
    assert.ok(funcMatch[0].includes("params.set('from_date'"), "Should include from_date in filter params");
    assert.ok(funcMatch[0].includes("params.set('to_date'"), "Should include to_date in filter params");
  });

  test("model filter change triggers loadCostsSummary", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("modelSelect.addEventListener('change', loadCostsSummary)"), "Should add change listener to model filter");
  });

  test("loadCostsSummary uses getFilterParams", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const funcMatch = html.match(/async function loadCostsSummary[\s\S]*?loadAgentBreakdown\(\);[\s\S]*?\}/);
    assert.ok(funcMatch, "Should find loadCostsSummary function");
    assert.ok(funcMatch[0].includes("getFilterParams()"), "loadCostsSummary should use getFilterParams");
  });

  test("loadModelBreakdown uses getFilterParams", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const funcMatch = html.match(/async function loadModelBreakdown[\s\S]*?^\}/m);
    assert.ok(funcMatch, "Should find loadModelBreakdown function");
    assert.ok(funcMatch[0].includes("getFilterParams()"), "loadModelBreakdown should use getFilterParams");
  });

  test("loadAgentBreakdown uses getFilterParams", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const funcMatch = html.match(/async function loadAgentBreakdown[\s\S]*?^\}/m);
    assert.ok(funcMatch, "Should find loadAgentBreakdown function");
    assert.ok(funcMatch[0].includes("getFilterParams()"), "loadAgentBreakdown should use getFilterParams");
  });

  test("loadCostsSummary calls loadModelOptions to refresh dropdown", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const funcMatch = html.match(/async function loadCostsSummary[\s\S]*?loadAgentBreakdown\(\);[\s\S]*?\}/);
    assert.ok(funcMatch, "Should find loadCostsSummary function");
    assert.ok(funcMatch[0].includes("loadModelOptions()"), "loadCostsSummary should call loadModelOptions");
  });

  test("loadModelOptions uses escapeHtml for XSS protection", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const funcMatch = html.match(/async function loadModelOptions[\s\S]*?^\}/m);
    assert.ok(funcMatch, "Should find loadModelOptions function");
    assert.ok(funcMatch[0].includes("escapeHtml(m)"), "Should use escapeHtml on model names");
  });

  test("model filter is in date-filter-group container", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // The model filter should be wrapped in a date-filter-group like the date inputs
    const groupMatch = html.match(/<div class="date-filter-group">[\s\S]*?id="model-filter"[\s\S]*?<\/div>/);
    assert.ok(groupMatch, "Model filter should be in a date-filter-group container");
  });
});

describe("Date Filter UI", () => {
  let server: http.Server;
  const TEST_PORT = 33345;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("costs-view contains date-filter section above summary cards", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="date-filter"'), "Should have date-filter container");
    assert.ok(html.includes('class="date-filter"'), "Should have date-filter class");
    
    // Date filter should appear before summary-cards in the HTML
    const dateFilterPos = html.indexOf('id="date-filter"');
    const summaryCardsPos = html.indexOf('id="summary-cards"');
    assert.ok(dateFilterPos < summaryCardsPos, "Date filter should appear before summary cards");
  });

  test("has From date input with correct attributes", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="date-from"'), "Should have date-from input");
    assert.ok(html.includes('type="date"'), "Should have type=date");
    assert.ok(html.includes('class="date-filter-input"'), "Should have date-filter-input class");
    assert.ok(html.includes('for="date-from"'), "Should have label for date-from");
    assert.ok(html.includes('>From</label>'), "Should have From label text");
  });

  test("has To date input with correct attributes", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="date-to"'), "Should have date-to input");
    assert.ok(html.includes('for="date-to"'), "Should have label for date-to");
    assert.ok(html.includes('>To</label>'), "Should have To label text");
  });

  test("has CSS styles for date filter", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.date-filter{'), "Should have .date-filter style");
    assert.ok(html.includes('.date-filter-group{'), "Should have .date-filter-group style");
    assert.ok(html.includes('.date-filter-label{'), "Should have .date-filter-label style");
    assert.ok(html.includes('.date-filter-input{'), "Should have .date-filter-input style");
  });

  test("has JavaScript to initialize date filter with last 30 days", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('initDateFilter'), "Should have initDateFilter function");
    assert.ok(html.includes('setDate(today.getDate() - 30)'), "Should set from date to 30 days ago");
    assert.ok(html.includes("dateFrom.value = toISODate(thirtyDaysAgo)"), "Should set dateFrom value");
    assert.ok(html.includes("dateTo.value = toISODate(today)"), "Should set dateTo value");
  });

  test("has JavaScript to refresh data on date change", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("dateFrom.addEventListener('change', loadCostsSummary)"), "Should add change listener to dateFrom");
    assert.ok(html.includes("dateTo.addEventListener('change', loadCostsSummary)"), "Should add change listener to dateTo");
  });

  test("has getDateFilterParams function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('function getDateFilterParams()'), "Should have getDateFilterParams function");
    assert.ok(html.includes("params.set('from_date'"), "Should set from_date param");
    assert.ok(html.includes("params.set('to_date'"), "Should set to_date param");
  });

  test("loadCostsSummary includes filter params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find loadCostsSummary and verify it uses getFilterParams (includes date and model)
    const match = html.match(/async function loadCostsSummary[\s\S]*?loadAgentBreakdown\(\);[\s\S]*?\}/);
    assert.ok(match, "Should find loadCostsSummary function");
    assert.ok(match[0].includes("getFilterParams()"), "loadCostsSummary should call getFilterParams");
  });

  test("loadModelBreakdown includes filter params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const match = html.match(/async function loadModelBreakdown[\s\S]*?^\}/m);
    assert.ok(match, "Should find loadModelBreakdown function");
    assert.ok(match[0].includes("getFilterParams()"), "loadModelBreakdown should call getFilterParams");
  });

  test("loadAgentBreakdown includes filter params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const match = html.match(/async function loadAgentBreakdown[\s\S]*?^\}/m);
    assert.ok(match, "Should find loadAgentBreakdown function");
    assert.ok(match[0].includes("getFilterParams()"), "loadAgentBreakdown should call getFilterParams");
  });
});

describe("Daily Usage Chart UI", () => {
  let server: http.Server;
  const TEST_PORT = 33346;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("costs-view contains daily-chart-container between summary cards and tables", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="daily-chart-container"'), "Should have daily-chart-container");
    assert.ok(html.includes('class="daily-chart-container"'), "Should have daily-chart-container class");
    
    // Chart should appear after summary-cards and before model-breakdown
    const summaryCardsPos = html.indexOf('id="summary-cards"');
    const chartPos = html.indexOf('id="daily-chart-container"');
    const modelBreakdownPos = html.indexOf('id="model-breakdown"');
    
    assert.ok(summaryCardsPos < chartPos, "Chart should appear after summary cards");
    assert.ok(chartPos < modelBreakdownPos, "Chart should appear before model breakdown");
  });

  test("has chart title 'Daily Usage Trend'", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('class="daily-chart-title"'), "Should have chart title element");
    assert.ok(html.includes('>Daily Usage Trend</div>'), "Should have 'Daily Usage Trend' title text");
  });

  test("has chart content container", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="daily-chart-content"'), "Should have daily-chart-content container");
  });

  test("has CSS styles for daily chart", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.daily-chart-container{'), "Should have .daily-chart-container style");
    assert.ok(html.includes('.daily-chart-title{'), "Should have .daily-chart-title style");
    assert.ok(html.includes('.daily-chart-svg{'), "Should have .daily-chart-svg style");
    assert.ok(html.includes('.daily-chart-bar{'), "Should have .daily-chart-bar style");
  });

  test("chart bars use green theme color", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.daily-chart-bar{fill:var(--accent-green)'), "Bar fill should use --accent-green");
    assert.ok(html.includes('.daily-chart-bar:hover{fill:var(--accent-teal)'), "Bar hover should use --accent-teal");
  });

  test("has tooltip styles", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.daily-chart-tooltip{'), "Should have .daily-chart-tooltip style");
    assert.ok(html.includes('.daily-chart-tooltip-date{'), "Should have .daily-chart-tooltip-date style");
    assert.ok(html.includes('.daily-chart-tooltip-value{'), "Should have .daily-chart-tooltip-value style");
  });

  test("has loadDailyChart function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('async function loadDailyChart()'), "Should have loadDailyChart function");
  });

  test("loadDailyChart fetches from group_by=day endpoint", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const match = html.match(/async function loadDailyChart[\s\S]*?^\}/m);
    assert.ok(match, "Should find loadDailyChart function");
    assert.ok(match[0].includes("group_by=day"), "loadDailyChart should fetch with group_by=day");
    assert.ok(match[0].includes("getFilterParams()"), "loadDailyChart should use filter params");
  });

  test("has renderDailyChart function that creates SVG", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('function renderDailyChart(container, data)'), "Should have renderDailyChart function");
    assert.ok(html.includes('class="daily-chart-svg"'), "Should create SVG with correct class");
    assert.ok(html.includes('class="daily-chart-bar"'), "Should create bar elements");
  });

  test("chart includes x-axis and y-axis elements", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.daily-chart-axis-line{'), "Should have axis line style");
    assert.ok(html.includes('.daily-chart-axis-label{'), "Should have axis label style");
    assert.ok(html.includes('.daily-chart-grid-line{'), "Should have grid line style");
  });

  test("loadCostsSummary calls loadDailyChart", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find loadCostsSummary and verify it calls loadDailyChart
    const match = html.match(/async function loadCostsSummary[\s\S]*?loadAgentBreakdown\(\);[\s\S]*?\}/);
    assert.ok(match, "Should find loadCostsSummary function");
    assert.ok(match[0].includes("loadDailyChart()"), "loadCostsSummary should call loadDailyChart");
  });

  test("chart bars have hover event handlers", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("bar.addEventListener('mouseenter'"), "Should add mouseenter listener");
    assert.ok(html.includes("bar.addEventListener('mousemove'"), "Should add mousemove listener");
    assert.ok(html.includes("bar.addEventListener('mouseleave'"), "Should add mouseleave listener");
  });

  test("tooltip displays date and formatted cost", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('daily-chart-tooltip-date'), "Tooltip should show date");
    assert.ok(html.includes('daily-chart-tooltip-value'), "Tooltip should show value");
    assert.ok(html.includes("formatCurrency(cost)"), "Should format cost as currency in tooltip");
  });
});

describe("Usage Log API", () => {
  let server: http.Server;
  const TEST_PORT = 33347;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Insert test data
    const { insertUsage } = await import("../installer/usage.js");
    for (let i = 0; i < 75; i++) {
      insertUsage({
        agentId: `test-log-agent-${i % 3}`,
        model: "gpt-4o",
        inputTokens: 1000 + i,
        outputTokens: 500 + i,
        costUsd: 0.05 + (i * 0.001),
        taskLabel: `task-${i}`,
        createdAt: new Date(Date.now() - i * 60000).toISOString(),
      });
    }
  });

  after(async () => {
    server.close();
  });

  async function fetchJSON(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject);
    });
  }

  test("GET /api/usage/log returns paginated records", async () => {
    const result = await fetchJSON("/api/usage/log");
    
    assert.strictEqual(result.status, 200);
    assert.ok(Array.isArray(result.data.records), "Should return records array");
    assert.ok(typeof result.data.total === "number", "Should return total count");
    assert.strictEqual(result.data.limit, 50, "Default limit should be 50");
    assert.strictEqual(result.data.offset, 0, "Default offset should be 0");
  });

  test("GET /api/usage/log supports limit parameter", async () => {
    const result = await fetchJSON("/api/usage/log?limit=10");
    
    assert.strictEqual(result.status, 200);
    assert.ok(result.data.records.length <= 10, "Should respect limit parameter");
    assert.strictEqual(result.data.limit, 10, "Should return requested limit");
  });

  test("GET /api/usage/log supports offset parameter", async () => {
    const result = await fetchJSON("/api/usage/log?limit=10&offset=10");
    
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.offset, 10, "Should return requested offset");
    assert.ok(result.data.records.length > 0, "Should return records at offset");
  });

  test("GET /api/usage/log validates limit range", async () => {
    const tooSmall = await fetchJSON("/api/usage/log?limit=0");
    assert.strictEqual(tooSmall.status, 400);
    assert.ok(tooSmall.data.error.includes("limit"), "Should reject limit < 1");

    const tooLarge = await fetchJSON("/api/usage/log?limit=600");
    assert.strictEqual(tooLarge.status, 400);
    assert.ok(tooLarge.data.error.includes("limit"), "Should reject limit > 500");
  });

  test("GET /api/usage/log validates offset", async () => {
    const negative = await fetchJSON("/api/usage/log?offset=-1");
    assert.strictEqual(negative.status, 400);
    assert.ok(negative.data.error.includes("offset"), "Should reject negative offset");
  });

  test("GET /api/usage/log records contain expected fields", async () => {
    const result = await fetchJSON("/api/usage/log?limit=1");
    
    assert.strictEqual(result.status, 200);
    assert.ok(result.data.records.length > 0, "Should have at least one record");
    
    const record = result.data.records[0];
    assert.ok("id" in record, "Record should have id");
    assert.ok("agentId" in record, "Record should have agentId");
    assert.ok("model" in record, "Record should have model");
    assert.ok("createdAt" in record, "Record should have createdAt");
  });

  test("GET /api/usage/log supports date filters", async () => {
    const today = new Date().toISOString().split("T")[0];
    const result = await fetchJSON(`/api/usage/log?from_date=${today}`);
    
    assert.strictEqual(result.status, 200);
    assert.ok(Array.isArray(result.data.records), "Should return filtered records");
  });

  test("GET /api/usage/log supports model filter", async () => {
    const result = await fetchJSON("/api/usage/log?model=gpt-4o");
    
    assert.strictEqual(result.status, 200);
    result.data.records.forEach((r: any) => {
      assert.strictEqual(r.model, "gpt-4o", "All records should match model filter");
    });
  });

  test("GET /api/usage/log returns records ordered by created_at DESC", async () => {
    const result = await fetchJSON("/api/usage/log?limit=10");
    
    assert.strictEqual(result.status, 200);
    const records = result.data.records;
    for (let i = 0; i < records.length - 1; i++) {
      const current = new Date(records[i].createdAt).getTime();
      const next = new Date(records[i + 1].createdAt).getTime();
      assert.ok(current >= next, "Records should be sorted by createdAt DESC");
    }
  });
});

describe("Usage Log UI", () => {
  let server: http.Server;
  const TEST_PORT = 33348;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("costs-view contains usage-log-section below agent-breakdown", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="usage-log-section"'), "Should have usage-log-section");
    
    // Usage log should appear after agent breakdown
    const agentBreakdownPos = html.indexOf('id="agent-breakdown"');
    const usageLogPos = html.indexOf('id="usage-log-section"');
    assert.ok(agentBreakdownPos < usageLogPos, "Usage log should appear after agent breakdown");
  });

  test("has collapsible header with chevron and title", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="usage-log-header"'), "Should have usage-log-header");
    assert.ok(html.includes('class="usage-log-chevron"'), "Should have chevron indicator");
    assert.ok(html.includes('class="usage-log-title"'), "Should have title");
    assert.ok(html.includes('>Usage Log</span>'), "Should have 'Usage Log' title text");
    assert.ok(html.includes('id="usage-log-count"'), "Should have count element");
  });

  test("usage log content is collapsed by default", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Content should have class but not .open class initially
    assert.ok(html.includes('class="usage-log-content" id="usage-log-content"'), 
      "Content should not have 'open' class initially");
    assert.ok(html.includes('.usage-log-content{display:none'), "Content should be hidden by default in CSS");
    assert.ok(html.includes('.usage-log-content.open{display:block}'), "Content should show when open class added");
  });

  test("has usage log table with correct columns", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const tableMatch = html.match(/id="usage-log-table"[\s\S]*?<\/table>/);
    assert.ok(tableMatch, "Should find usage-log-table");
    
    const table = tableMatch[0];
    assert.ok(table.includes('<th>Timestamp</th>'), "Should have Timestamp column");
    assert.ok(table.includes('<th>Agent</th>'), "Should have Agent column");
    assert.ok(table.includes('<th>Model</th>'), "Should have Model column");
    assert.ok(table.includes('>Input</th>'), "Should have Input column");
    assert.ok(table.includes('>Output</th>'), "Should have Output column");
    assert.ok(table.includes('>Cost</th>'), "Should have Cost column");
    assert.ok(table.includes('<th>Task</th>'), "Should have Task column");
  });

  test("has pagination controls", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="usage-log-pagination"'), "Should have pagination container");
    assert.ok(html.includes('id="usage-log-pagination-info"'), "Should have pagination info");
    assert.ok(html.includes('id="usage-log-prev"'), "Should have prev button");
    assert.ok(html.includes('id="usage-log-next"'), "Should have next button");
    assert.ok(html.includes('← Prev</button>'), "Prev button should have correct text");
    assert.ok(html.includes('Next →</button>'), "Next button should have correct text");
  });

  test("has CSS styles for usage log components", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.usage-log-section{'), "Should have usage-log-section style");
    assert.ok(html.includes('.usage-log-header{'), "Should have usage-log-header style");
    assert.ok(html.includes('.usage-log-chevron{'), "Should have usage-log-chevron style");
    assert.ok(html.includes('.usage-log-table{'), "Should have usage-log-table style");
    assert.ok(html.includes('.usage-log-pagination{'), "Should have usage-log-pagination style");
    assert.ok(html.includes('.usage-log-pagination-btn{'), "Should have pagination button style");
  });

  test("header is clickable and toggles content", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("header.addEventListener('click'"), "Header should have click handler");
    assert.ok(html.includes("content.classList.toggle('open'"), "Click should toggle open class on content");
    assert.ok(html.includes("chevron.classList.toggle('open'"), "Click should toggle open class on chevron");
  });

  test("has loadUsageLog function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('async function loadUsageLog()'), "Should have loadUsageLog function");
  });

  test("loadUsageLog fetches from /api/usage/log with pagination params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const match = html.match(/async function loadUsageLog[\s\S]*?^\}/m);
    assert.ok(match, "Should find loadUsageLog function");
    assert.ok(match[0].includes("/api/usage/log"), "Should fetch from /api/usage/log");
    assert.ok(match[0].includes("limit"), "Should include limit param");
    assert.ok(match[0].includes("offset"), "Should include offset param");
    assert.ok(match[0].includes("getFilterParams()"), "Should include date/model filters");
  });

  test("pagination buttons navigate pages", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("prevBtn.addEventListener('click'"), "Prev button should have click handler");
    assert.ok(html.includes("nextBtn.addEventListener('click'"), "Next button should have click handler");
    assert.ok(html.includes("usageLogOffset - usageLogLimit"), "Prev should decrease offset");
    assert.ok(html.includes("usageLogOffset += usageLogLimit"), "Next should increase offset");
  });

  test("pagination controls disable when at boundaries", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("prevBtn.disabled = data.offset === 0"), "Prev should disable at start");
    assert.ok(html.includes("nextBtn.disabled = data.offset + data.limit >= data.total"), "Next should disable at end");
  });

  test("opening usage log triggers initial load", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // When opened, should reset offset and load
    assert.ok(html.includes("usageLogOffset = 0"), "Should reset offset to 0 when opened");
    assert.ok(html.includes("if (usageLogOpen)"), "Should check if open");
    assert.ok(html.match(/if \(usageLogOpen\)[\s\S]*?loadUsageLog\(\)/), "Should call loadUsageLog when opened");
  });
});

describe("CSV Export UI", () => {
  let server: http.Server;
  const TEST_PORT = 33345;

  before(async () => {
    const { startDashboard } = await import("./dashboard.js");
    server = startDashboard(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    server.close();
  });

  test("export CSV button exists in date-filter section", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('id="export-csv-btn"'), "Should have export-csv-btn");
    assert.ok(html.includes('class="export-csv-btn"'), "Should have export-csv-btn class");
    assert.ok(html.includes('Export CSV'), "Button should contain 'Export CSV' text");
  });

  test("export button is in the date-filter container", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find the date-filter section and verify export button is inside it
    const dateFilterMatch = html.match(/class="date-filter"[\s\S]*?<\/div>\s*<div class="summary-cards"/);
    assert.ok(dateFilterMatch, "Should find date-filter section");
    assert.ok(dateFilterMatch[0].includes('id="export-csv-btn"'), "Export button should be inside date-filter");
  });

  test("export button has download icon SVG", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const btnMatch = html.match(/id="export-csv-btn"[\s\S]*?<\/button>/);
    assert.ok(btnMatch, "Should find export button");
    assert.ok(btnMatch[0].includes('<svg'), "Button should contain SVG icon");
    assert.ok(btnMatch[0].includes('viewBox='), "SVG should have viewBox");
  });

  test("has CSS styles for export button", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('.export-csv-btn{'), "Should have export-csv-btn style");
    assert.ok(html.includes('.export-csv-btn:hover{'), "Should have hover style");
    assert.ok(html.includes('.export-csv-btn:disabled{'), "Should have disabled style");
  });

  test("export button has margin-left auto for right alignment", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const styleMatch = html.match(/\.export-csv-btn\{[^}]+\}/);
    assert.ok(styleMatch, "Should find export-csv-btn style");
    assert.ok(styleMatch[0].includes('margin-left:auto'), "Should have margin-left:auto for right alignment");
  });

  test("has initCsvExport initialization function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('function initCsvExport()'), "Should have initCsvExport function");
    assert.ok(html.includes("getElementById('export-csv-btn')"), "Should get export button by ID");
  });

  test("export button has click handler", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes("btn.addEventListener('click'"), "Export button should have click handler");
  });

  test("export fetches from /api/usage/log with high limit", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find the export click handler
    const exportMatch = html.match(/function initCsvExport[\s\S]*?^\}\)\(\);/m);
    assert.ok(exportMatch, "Should find initCsvExport function");
    assert.ok(exportMatch[0].includes("/api/usage/log"), "Should fetch from /api/usage/log");
    assert.ok(exportMatch[0].includes("limit"), "Should include limit param");
    assert.ok(exportMatch[0].includes("'10000'") || exportMatch[0].includes('"10000"'), "Should use high limit to get all records");
  });

  test("export uses current filter params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const exportMatch = html.match(/function initCsvExport[\s\S]*?^\}\)\(\);/m);
    assert.ok(exportMatch, "Should find initCsvExport function");
    assert.ok(exportMatch[0].includes("getFilterParams()"), "Should use getFilterParams for date/model filters");
  });

  test("has generateCsv function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('function generateCsv(records)'), "Should have generateCsv function");
  });

  test("generateCsv includes correct headers", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const csvMatch = html.match(/function generateCsv[\s\S]*?^}/m);
    assert.ok(csvMatch, "Should find generateCsv function");
    
    // Check required headers
    assert.ok(csvMatch[0].includes("'timestamp'"), "Should have timestamp header");
    assert.ok(csvMatch[0].includes("'agent'"), "Should have agent header");
    assert.ok(csvMatch[0].includes("'model'"), "Should have model header");
    assert.ok(csvMatch[0].includes("'input_tokens'"), "Should have input_tokens header");
    assert.ok(csvMatch[0].includes("'output_tokens'"), "Should have output_tokens header");
    assert.ok(csvMatch[0].includes("'cost'"), "Should have cost header");
    assert.ok(csvMatch[0].includes("'task'"), "Should have task header");
    assert.ok(csvMatch[0].includes("'run_id'"), "Should have run_id header");
  });

  test("generateCsv has escape function for special characters", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const csvMatch = html.match(/function generateCsv[\s\S]*?^}/m);
    assert.ok(csvMatch, "Should find generateCsv function");
    assert.ok(csvMatch[0].includes('escapeCsvValue'), "Should have escapeCsvValue helper");
    assert.ok(csvMatch[0].includes('includes('), "Should check for special characters");
    assert.ok(csvMatch[0].includes('replace(/"/g'), "Should escape double quotes");
  });

  test("has downloadCsv function", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    assert.ok(html.includes('function downloadCsv(content, filename)'), "Should have downloadCsv function");
  });

  test("downloadCsv creates blob and triggers download", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const downloadMatch = html.match(/function downloadCsv[\s\S]*?^}/m);
    assert.ok(downloadMatch, "Should find downloadCsv function");
    assert.ok(downloadMatch[0].includes('new Blob'), "Should create Blob");
    assert.ok(downloadMatch[0].includes("'text/csv"), "Should use text/csv MIME type");
    assert.ok(downloadMatch[0].includes('.download ='), "Should set download attribute");
    assert.ok(downloadMatch[0].includes('.click()'), "Should trigger click to download");
  });

  test("filename includes date range", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const exportMatch = html.match(/function initCsvExport[\s\S]*?^\}\)\(\);/m);
    assert.ok(exportMatch, "Should find initCsvExport function");
    
    // Check that filename uses date range from filter
    assert.ok(exportMatch[0].includes("date-from"), "Should get from date for filename");
    assert.ok(exportMatch[0].includes("date-to"), "Should get to date for filename");
    assert.ok(exportMatch[0].includes("usage_"), "Filename should start with 'usage_'");
    assert.ok(exportMatch[0].includes(".csv"), "Filename should end with .csv");
  });

  test("button shows loading state during export", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const exportMatch = html.match(/function initCsvExport[\s\S]*?^\}\)\(\);/m);
    assert.ok(exportMatch, "Should find initCsvExport function");
    assert.ok(exportMatch[0].includes("btn.disabled = true"), "Should disable button during export");
    assert.ok(exportMatch[0].includes("'Exporting...'") || exportMatch[0].includes('"Exporting..."'), "Should show loading text");
  });

  test("button re-enables after export completes", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const exportMatch = html.match(/function initCsvExport[\s\S]*?^\}\)\(\);/m);
    assert.ok(exportMatch, "Should find initCsvExport function");
    assert.ok(exportMatch[0].includes("finally"), "Should have finally block");
    assert.ok(exportMatch[0].includes("btn.disabled = false"), "Should re-enable button in finally");
  });
});
