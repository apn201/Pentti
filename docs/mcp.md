# Pentti as an MCP server

Pentti exposes three read-only tools through Atlassian's MCP gateway (Forge module `rovo:mcp`, in Preview):

| Tool | What it returns |
|---|---|
| `find-asset` | Up to five machines that match a hostname, nickname, IP, old IP, former name or model. Never one guess. |
| `explain-asset` | What is known and not known about one machine, where Pentti looked, the sources, and the knowledge, risk and danger scores. |
| `gap-report` | The closing list for a plant or the whole factory: assets, hours per step, total hours, percent of danger removed. |

Writes (`create-gap-tasks`) and the rest of the actions stay inside Rovo. The tools run with the permissions of the user who signs in.

## Endpoint

```
https://mcp.atlassian.com/forge/d2fcbee5-3e1f-41db-8db4-e4360bef4b93
```

Streamable HTTP. Clients sign in with OAuth 2.1, discovery starts at the `WWW-Authenticate` header of a 401.

## Admin: switch it on (once per site)

External MCP access is off by default.

1. Open admin.atlassian.com and pick the organization.
2. Apps, Sites, pick the site, Connected apps.
3. Open Pentti, then Details, then the TOOLS section.
4. "Expose tools to MCP-compatible apps": Enable tools. During Preview this turns on all three tools at once.

Only sites where this is on appear on the consent screen.

Preview bug: if Pentti is connected to Confluence at the moment tools are enabled, clients connect but see no tools.
Fix: disconnect Confluence from Pentti, Disable tools, Enable tools, connect Confluence again. Or enable tools
before connecting Confluence on a fresh install.

## User: connect a client

1. Add the endpoint above as a remote MCP server (Streamable HTTP) in the client.
2. The client opens Atlassian's consent screen. Pick the site, review the scopes and tools, approve.
3. List tools. The three above appear, with the environment as a suffix in development (`find-asset_development`). Call `find-asset` with `{"query": "Old Faithful"}`.

Tested with Claude as the client: Settings, Connectors, Add custom connector, paste the endpoint, Connect, approve on Atlassian's consent screen.

## Limits

- Preview: the module and third-party client access may change with short notice.
- Tool definitions come from the manifest. Changing a tool needs a new app version.
- The data is the demo dataset of a fictional company. Run "Load the factory" first for Jira and Confluence links in the answers.
