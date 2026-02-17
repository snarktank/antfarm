import http from "http";
import { getDb } from "../db.js";
import { aggregateAllLogs } from "./log-aggregator.js";

/**
 * Type for analysis run submission
 */
interface AnalysisRunRequest {
  workflowId?: string;
  runId?: string;
  fromDate?: string;
  toDate?: string;
  maxRuns?: number;
}

/**
 * Type for analysis result response
 */
interface AnalysisResultResponse {
  runId: string;
  status: 'completed' | 'failed';
  analysisResult?: any; // We'll simplify for now since we don't have strict typing yet
  error?: string;
  submittedAt?: string;
  completedAt?: string;
}

export function startOpsIntelligenceAPI(port = 3334) {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Handle POST /api/ops-intelligence/analyze
    if (req.method === "POST" && req.url === "/api/ops-intelligence/analyze") {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const requestData = JSON.parse(body);
          
          if (!requestData.runId) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "runId is required" }));
            return;
          }

          // Insert into database
          const db = getDb();
          const now = new Date().toISOString();
          
          db.prepare(`
            INSERT INTO ops_analysis_runs (id, run_id, analyzed_at, pattern_count, finding_count, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `run-${Date.now()}`,
            requestData.runId,
            now,
            0,  // pattern_count
            0,  // finding_count
            "completed", // status
            now,
            now
          );

          // Return response
          const response: AnalysisResultResponse = {
            runId: requestData.runId,
            status: "completed",
            submittedAt: now,
            completedAt: now
          };
          
          res.writeHead(200);
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
      return;
    }

    // Handle GET /api/ops-intelligence/analyze/:runId
    if (req.method === "GET" && req.url?.startsWith("/api/ops-intelligence/analyze/")) {
      const runId = req.url.split("/").pop();
      
      try {
        const db = getDb();
        const result = db.prepare("SELECT * FROM ops_analysis_runs WHERE run_id = ?").get(runId);
        
        if (!result) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Analysis run not found" }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify({
            runId: result.run_id,
            status: result.status,
            submittedAt: result.created_at,
            completedAt: result.updated_at
          }));
        }
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    // Handle GET /api/ops-intelligence/status
    if (req.method === "GET" && req.url === "/api/ops-intelligence/status") {
      try {
        const db = getDb();
        const count = db.prepare("SELECT COUNT(*) as total FROM ops_analysis_runs").get() as { total: number };
        
        res.writeHead(200);
        res.end(JSON.stringify({
          status: "operational",
          totalRuns: count.total
        }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    // Default response for unknown routes
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(port, () => {
    console.log(`Ops Intelligence API server running on port ${port}`);
  });

  return server;
}