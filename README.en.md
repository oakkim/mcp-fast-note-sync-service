# mcp-fast-note-sync-service

MCP server that exposes the `fast-note-sync-service` REST API as MCP tools.

- Transport: `stdio` (default), `streamable-http`, `sse` (legacy)
- Target server: `fast-note-sync-service` running in Docker (or reachable over network)
- Vault policy: allow specific vaults or all vaults (`*`)

## 1) Run Locally

```bash
cd mcp-fast-note-sync-service
npm install
npm run build
FNS_BASE_URL=http://localhost:9000 FNS_TOKEN=your_token npm start
```

## 2) Build/Run with Docker

```bash
cd mcp-fast-note-sync-service
docker build -t mcp-fast-note-sync-service:latest .
```

Example run (when `fast-note-sync-service` is reachable on the same Docker network):

```bash
docker run --rm -i \
  --network your_network \
  -e FNS_BASE_URL=http://fast-note-sync-service:9000 \
  -e FNS_TOKEN=your_token \
  -e FNS_ALLOWED_VAULTS="*" \
  -e FNS_DEFAULT_VAULT="" \
  mcp-fast-note-sync-service:latest
```

Optional manual multi-arch push to Docker Hub:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t <dockerhub-user>/mcp-fast-note-sync-service:v0.1.0 \
  -t <dockerhub-user>/mcp-fast-note-sync-service:latest \
  --push .
```

Run as a remote MCP endpoint (streamable-http example):

```bash
docker run --rm \
  -p 3000:3000 \
  -e MCP_TRANSPORT=streamable-http \
  -e MCP_HTTP_HOST=0.0.0.0 \
  -e MCP_HTTP_PORT=3000 \
  -e MCP_HTTP_BASE_PATH=/your-mcp-path \
  -e FNS_BASE_URL=http://fast-note-sync-service:9000 \
  -e FNS_TOKEN=your_token \
  -e FNS_ALLOWED_VAULTS="*" \
  kimneutral/mcp-fast-note-sync-service:v0.1.1
```

## 3) GitHub Release + Docker Hub Auto Deployment

`.github/workflows/release.yml` runs automatically when you push a `v*` tag.

- `npm ci && npm run check`
- Multi-arch Docker image build/push (`linux/amd64`, `linux/arm64`)
- GitHub Release creation (auto-generated release notes)

Required GitHub settings:

- Repository Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- Repository Variable (optional): `DOCKERHUB_IMAGE_NAME` (default: `mcp-fast-note-sync-service`)

Release flow:

```bash
# Example: patch release
npm version patch
git push origin main
git push origin --tags
```

Or create/push a tag manually:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## Testing / Lint / Format

```bash
npm run test        # watch mode
npm run test:run    # one-shot
npm run lint        # biome check
npm run format      # biome check --write
npm run check       # typecheck + lint + test:run
```

## 4) MCP Client Configuration Examples

Using Docker directly as `command`:

### A. Use Docker Hub release image (recommended)

Use fixed tags (`vX.Y.Z`) rather than `latest` for reproducibility.

```json
{
  "mcpServers": {
    "fast-note-sync": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--pull", "always",
        "--network", "your_network",
        "-e", "FNS_BASE_URL=http://fast-note-sync-service:9000",
        "-e", "FNS_TOKEN=your_token",
        "-e", "FNS_ALLOWED_VAULTS=*",
        "kimneutral/mcp-fast-note-sync-service:v0.1.1"
      ]
    }
  }
}
```

If `fast-note-sync-service` runs directly on host OS, set `FNS_BASE_URL` to `http://host.docker.internal:9000`.

### B. Use a locally built image

If you build the image yourself, only replace the image name/tag:

```json
{
  "mcpServers": {
    "fast-note-sync": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--network", "your_network",
        "-e", "FNS_BASE_URL=http://fast-note-sync-service:9000",
        "-e", "FNS_TOKEN=your_token",
        "-e", "FNS_ALLOWED_VAULTS=*",
        "mcp-fast-note-sync-service:latest"
      ]
    }
  }
}
```

### C. Use a remote MCP server URL (SSE/HTTP)

For clients that support URL-based MCP connections:

```json
{
  "mcpServers": {
    "fast-note-sync-remote": {
      "url": "https://your-domain.example.com/your-mcp-path"
    }
  }
}
```

Server modes:

- `MCP_TRANSPORT=streamable-http` (recommended): single endpoint at `<basePath>` (`GET`/`POST`/`DELETE`)
- `MCP_TRANSPORT=sse` (legacy): `GET <basePath>` + `POST <basePath>/messages?sessionId=...`

Token delivery:

- In HTTP/SSE modes, you can pass the user token via `Authorization: Bearer <FNS_TOKEN>` on MCP requests.
- With this header, you can use user-auth tools without calling `fns_auth_set_token`.

## 5) Environment Variables

- `FNS_BASE_URL` (default: `http://fast-note-sync-service:9000`)
- `FNS_TOKEN` user token (recommended)
- `FNS_CREDENTIALS` / `FNS_PASSWORD` (auto-login when `FNS_TOKEN` is not set)
- `FNS_SHARE_TOKEN` share API token
- `FNS_ALLOWED_VAULTS` allowed vault list (`*` or `vault1,vault2`)
- `FNS_DEFAULT_VAULT` default vault
- `FNS_ACTIVE_VAULT` initial active vault
- `FNS_ENABLE_ADMIN_TOOLS` (`true/false`, default `false`)
- `FNS_PRETTY_DEFAULT` (`true/false`, default `false`)
- `MCP_TRANSPORT` (`stdio` | `streamable-http` | `sse`, default `stdio`)
- `MCP_HTTP_HOST` host for HTTP/SSE mode (default `0.0.0.0`)
- `MCP_HTTP_PORT` port for HTTP/SSE mode (default `3000`)
- `MCP_HTTP_BASE_PATH` base path for HTTP/SSE mode (configurable)

## 6) Vault Selection Behavior

- Set active vault via `fns_vault_set_active`
- For tools requiring `vault`, if omitted: `active -> default`
- `FNS_ALLOWED_VAULTS` restrictions are always enforced

## 7) Tool List

### Runtime/Helper

- `fns_server_config`
- `fns_auth_set_token`
- `fns_auth_clear_token`
- `fns_vault_list`
- `fns_vault_get_active`
- `fns_vault_set_active`
- `fns_api_request` (raw passthrough)

### Public/Auth/Vault

- `fns_health`, `fns_version`, `fns_support`, `fns_webgui_config`
- `fns_user_register`, `fns_user_login`, `fns_user_info`, `fns_user_change_password`
- `fns_vault_upsert`, `fns_vault_delete`

### Note/History

- `fns_note_list`, `fns_note_get`, `fns_note_upsert`, `fns_note_delete`, `fns_note_restore`, `fns_note_recycle_clear`
- `fns_note_patch_frontmatter`, `fns_note_append`, `fns_note_prepend`, `fns_note_replace`, `fns_note_move`
- `fns_note_backlinks`, `fns_note_outlinks`
- `fns_note_history_list`, `fns_note_history_get`, `fns_note_history_restore`

### Folder/File

- `fns_folder_get`, `fns_folder_list`, `fns_folder_create`, `fns_folder_delete`, `fns_folder_tree`, `fns_folder_notes`, `fns_folder_files`
- `fns_file_read_content`, `fns_file_info`, `fns_file_list`, `fns_file_delete`, `fns_file_restore`, `fns_file_recycle_clear`

### Storage/Backup/Git Sync

- `fns_storage_list`, `fns_storage_upsert`, `fns_storage_enabled_types`, `fns_storage_validate`, `fns_storage_delete`
- `fns_backup_get_configs`, `fns_backup_update_config`, `fns_backup_delete_config`, `fns_backup_list_histories`, `fns_backup_execute`
- `fns_git_sync_get_configs`, `fns_git_sync_update_config`, `fns_git_sync_delete_config`, `fns_git_sync_validate`, `fns_git_sync_clean_workspace`, `fns_git_sync_execute`, `fns_git_sync_list_histories`

### Share/Admin

- `fns_share_create`, `fns_share_get_note`, `fns_share_get_file`
- `fns_admin_*` (exposed only when `FNS_ENABLE_ADMIN_TOOLS=true`)

## 8) Current Mapping Limitation

- `file move/rename` is not mapped yet because there is currently no public REST route for it.
  - The operation exists in service/WS, but not exposed via REST endpoint.
