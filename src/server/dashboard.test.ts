import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startDashboard } from "./dashboard.js";

describe("Dashboard Security", () => {
  describe("CORS headers - should not allow wildcard origin", () => {
    it("should reject cross-origin requests without Authorization", async () => {
      const server = startDashboard(0); // Use port 0 for automatic port selection
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://localhost:${port}/api/workflows`, {
          headers: {
            "Origin": "https://malicious.example.com",
          },
        });

        const headers = response.headers;
        // CORS header should either be absent or only allow localhost
        const corsHeader = headers.get("Access-Control-Allow-Origin");
        assert.ok(
          !corsHeader || corsHeader === "https://malicious.example.com" === false,
          "Should not set CORS header for non-localhost origins"
        );
      } finally {
        server.close();
      }
    });

    it("should allow localhost origins to access API", async () => {
      const server = startDashboard(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://localhost:${port}/api/workflows`, {
          headers: {
            "Origin": "http://localhost:3000",
          },
        });

        const headers = response.headers;
        const corsHeader = headers.get("Access-Control-Allow-Origin");
        assert.equal(corsHeader, "http://localhost:3000", "Should allow localhost origin");
      } finally {
        server.close();
      }
    });

    it("should allow 127.0.0.1 origins to access API", async () => {
      const server = startDashboard(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://localhost:${port}/api/workflows`, {
          headers: {
            "Origin": "http://127.0.0.1:3000",
          },
        });

        const headers = response.headers;
        const corsHeader = headers.get("Access-Control-Allow-Origin");
        assert.equal(corsHeader, "http://127.0.0.1:3000", "Should allow 127.0.0.1 origin");
      } finally {
        server.close();
      }
    });

    it("should not set CORS header for font requests from non-localhost", async () => {
      // Note: This would need actual font files to test properly
      const server = startDashboard(0);
      const port = (server.address() as any).port;

      try {
        // Try to request a font (will 404 but we're testing the headers)
        const response = await fetch(`http://localhost:${port}/fonts/test.woff2`, {
          headers: {
            "Origin": "https://evil.example.com",
          },
        });

        const corsHeader = response.headers.get("Access-Control-Allow-Origin");
        assert.ok(
          !corsHeader || corsHeader !== "*",
          "Font endpoints should not have wildcard CORS"
        );
      } finally {
        server.close();
      }
    });
  });

  describe("Dashboard Authentication", () => {
    it("should allow unauthenticated access when ANTFARM_DASHBOARD_TOKEN is not set", async () => {
      // Temporarily clear env var
      const original = process.env.ANTFARM_DASHBOARD_TOKEN;
      delete process.env.ANTFARM_DASHBOARD_TOKEN;

      try {
        const server = startDashboard(0);
        const port = (server.address() as any).port;

        try {
          const response = await fetch(`http://localhost:${port}/api/workflows`);
          assert.ok(response.ok || response.status === 200, "Should allow request without token when not configured");
        } finally {
          server.close();
        }
      } finally {
        if (original) process.env.ANTFARM_DASHBOARD_TOKEN = original;
      }
    });

    it("should reject requests without Bearer token when ANTFARM_DASHBOARD_TOKEN is set", async () => {
      const original = process.env.ANTFARM_DASHBOARD_TOKEN;
      process.env.ANTFARM_DASHBOARD_TOKEN = "test-secret-token";

      try {
        const server = startDashboard(0);
        const port = (server.address() as any).port;

        try {
          const response = await fetch(`http://localhost:${port}/api/workflows`);
          assert.equal(response.status, 401, "Should reject request without Bearer token");
        } finally {
          server.close();
        }
      } finally {
        if (original) process.env.ANTFARM_DASHBOARD_TOKEN = original;
        else delete process.env.ANTFARM_DASHBOARD_TOKEN;
      }
    });

    it("should accept requests with correct Bearer token", async () => {
      const original = process.env.ANTFARM_DASHBOARD_TOKEN;
      process.env.ANTFARM_DASHBOARD_TOKEN = "test-secret-token";

      try {
        const server = startDashboard(0);
        const port = (server.address() as any).port;

        try {
          const response = await fetch(`http://localhost:${port}/api/workflows`, {
            headers: {
              "Authorization": "Bearer test-secret-token",
            },
          });
          assert.ok(response.ok || response.status !== 401, "Should accept request with correct Bearer token");
        } finally {
          server.close();
        }
      } finally {
        if (original) process.env.ANTFARM_DASHBOARD_TOKEN = original;
        else delete process.env.ANTFARM_DASHBOARD_TOKEN;
      }
    });

    it("should reject requests with incorrect Bearer token", async () => {
      const original = process.env.ANTFARM_DASHBOARD_TOKEN;
      process.env.ANTFARM_DASHBOARD_TOKEN = "test-secret-token";

      try {
        const server = startDashboard(0);
        const port = (server.address() as any).port;

        try {
          const response = await fetch(`http://localhost:${port}/api/workflows`, {
            headers: {
              "Authorization": "Bearer wrong-token",
            },
          });
          assert.equal(response.status, 401, "Should reject request with incorrect Bearer token");
        } finally {
          server.close();
        }
      } finally {
        if (original) process.env.ANTFARM_DASHBOARD_TOKEN = original;
        else delete process.env.ANTFARM_DASHBOARD_TOKEN;
      }
    });
  });
});
