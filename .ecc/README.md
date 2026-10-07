# ECC core skills

This repository includes eight Codex-ready skills from [affaan-m/ECC](https://github.com/affaan-m/ECC), pinned to commit `ef648e01899ba3e8dc6371642deaaf64b4477775`. The upstream files are unchanged and carry the MIT license in LICENSE.

## Use

Codex versions supporting repository-local skills can discover `.agents/skills/`. Ask for a skill explicitly (for example, `$security-review` or `$verification-loop`), or let the tool select it when relevant. Other agents can follow the root AGENTS.md and read the matching SKILL.md manually.

Only load skills relevant to the current task. This is a selected, repository-local integration, not a full ECC plugin installation. No hooks, MCP servers, external upload service, global settings, or automated memory runtime are installed. Skill files guide an agent; they are not CI enforcement.

## Compatibility

Repository-specific instructions and higher-priority user/platform instructions take precedence over generic upstream examples. Detect the project's actual package manager and scripts from its manifests and lockfiles. The upstream TDD skill mentions `scripts/setup-package-manager.js`; that upstream utility is not part of this selected bundle, so inspect package.json and lockfiles directly instead. Optional upstream skills and slash commands are not installed by this bundle.

Use existing project test gates and risk-appropriate validation; upstream coverage examples do not establish a new repository-wide threshold. For a static HTML repository, use browser/HTML checks rather than inventing npm scripts. Do not copy security or framework examples into production without checking current APIs and the application's threat model.

## Maintenance

manifest.json records exact source paths and Git blob hashes. Review an explicit upstream commit before updating. Preserve existing AGENTS.md text and local changes. Do not layer the full ECC plugin over these same skills without first planning deduplication.

To remove this integration, remove only files tracked by manifest.json, this .ecc directory, and the ECC:BEGIN/ECC:END block in AGENTS.md; retain all unrelated instructions and files.
