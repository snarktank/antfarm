import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLinkStore } from "../dist/server/link-storage.js";

describe("Dashboard de Enlaces storage", () => {
  it("persiste enlaces y los lista ordenados", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ant-links-"));
    const store = createLinkStore({ filePath: path.join(tempDir, "links.json"), maxEntries: 3 });

    store.addLink({ url: "https://docs.openclaw.ai", title: "Docs", category: "Referencia", notes: "Manual" });
    store.addLink({ url: "https://example.com", title: "Demo", category: "Demo", notes: "Prueba" });
    store.addLink({ url: "https://updates.openclaw.ai", title: "Actualizaciones", category: "Noticias" });

    const snapshot = store.listLinks();
    assert.equal(snapshot.length, 3);
    assert.equal(snapshot[0].title, "Actualizaciones", "El más reciente debe ir primero");
    assert(snapshot.some((item) => item.category === "Demo"));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("filtra y lista categorías activas", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ant-links-"));
    const store = createLinkStore({ filePath: path.join(tempDir, "links.json"), maxEntries: 10 });

    store.addLink({ url: "https://app.openclaw.ai", title: "App", category: "Apps" });
    store.addLink({ url: "https://support.openclaw.ai", title: "Soporte", category: "Soporte" });
    store.addLink({ url: "https://nodejs.org", title: "Node", category: "Desarrollo" });

    const filtered = store.listLinks({ query: "openclaw" });
    assert.equal(filtered.length, 2);

    const categories = store.listCategories();
    assert.deepEqual(categories.map((item) => item.name), ["Apps", "Desarrollo", "Soporte"]);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
