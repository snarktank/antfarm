import figma, { html } from "@figma/code-connect/html";

/**
 * Code Connect definition for the FeatureCard (wf-card) landing page component.
 * Links the Figma FeatureCard component to its HTML implementation.
 *
 * Props:
 *   title       — workflow name, e.g. "feature-dev"
 *   badge       — agent count label, e.g. "6 agents"
 *   description — short description paragraph
 *   pipeline    — pipeline steps as a space-separated string, rendered inside .wf-pipeline
 */
figma.connect(
  "https://www.figma.com/design/antfarm-landing/Landing?node-id=1-2",
  {
    props: {
      title: figma.string("Title"),
      badge: figma.string("Badge"),
      description: figma.string("Description"),
      pipeline: figma.string("Pipeline"),
    },
    example: ({ title, badge, description, pipeline }) => html`
      <div class="wf-card">
        <div class="wf-header">
          <h3>${title}</h3>
          <span class="wf-badge">${badge}</span>
        </div>
        <p>${description}</p>
        <div class="wf-pipeline">${pipeline}</div>
      </div>
    `,
  }
);
