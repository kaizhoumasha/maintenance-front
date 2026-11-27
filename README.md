# maintenance-front

`maintenance-admin` 的管理端前端。第一版设计见 [管理端前端设计](docs/superpowers/specs/2026-11-21-maintenance-front-design.md)。助手约定见 [CLAUDE.md](CLAUDE.md)。

```bash
pnpm install
pnpm dev    # 开发服务器；/api 代理到 http://127.0.0.1:8000
pnpm test   # vitest run
pnpm build  # vue-tsc --noEmit && vite build
```
