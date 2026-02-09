# Security

Antfarm workflows run AI agents on your machine. That's powerful — and it means security matters.

## How we keep things safe

### Curated repository only

Antfarm only installs workflows from this official repository (`snarktank/antfarm`). There is no mechanism to install workflows from arbitrary URLs, third-party repos, or remote sources. If it's not in this repo, it doesn't run.

### Every workflow is reviewed

All workflow submissions — including community PRs — go through security review before merging. We specifically check for:

- **Prompt injection** — instructions designed to hijack agent behavior, override safety boundaries, or exfiltrate data
- **Malicious skill files** — SKILL.md, AGENTS.md, or other workspace files that could trick agents into running harmful commands
- **Privilege escalation** — workflows that attempt to access resources beyond their intended scope
- **Data exfiltration** — any attempt to send private data to external services

### Transparent by design

Every workflow is plain YAML and Markdown. No compiled code, no obfuscated logic. You can read exactly what each agent will do before you install it.

### Agent isolation

Each agent runs in its own isolated OpenClaw session with a dedicated workspace. Agents only have access to the tools and files defined in their workflow configuration.

## Contributing workflows

We actively encourage community contributions. To submit a new workflow:

1. Fork this repo
2. Create your workflow in `workflows/`
3. Submit a PR with a clear description of what it does
4. All PRs go through security review before merging

See [docs/creating-workflows.md](docs/creating-workflows.md) for the full guide.

## Reporting vulnerabilities

If you find a security issue in Antfarm, please report it responsibly:

- **Email:** security@ryancarson.com
- **Do not** open a public issue for security vulnerabilities

We'll acknowledge receipt within 48 hours and work with you on a fix.
