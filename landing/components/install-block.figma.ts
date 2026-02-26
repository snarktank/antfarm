import figma, { html } from "@figma/code-connect/html";

/**
 * Code Connect definition for the InstallBlock landing page component.
 * Links the Figma InstallBlock component to its HTML implementation.
 *
 * Props:
 *   command — the shell command to display and copy, e.g. "curl -fsSL ... | bash"
 *   version — the version badge label, e.g. "v0.5.1"
 *
 * To publish: npm run figma:publish
 * To parse:   npm run figma:parse
 */
figma.connect(
  "https://www.figma.com/design/antfarm-landing/Landing?node-id=1-3",
  {
    props: {
      command: figma.string("Command"),
      version: figma.string("Version"),
    },
    example: ({ command, version }) => html`
      <div class="install-block">
        <div class="install-row">
          <div class="install-cmd">
            <code><span class="cmd-prompt">$</span> ${command}</code>
          </div>
          <button
            class="copy-btn"
            title="Copy to clipboard"
          >Copy</button>
          <span class="version-badge">${version}</span>
        </div>
        <p class="install-hint">Paste in your terminal, or just ask your OpenClaw to run it.</p>
      </div>
    `,
  }
);
