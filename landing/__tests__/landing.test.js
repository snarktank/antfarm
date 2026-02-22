import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingDir = resolve(__dirname, '..');
const componentsDir = resolve(landingDir, 'components');

describe('Landing page', () => {
  it('index.html exists', () => {
    assert.ok(existsSync(resolve(landingDir, 'index.html')));
  });

  it('style.css exists', () => {
    assert.ok(existsSync(resolve(landingDir, 'style.css')));
  });

  it('index.html contains required sections', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    assert.ok(html.includes('id="workflows"'), 'missing workflows section');
    assert.ok(html.includes('id="commands"'), 'missing commands section');
    assert.ok(html.includes('<title>'), 'missing title');
    assert.ok(html.includes('meta name="viewport"'), 'missing viewport meta');
    assert.ok(html.includes('meta name="description"'), 'missing description meta');
  });

  it('index.html references style.css', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    assert.ok(html.includes('style.css'));
  });

  it('style.css contains essential rules', () => {
    const css = readFileSync(resolve(landingDir, 'style.css'), 'utf-8');
    assert.ok(css.includes('.hero'), 'missing hero styles');
    assert.ok(css.includes('.workflow-grid'), 'missing workflow grid');
    assert.ok(css.includes('@media'), 'missing responsive styles');
  });

  it('version badge element exists and contains a valid semver', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    assert.ok(html.includes('class="version-badge"'), 'missing version-badge element');
    const match = html.match(/class="version-badge"[^>]*>v?(\d+\.\d+\.\d+[^<]*)/);
    assert.ok(match, 'version-badge does not contain a semver string');
    assert.match(match[1], /^\d+\.\d+\.\d+/, 'version is not valid semver');
  });

  it('all internal links have valid targets', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
    for (const id of anchors) {
      assert.ok(html.includes(`id="${id}"`), `missing target for #${id}`);
    }
  });
});

describe('Landing page component files', () => {
  const components = [
    'hero-section.html',
    'feature-card.html',
    'install-block.html',
    'sample-cta.html',
  ];

  for (const file of components) {
    it(`components/${file} exists`, () => {
      assert.ok(
        existsSync(resolve(componentsDir, file)),
        `${file} should exist in landing/components/`
      );
    });
  }

  it('hero-section.html contains hero section markup', () => {
    const html = readFileSync(resolve(componentsDir, 'hero-section.html'), 'utf-8');
    assert.ok(html.includes('class="hero"'), 'should contain hero section');
    assert.ok(html.includes('hero-row'), 'should contain hero-row');
    assert.ok(html.includes('hero-sub'), 'should contain hero-sub');
  });

  it('feature-card.html contains wf-card markup', () => {
    const html = readFileSync(resolve(componentsDir, 'feature-card.html'), 'utf-8');
    assert.ok(html.includes('wf-card'), 'should contain wf-card');
    assert.ok(html.includes('wf-header'), 'should contain wf-header');
    assert.ok(html.includes('wf-pipeline'), 'should contain wf-pipeline');
  });

  it('install-block.html contains install-block markup', () => {
    const html = readFileSync(resolve(componentsDir, 'install-block.html'), 'utf-8');
    assert.ok(html.includes('install-block'), 'should contain install-block');
    assert.ok(html.includes('install-cmd'), 'should contain install-cmd');
    assert.ok(html.includes('copy-btn'), 'should contain copy-btn');
    assert.ok(html.includes('version-badge'), 'should contain version-badge');
  });

  it('sample-cta.html contains CTA markup with id=sample-cta', () => {
    const html = readFileSync(resolve(componentsDir, 'sample-cta.html'), 'utf-8');
    assert.ok(html.includes('id="sample-cta"'), 'should have id=sample-cta');
    assert.ok(html.includes('cta-headline'), 'should contain cta-headline');
    assert.ok(html.includes('cta-sub'), 'should contain cta-sub');
    assert.ok(html.includes('cta-btn'), 'should contain cta-btn');
    assert.ok(html.includes('github.com'), 'cta-btn should link to GitHub');
  });
});

describe('Landing page SampleCTA integration', () => {
  it('index.html contains #sample-cta section', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    assert.ok(html.includes('id="sample-cta"'), 'index.html should include #sample-cta');
  });

  it('#sample-cta appears before the footer in index.html', () => {
    const html = readFileSync(resolve(landingDir, 'index.html'), 'utf-8');
    const ctaIdx = html.indexOf('id="sample-cta"');
    const footerIdx = html.indexOf('<footer');
    assert.ok(ctaIdx !== -1, '#sample-cta should exist');
    assert.ok(footerIdx !== -1, '<footer should exist');
    assert.ok(ctaIdx < footerIdx, '#sample-cta should appear before <footer');
  });

  it('style.css contains .cta-section styles', () => {
    const css = readFileSync(resolve(landingDir, 'style.css'), 'utf-8');
    assert.ok(css.includes('.cta-section'), 'style.css should have .cta-section');
  });

  it('style.css contains .cta-btn styles', () => {
    const css = readFileSync(resolve(landingDir, 'style.css'), 'utf-8');
    assert.ok(css.includes('.cta-btn'), 'style.css should have .cta-btn');
  });

  it('style.css CTA styles use design tokens', () => {
    const css = readFileSync(resolve(landingDir, 'style.css'), 'utf-8');
    // Find the cta-section block and verify it uses CSS variables
    const ctaStart = css.indexOf('.cta-section');
    assert.ok(ctaStart !== -1, '.cta-section must exist');
    const ctaBlock = css.slice(ctaStart, ctaStart + 300);
    assert.ok(ctaBlock.includes('var(--'), '.cta-section should use CSS custom properties');
  });

  it('style.css has responsive styles for CTA at max-width: 600px', () => {
    const css = readFileSync(resolve(landingDir, 'style.css'), 'utf-8');
    const mediaIdx = css.indexOf('@media (max-width: 600px)');
    assert.ok(mediaIdx !== -1, 'should have @media (max-width: 600px) block');
    const afterMedia = css.slice(mediaIdx);
    assert.ok(afterMedia.includes('.cta-'), 'responsive block should include .cta- overrides');
  });
});

describe('Landing page Figma Code Connect files', () => {
  const figmaFiles = [
    'hero-section.figma.ts',
    'feature-card.figma.ts',
    'install-block.figma.ts',
    'sample-cta.figma.ts',
  ];

  for (const file of figmaFiles) {
    it(`components/${file} exists`, () => {
      assert.ok(
        existsSync(resolve(componentsDir, file)),
        `${file} should exist in landing/components/`
      );
    });

    it(`components/${file} imports from @figma/code-connect/html`, () => {
      const ts = readFileSync(resolve(componentsDir, file), 'utf-8');
      assert.ok(
        ts.includes('@figma/code-connect/html'),
        `${file} should import from @figma/code-connect/html`
      );
    });

    it(`components/${file} calls figma.connect()`, () => {
      const ts = readFileSync(resolve(componentsDir, file), 'utf-8');
      assert.ok(ts.includes('figma.connect('), `${file} should call figma.connect()`);
    });
  }
});
