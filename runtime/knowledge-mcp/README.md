# Knowledge MCP

Read-only, user-JWT-scoped MCP client for `knowledge-mcp-read`. It shares the
existing `~/.cash-mcp` bound user session and never stores an additional token.

Deployment gate (not executed by this implementation):

```bash
npx --yes supabase@latest functions deploy knowledge-mcp-read --project-ref ldijllskwwmyhhbzspmb
```

Only after standalone production proof passes may this command be registered
with OpenJarvis:

```bash
PYTHONPATH=runtime/knowledge-mcp:runtime/cash-mcp python -m knowledge_mcp_main
```