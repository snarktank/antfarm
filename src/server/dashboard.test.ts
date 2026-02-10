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

  test("loadCostsSummary includes date filter params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    // Find loadCostsSummary and verify it uses getDateFilterParams
    const match = html.match(/async function loadCostsSummary[\s\S]*?^\}/m);
    assert.ok(match, "Should find loadCostsSummary function");
    assert.ok(match[0].includes("getDateFilterParams()"), "loadCostsSummary should call getDateFilterParams");
  });

  test("loadModelBreakdown includes date filter params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const match = html.match(/async function loadModelBreakdown[\s\S]*?^\}/m);
    assert.ok(match, "Should find loadModelBreakdown function");
    assert.ok(match[0].includes("getDateFilterParams()"), "loadModelBreakdown should call getDateFilterParams");
  });

  test("loadAgentBreakdown includes date filter params", async () => {
    const html = await fetchHTML(TEST_PORT, "/");
    
    const match = html.match(/async function loadAgentBreakdown[\s\S]*?^\}/m);
    assert.ok(match, "Should find loadAgentBreakdown function");
    assert.ok(match[0].includes("getDateFilterParams()"), "loadAgentBreakdown should call getDateFilterParams");
  });
});
