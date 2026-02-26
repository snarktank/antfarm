import figma, { html } from "@figma/code-connect/html";

/**
 * Code Connect definition for the SampleCTA landing page component.
 * Links the Figma SampleCTA component to its HTML implementation.
 *
 * Props:
 *   headline — primary CTA heading text
 *   subtext  — supporting description paragraph
 *   ctaLabel — button/link label text, e.g. "Get started on GitHub"
 *   ctaHref  — button/link destination URL
 *
 * To publish: npm run figma:publish
 * To parse:   npm run figma:parse
 */
figma.connect(
  "https://www.figma.com/design/antfarm-landing/Landing?node-id=1-4",
  {
    props: {
      headline: figma.string("Headline"),
      subtext: figma.string("Subtext"),
      ctaLabel: figma.string("CTA Label"),
      ctaHref: figma.string("CTA Href"),
    },
    example: ({ headline, subtext, ctaLabel, ctaHref }) => html`
      <section class="cta-section" id="sample-cta">
        <h2 class="cta-headline">${headline}</h2>
        <p class="cta-sub">${subtext}</p>
        <a class="cta-btn" href="${ctaHref}" target="_blank" rel="noopener">
          ${ctaLabel}
        </a>
      </section>
    `,
  }
);
