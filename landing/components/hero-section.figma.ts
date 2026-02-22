import figma, { html } from "@figma/code-connect/html";

/**
 * Code Connect definition for the HeroSection landing page component.
 * Links the Figma HeroSection component to its HTML implementation.
 *
 * To publish: npm run figma:publish
 * To parse:   npm run figma:parse
 */
figma.connect(
  "https://www.figma.com/design/antfarm-landing/Landing?node-id=1-1",
  {
    props: {
      title: figma.string("Title"),
      subtitle: figma.string("Subtitle"),
    },
    example: ({ title, subtitle }) => html`
      <section class="hero">
        <div class="hero-row">
          <img src="logo.jpeg" alt="Antfarm" class="hero-logo" />
          <h1>${title}</h1>
        </div>
        <p class="hero-sub">${subtitle}</p>
      </section>
    `,
  }
);
