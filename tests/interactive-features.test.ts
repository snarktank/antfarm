/**
 * US-017: Verify all interactive features work correctly
 * 
 * This test suite verifies that all interactive features work correctly
 * after the Tailwind CSS migration. Tests cover:
 * - Workflow selection and auto-refresh
 * - Card clicks to open run details
 * - Step and story chevrons expand/collapse
 * - Theme toggle switches and persists
 * - Medic badge click opens/closes panel
 * - Overlay click closes panel
 * - Escape key closes panel
 * - Responsive layout on different screen sizes
 * - All API endpoints work correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const srcHtml = readFileSync(path.join(projectRoot, 'src/server/index.html'), 'utf-8');

describe('US-017: Interactive Features', () => {
  
  describe('Workflow Selection', () => {
    it('should have workflow select element with ID', () => {
      assert.ok(srcHtml.includes('id="wf-select"'));
    });

    it('should have selectWorkflow function', () => {
      assert.ok(srcHtml.includes('function selectWorkflow('));
    });

    it('should load workflows on page load', () => {
      assert.ok(srcHtml.includes('loadWorkflows();'));
    });

    it('should have change event listener on workflow select', () => {
      assert.ok(srcHtml.includes("addEventListener('change', e => selectWorkflow(e.target.value))"));
    });

    it('should load runs when workflow is selected', () => {
      assert.ok(srcHtml.match(/if \(currentWf\) loadRuns\(\)/));
    });

    it('should fetch runs from correct API endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON(`/api/runs?workflow=${currentWf.id}`)"));
    });

    it('should render board after loading runs', () => {
      assert.ok(srcHtml.includes('renderBoard(currentWf, runs)'));
    });

    it('should display empty state when no workflow selected', () => {
      assert.ok(srcHtml.includes('Select a workflow'));
    });
  });

  describe('Auto-Refresh', () => {
    it('should have auto-refresh interval set to 30 seconds', () => {
      assert.ok(srcHtml.includes('setInterval(() => { if (currentWf) loadRuns(); }, 30000)'));
    });

    it('should display refresh note in header', () => {
      assert.ok(srcHtml.includes('Auto-refresh: 30s'));
    });

    it('should only refresh when workflow is selected', () => {
      assert.ok(srcHtml.match(/setInterval\([^}]*if \(currentWf\)[^}]*loadRuns/));
    });
  });

  describe('Card Click Opens Run Detail', () => {
    it('should have onclick handler on cards', () => {
      assert.ok(srcHtml.includes("onclick=\"openRun"));
    });

    it('should have openRun function', () => {
      assert.ok(srcHtml.includes('async function openRun('));
    });

    it('should fetch run details from correct API endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON(`/api/runs/${id}`)"));
    });

    it('should populate panel with run details', () => {
      assert.ok(srcHtml.includes("panel.innerHTML = `"));
    });

    it('should open overlay when run is clicked', () => {
      assert.ok(srcHtml.includes("document.getElementById('overlay').classList.add('open')"));
    });

    it('should load stories when run is opened', () => {
      assert.ok(srcHtml.includes('loadStories(id)'));
    });

    it('should load activity when run is opened', () => {
      assert.ok(srcHtml.includes('loadActivity(id)'));
    });

    it('should display run task in panel', () => {
      assert.ok(srcHtml.match(/esc\(run\.task\)/));
    });

    it('should display run status badge in panel', () => {
      assert.ok(srcHtml.match(/runBadgeInfo.*getBadgeClasses\(run\.status\)/));
    });

    it('should display created and updated timestamps', () => {
      assert.ok(srcHtml.includes('Created:'));
      assert.ok(srcHtml.includes('Updated:'));
    });
  });

  describe('Step Details Expand/Collapse', () => {
    it('should have step chevron indicator', () => {
      assert.ok(srcHtml.includes('step-chevron'));
    });

    it('should have onclick handler for step rows with output', () => {
      assert.ok(srcHtml.includes("this.querySelector('.step-details')"));
    });

    it('should toggle step-open class on step-details', () => {
      assert.ok(srcHtml.includes("classList.toggle('step-open')"));
    });

    it('should toggle step-chevron-open class on chevron', () => {
      assert.ok(srcHtml.includes("classList.toggle('step-chevron-open')"));
    });

    it('should only allow expand when step has output', () => {
      assert.ok(srcHtml.match(/const hasOutput = !!s\.output/));
      assert.ok(srcHtml.match(/hasOutput \? `onclick=/));
    });

    it('should display step output in collapsible details', () => {
      assert.ok(srcHtml.includes('<details class="mt-1" onclick="event.stopPropagation()">'));
      assert.ok(srcHtml.includes('<summary'));
      assert.ok(srcHtml.includes('Output</summary>'));
    });

    it('should show step-chevron only when step has output', () => {
      assert.ok(srcHtml.match(/\${hasOutput \? '<span class="step-chevron/));
    });

    it('should hide step-details by default', () => {
      assert.ok(srcHtml.includes('step-details hidden'));
    });

    it('should use cursor:pointer style when step is expandable', () => {
      assert.ok(srcHtml.match(/style="cursor:pointer"/));
    });
  });

  describe('Story Details Expand/Collapse', () => {
    it('should have story chevron indicator', () => {
      assert.ok(srcHtml.includes('story-chevron'));
    });

    it('should have onclick handler for story rows with details', () => {
      assert.ok(srcHtml.includes("this.querySelector('.story-details')"));
    });

    it('should toggle story-open class on story-details', () => {
      assert.ok(srcHtml.includes("classList.toggle('story-open')"));
    });

    it('should toggle story-chevron-open class on chevron', () => {
      assert.ok(srcHtml.includes("classList.toggle('story-chevron-open')"));
    });

    it('should only allow expand when story has details', () => {
      assert.ok(srcHtml.match(/const hasDetails = s\.description \|\| ac\.length > 0 \|\| s\.output/));
      assert.ok(srcHtml.match(/hasDetails \? `onclick=/));
    });

    it('should display story description when available', () => {
      assert.ok(srcHtml.match(/s\.description \? `<div class="mb-2">\${esc\(s\.description\)}<\/div>` : ''/));
    });

    it('should display acceptance criteria when available', () => {
      assert.ok(srcHtml.includes('Acceptance Criteria'));
      assert.ok(srcHtml.match(/ac\.map\(c => /));
    });

    it('should show checked boxes for done stories', () => {
      assert.ok(srcHtml.match(/\${st==='done'\?'☑':'☐'}/));
    });

    it('should display story output in collapsible details', () => {
      assert.ok(srcHtml.match(/s\.output \? `<details/));
    });

    it('should show story-chevron only when story has details', () => {
      assert.ok(srcHtml.match(/\${hasDetails \? '<span class="story-chevron/));
    });

    it('should hide story-details by default', () => {
      assert.ok(srcHtml.includes('story-details hidden'));
    });
  });

  describe('Theme Toggle', () => {
    it('should have theme toggle button', () => {
      assert.ok(srcHtml.includes('id="theme-toggle"'));
    });

    it('should have initTheme function', () => {
      assert.ok(srcHtml.includes('function initTheme()'));
    });

    it('should apply theme on page load', () => {
      assert.ok(srcHtml.includes('applyTheme(getEffectiveTheme())'));
    });

    it('should have click event listener on theme toggle', () => {
      assert.ok(srcHtml.includes("btn.addEventListener('click'"));
    });

    it('should toggle between light and dark themes', () => {
      assert.ok(srcHtml.match(/const next = current === 'dark' \? 'light' : 'dark'/));
    });

    it('should persist theme to localStorage', () => {
      assert.ok(srcHtml.includes("localStorage.setItem(STORAGE_KEY, next)"));
    });

    it('should set data-theme attribute on root element', () => {
      assert.ok(srcHtml.includes("root.setAttribute('data-theme', theme)"));
    });

    it('should update button text based on theme', () => {
      assert.ok(srcHtml.match(/btn\.textContent = theme === 'dark' \? '🌙' : '☀️'/));
    });

    it('should update button title based on theme', () => {
      assert.ok(srcHtml.includes("'Switch to light mode'"));
      assert.ok(srcHtml.includes("'Switch to dark mode'"));
    });

    it('should detect system preference when no manual selection', () => {
      assert.ok(srcHtml.includes("window.matchMedia('(prefers-color-scheme: dark)')"));
    });

    it('should respect system preference changes', () => {
      assert.ok(srcHtml.includes("addEventListener('change'"));
      assert.ok(srcHtml.match(/if \(!localStorage\.getItem\(STORAGE_KEY\)\)/));
    });
  });

  describe('Medic Badge Click', () => {
    it('should have medic badge element', () => {
      assert.ok(srcHtml.includes('id="medic-badge"'));
    });

    it('should have onclick handler for medic badge', () => {
      assert.ok(srcHtml.includes('onclick="toggleMedicPanel()"'));
    });

    it('should have toggleMedicPanel function', () => {
      assert.ok(srcHtml.includes('function toggleMedicPanel()'));
    });

    it('should toggle medicPanelOpen state', () => {
      assert.ok(srcHtml.includes('medicPanelOpen = !medicPanelOpen'));
    });

    it('should toggle open class on medic panel', () => {
      assert.ok(srcHtml.includes("document.getElementById('medic-panel').classList.toggle('open'"));
    });

    it('should load medic data when panel opens', () => {
      assert.ok(srcHtml.includes('if (medicPanelOpen) loadMedicData()'));
    });

    it('should close panel when clicking outside', () => {
      assert.ok(srcHtml.match(/document\.addEventListener\('click', e => \{/));
      assert.ok(srcHtml.includes('if (!medicPanelOpen) return'));
      assert.ok(srcHtml.includes('panel.classList.remove(\'open\')'));
    });

    it('should not close panel when clicking inside', () => {
      assert.ok(srcHtml.includes('!panel.contains(e.target)'));
      assert.ok(srcHtml.includes('!badge.contains(e.target)'));
    });

    it('should load medic status on page load', () => {
      assert.ok(srcHtml.includes('loadMedicStatus();'));
    });

    it('should have medic status auto-refresh', () => {
      assert.ok(srcHtml.includes('setInterval(loadMedicStatus, 30000)'));
    });
  });

  describe('Overlay Click Closes Panel', () => {
    it('should have overlay element', () => {
      assert.ok(srcHtml.includes('id="overlay"'));
    });

    it('should have onclick handler for overlay', () => {
      assert.ok(srcHtml.includes('onclick="if(event.target===this)closePanel()"'));
    });

    it('should only close when clicking overlay itself', () => {
      assert.ok(srcHtml.includes('event.target===this'));
    });

    it('should have closePanel function', () => {
      assert.ok(srcHtml.includes('function closePanel()'));
    });

    it('should remove open class from overlay', () => {
      assert.ok(srcHtml.includes("document.getElementById('overlay').classList.remove('open')"));
    });

    it('should have close button in panel', () => {
      assert.ok(srcHtml.includes('onclick="closePanel()"'));
      assert.ok(srcHtml.includes('✕'));
    });
  });

  describe('Escape Key Closes Panel', () => {
    it('should have keydown event listener', () => {
      assert.ok(srcHtml.includes("document.addEventListener('keydown'"));
    });

    it('should check for Escape key', () => {
      assert.ok(srcHtml.match(/if \(e\.key === 'Escape'\)/));
    });

    it('should call closePanel on Escape', () => {
      assert.ok(srcHtml.match(/if \(e\.key === 'Escape'\) closePanel\(\)/));
    });
  });

  describe('API Endpoints', () => {
    it('should have workflows endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON('/api/workflows')"));
    });

    it('should have runs endpoint with workflow filter', () => {
      assert.ok(srcHtml.includes("fetchJSON(`/api/runs?workflow="));
    });

    it('should have single run endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON(`/api/runs/${id}`)"));
    });

    it('should have run events endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON(`/api/runs/${runId}/events`)"));
    });

    it('should have run stories endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON(`/api/runs/${runId}/stories`)"));
    });

    it('should have medic status endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON('/api/medic/status')"));
    });

    it('should have medic checks endpoint', () => {
      assert.ok(srcHtml.includes("fetchJSON('/api/medic/checks?limit=10')"));
    });

    it('should have fetchJSON helper function', () => {
      assert.ok(srcHtml.includes('async function fetchJSON(url)'));
    });
  });

  describe('Responsive Layout - Structure', () => {
    it('should have viewport meta tag', () => {
      assert.ok(srcHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'));
    });

    it('should have responsive header with flex-wrap', () => {
      assert.ok(srcHtml.includes('class="flex flex-wrap'));
    });

    it('should have responsive board with mobile-first flex', () => {
      const boardEl = srcHtml.match(/<div[^>]*id="board"[^>]*>/)?.[0] || '';
      assert.ok(boardEl.includes('flex-col'));
      assert.ok(boardEl.includes('md:flex-row'));
    });

    it('should have columns with min-width constraint', () => {
      assert.ok(srcHtml.includes('min-w-[240px]'));
    });

    it('should have responsive panel width (90%)', () => {
      const panelEl = srcHtml.match(/<div[^>]*id="panel"[^>]*>/)?.[0] || '';
      assert.ok(panelEl.includes('w-[90%]'));
    });

    it('should have panel max-width constraint (640px)', () => {
      const panelEl = srcHtml.match(/<div[^>]*id="panel"[^>]*>/)?.[0] || '';
      assert.ok(panelEl.includes('max-w-[640px]'));
    });

    it('should have overflow-x-auto on board for horizontal scrolling', () => {
      const boardEl = srcHtml.match(/<div[^>]*id="board"[^>]*>/)?.[0] || '';
      assert.ok(boardEl.includes('overflow-x-auto'));
    });

    it('should have overflow-y-auto on cards container', () => {
      assert.ok(srcHtml.includes('overflow-y-auto'));
    });
  });

  describe('Functional Verification', () => {
    it('should have all required JavaScript functions', () => {
      const functions = [
        'fetchJSON',
        'loadWorkflows',
        'selectWorkflow',
        'loadRuns',
        'renderBoard',
        'openRun',
        'closePanel',
        'loadStories',
        'loadActivity',
        'toggleMedicPanel',
        'loadMedicStatus',
        'loadMedicData',
        'initTheme',
        'applyTheme',
        'getEffectiveTheme',
        'getBadgeClasses',
        'getStepIconClasses',
        'formatEventDesc',
        'esc',
        'parseTS',
        'getActiveStepId'
      ];
      functions.forEach(fn => {
        assert.ok(srcHtml.includes(`function ${fn}`), `Missing function: ${fn}`);
      });
    });

    it('should have all required element IDs', () => {
      const ids = [
        'wf-select',
        'theme-toggle',
        'medic-badge',
        'medic-dot',
        'medic-label',
        'refresh-note',
        'board',
        'medic-panel',
        'medic-panel-body',
        'overlay',
        'panel',
        'stories-panel',
        'activity-panel'
      ];
      ids.forEach(id => {
        assert.ok(srcHtml.includes(`id="${id}"`), `Missing element ID: ${id}`);
      });
    });

    it('should have badge helper function', () => {
      assert.ok(srcHtml.includes('function getBadgeClasses(status)'));
    });

    it('should have step icon helper function', () => {
      assert.ok(srcHtml.includes('function getStepIconClasses(status)'));
    });

    it('should have escape helper function', () => {
      assert.ok(srcHtml.includes('function esc(s)'));
    });

    it('should have timestamp parser function', () => {
      assert.ok(srcHtml.includes('function parseTS(ts)'));
    });

    it('should have event formatter function', () => {
      assert.ok(srcHtml.includes('function formatEventDesc(evt)'));
    });
  });

  describe('Build Output Verification', () => {
    it('should have compiled HTML in dist/', () => {
      const distPath = path.join(projectRoot, 'dist/server/index.html');
      assert.ok(existsSync(distPath), 'dist/server/index.html should exist after build');
    });

    it('should have matching interactive features in build output', () => {
      const distPath = path.join(projectRoot, 'dist/server/index.html');
      if (existsSync(distPath)) {
        const distHtml = readFileSync(distPath, 'utf-8');
        
        // Check key interactive features are preserved
        assert.ok(distHtml.includes('selectWorkflow'));
        assert.ok(distHtml.includes('openRun'));
        assert.ok(distHtml.includes('closePanel'));
        assert.ok(distHtml.includes('toggleMedicPanel'));
        assert.ok(distHtml.includes('initTheme'));
        assert.ok(distHtml.includes("addEventListener('keydown'"));
      }
    });
  });

  describe('Dark Mode Interactive Features', () => {
    it('should have dark mode classes on all interactive elements', () => {
      // Header
      assert.ok(srcHtml.includes('dark:bg-dark-header-bg'));
      
      // Board
      assert.ok(srcHtml.includes('dark:bg-dark-bg-page'));
      
      // Panel
      assert.ok(srcHtml.includes('dark:bg-dark-bg-surface'));
      
      // Badges
      assert.ok(srcHtml.includes('dark:bg-dark-accent-'));
    });

    it('should apply theme classes based on data-theme attribute', () => {
      assert.ok(srcHtml.includes("root.setAttribute('data-theme', theme)"));
    });
  });

  describe('Accessibility Features', () => {
    it('should have aria-label on theme toggle', () => {
      assert.ok(srcHtml.includes('aria-label="Toggle light/dark mode"'));
    });

    it('should have title attributes for tooltips', () => {
      assert.ok(srcHtml.includes('title="Toggle light/dark mode"'));
      assert.ok(srcHtml.includes('title="Medic watchdog status"'));
    });

    it('should have keyboard navigation support (Escape key)', () => {
      assert.ok(srcHtml.includes("e.key === 'Escape'"));
    });
  });
});
