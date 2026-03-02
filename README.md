# mcp-fast-note-sync-service

`fast-note-sync-service` REST API를 MCP 툴로 노출하는 서버입니다.

- Transport: `stdio`
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

## Testing / Lint / Format

```bash
npm run test        # watch mode
npm run test:run    # one-shot
npm run lint        # biome check
npm run format      # biome check --write
npm run check       # typecheck + lint + test:run
```

## 3) MCP 클라이언트 설정 예시

`command`로 Docker를 직접 실행하는 방식:

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

## 4) 환경변수

- `FNS_BASE_URL` (기본: `http://fast-note-sync-service:9000`)
- `FNS_TOKEN` 사용자 토큰 (권장)
- `FNS_CREDENTIALS` / `FNS_PASSWORD` (`FNS_TOKEN` 없을 때 자동 로그인)
- `FNS_SHARE_TOKEN` 공유 전용 API용 토큰
- `FNS_ALLOWED_VAULTS` 허용 vault 목록(`*` 또는 `vault1,vault2`)
- `FNS_DEFAULT_VAULT` 기본 vault
- `FNS_ACTIVE_VAULT` 초기 active vault
- `FNS_ENABLE_ADMIN_TOOLS` (`true/false`, 기본 `false`)
- `FNS_PRETTY_DEFAULT` (`true/false`, 기본 `false`)

## 5) Vault 선택 방식

- `fns_vault_set_active`로 active vault 선택
- vault 필수 도구에서 `vault` 생략 시 `active -> default` 순으로 적용
- `FNS_ALLOWED_VAULTS` 제약을 항상 검사

## 6) 제공 툴

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

## 7) 현재 매핑 한계

- `file move/rename`는 현재 REST 라우트가 없어 전용 툴로 직접 매핑하지 않았습니다.
  - 서비스/WS에는 존재하지만 REST 엔드포인트는 미노출 상태입니다.
