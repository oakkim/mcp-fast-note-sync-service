# mcp-fast-note-sync-service

`fast-note-sync-service` REST API를 MCP 툴로 노출하는 서버입니다.

- English: [README.en.md](./README.en.md)

- Transport: `stdio`(기본), `streamable-http`, `sse`(legacy)
- 대상 서버: Docker로 실행 중인 `fast-note-sync-service`
- Vault 정책: 특정 vault만 허용 또는 전체(`*`) 허용

## 1) 로컬 실행

```bash
cd mcp-fast-note-sync-service
npm install
npm run build
FNS_BASE_URL=http://localhost:9000 FNS_TOKEN=your_token npm start
```

## 2) Docker 빌드/실행

```bash
cd mcp-fast-note-sync-service
docker build -t mcp-fast-note-sync-service:latest .
```

예시 실행(같은 Docker 네트워크에서 fast-note-sync-service 접근):

```bash
docker run --rm -i \
  --network your_network \
  -e FNS_BASE_URL=http://fast-note-sync-service:9000 \
  -e FNS_TOKEN=your_token \
  -e FNS_ALLOWED_VAULTS="*" \
  -e FNS_DEFAULT_VAULT="" \
  mcp-fast-note-sync-service:latest
```

Docker Hub 멀티아키 수동 푸시(선택):

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t <dockerhub-user>/mcp-fast-note-sync-service:v0.1.0 \
  -t <dockerhub-user>/mcp-fast-note-sync-service:latest \
  --push .
```

원격 MCP 엔드포인트로 띄우기(streamable-http 예시):

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
  kimneutral/mcp-fast-note-sync-service:v0.1.4
```

## 3) GitHub Release + Docker Hub 자동 배포

`.github/workflows/release.yml`이 `v*` 태그 푸시 시 아래를 자동 수행합니다.

- `npm ci && npm run check`
- Docker 멀티아키 이미지(`linux/amd64`, `linux/arm64`) 빌드/푸시
- GitHub Release 생성(자동 릴리즈 노트)

필수 GitHub 설정:

- Repository Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- Repository Variables(선택): `DOCKERHUB_IMAGE_NAME` (기본값: `mcp-fast-note-sync-service`)

릴리즈 방법:

```bash
# 예: patch 버전 릴리즈
npm version patch
git push origin main
git push origin --tags
```

또는 태그를 수동으로 만들 수도 있습니다.

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

## 4) MCP 클라이언트 설정 예시

`command`로 Docker를 직접 실행하는 방식:

### A. Docker Hub 릴리즈 이미지 사용(권장)

최신 배포본을 바로 연동할 때 사용합니다. `latest`보다 `vX.Y.Z` 고정 태그를 권장합니다.

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
        "kimneutral/mcp-fast-note-sync-service:v0.1.4",
        "--vault=Team"
      ]
    }
  }
}
```

`fast-note-sync-service`가 호스트에서 직접 실행 중이면 `FNS_BASE_URL`을 `http://host.docker.internal:9000`으로 지정하면 됩니다.

### B. 로컬 빌드 이미지 사용

직접 빌드한 이미지를 사용할 때는 아래처럼 이미지 이름만 바꿔서 사용합니다.

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
        "mcp-fast-note-sync-service:latest",
        "--allowed-vaults=Team,Personal",
        "--active-vault=Team"
      ]
    }
  }
}
```

### C. 원격 MCP 서버 URL 사용 (SSE/HTTP)

원격 서버 URL 연결을 지원하는 클라이언트라면 아래 형태로 사용합니다.

```json
{
  "mcpServers": {
    "fast-note-sync-remote": {
      "url": "https://your-domain.example.com/your-mcp-path",
      "headers": {
        "Authorization": "Bearer your_token",
        "X-FNS-Vault": "Team"
      }
    }
  }
}
```

서버 실행 모드:

- `MCP_TRANSPORT=streamable-http` (권장): `<basePath>` 단일 엔드포인트(GET/POST/DELETE)
- `MCP_TRANSPORT=sse` (legacy): `GET <basePath>` + `POST <basePath>/messages?sessionId=...`

토큰 전달 방식:

- HTTP/SSE 모드에서는 MCP 요청 헤더 `Authorization: Bearer <FNS_TOKEN>`로 사용자 토큰 전달 가능
- 이 경우 `fns_auth_set_token` 호출 없이 바로 user-auth 툴 사용 가능

vault 범위 전달 방식:

- `command`/Docker 연결에서는 이미지 이름 뒤 인자가 MCP 서버 프로세스로 전달됨
- 단일 vault로 고정하려면 `--vault=<vault>`
- 여러 vault만 허용하려면 `--allowed-vaults=vault1,vault2`
- 기본/초기 선택을 따로 주려면 `--default-vault=<vault>`, `--active-vault=<vault>`
- URL 연결에서는 `headers`로 `X-FNS-Vault`, `X-FNS-Allowed-Vaults`, `X-FNS-Default-Vault`, `X-FNS-Active-Vault` 전달 가능
- CLI 인자와 헤더 값은 동일 항목의 `FNS_*` 환경변수보다 우선 적용됨

## 5) 환경변수

- `FNS_BASE_URL` (기본: `http://fast-note-sync-service:9000`)
- `FNS_TOKEN` 사용자 토큰 (권장)
- `FNS_CREDENTIALS` / `FNS_PASSWORD` (`FNS_TOKEN` 없을 때 자동 로그인)
- `FNS_SHARE_TOKEN` 공유 전용 API용 토큰
- `FNS_ALLOWED_VAULTS` 허용 vault 목록(`*` 또는 `vault1,vault2`)
- `FNS_DEFAULT_VAULT` 기본 vault
- `FNS_ACTIVE_VAULT` 초기 active vault
- `FNS_ENABLE_ADMIN_TOOLS` (`true/false`, 기본 `false`)
- `FNS_PRETTY_DEFAULT` (`true/false`, 기본 `false`)
- `MCP_TRANSPORT` (`stdio` | `streamable-http` | `sse`, 기본 `stdio`)
- `MCP_HTTP_HOST` (HTTP/SSE 모드 host, 기본 `0.0.0.0`)
- `MCP_HTTP_PORT` (HTTP/SSE 모드 port, 기본 `3000`)
- `MCP_HTTP_BASE_PATH` (HTTP/SSE 모드 base path, 기본값 사용 가능)

## 6) Vault 선택 방식

- 연결 시점에 들어온 `--vault`/`X-FNS-Vault`는 해당 연결을 단일 vault로 고정
- 연결 시점에 들어온 `--allowed-vaults`/`X-FNS-Allowed-Vaults`는 해당 연결의 허용 범위만 재정의
- `fns_vault_set_active`로 active vault 선택
- vault 필수 도구에서 `vault` 생략 시 `active -> default` 순으로 적용
- `FNS_ALLOWED_VAULTS` 제약을 항상 검사

## 7) 제공 툴

### 런타임/보조
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
- `fns_admin_*` (`FNS_ENABLE_ADMIN_TOOLS=true`일 때만 노출)

## 8) 현재 매핑 한계

- `file move/rename`는 현재 REST 라우트가 없어 전용 툴로 직접 매핑하지 않았습니다.
  - 서비스/WS에는 존재하지만 REST 엔드포인트는 미노출 상태입니다.
