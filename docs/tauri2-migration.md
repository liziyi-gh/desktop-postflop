# Tauri 2 迁移

桌面框架更新到 Tauri 2.12，Linux 改用系统 **WebKitGTK 4.1** 和 libsoup 3。
当前主机已安装 WebKitGTK 2.54.2，它链接 JPEG XL 0.12；应用不再需要旧 WebKitGTK 4.0 所要求的 `libjxl.so.0.11`。

## 改动

- 更新 Rust `tauri` / `tauri-build`、前端 API 和 CLI，并同步两份锁文件。
- `invoke` 改从 `@tauri-apps/api/core` 导入。
- 对话框和文件读写改用 `plugin-dialog` / `plugin-fs`，包含 JSON 导入导出、结果表导出及存档对话框。
- GitHub 链接通过 `plugin-opener` 打开。
- 配置使用 `devUrl`、`frontendDist` 及顶层产品/打包字段；保留应用标识、窗口标题和尺寸。
- [主窗口 capability](../src-tauri/capabilities/main.json) 只启用实际使用的对话框、文本读写及 GitHub URL 权限。文件对话框会动态授权用户选择的路径，无需开放整个文件系统。
- 保留 Windows 的 HTTPS scheme，避免切换来源导致原有 IndexedDB 预设不可见；保持 Dexie 数据库及其 schema 不变。
- 本地求解器、二进制存档格式及节点锁定接口继续使用相邻的 `postflop-solver` 仓库；序列化依赖仍锁定为原来的 bincode 2.0.0-rc.3。
- CI 改用 Ubuntu 22.04、WebKitGTK 4.1 和 Node 22，并并列检出同一 GitHub owner 下的后端仓库。需将本地后端改动发布到该仓库后才能由远端 CI 构建。

## 构建

Tauri 当前稳定版要求 Rust 1.90。项目通过 [rust-toolchain.toml](../rust-toolchain.toml)
选择独立的 `nightly-2026-10-24`，用于求解器的 nightly allocator；不会修改全局默认工具链。

```sh
npm ci
npm run build
npm run lint
cd src-tauri
cargo test --locked
cd ..
npm run tauri build -- --no-bundle
```

Linux 可执行文件为 `src-tauri/target/release/desktop-postflop`。
`npm run tauri build` 则同时生成平台安装包。

确认动态依赖：

```sh
ldd src-tauri/target/release/desktop-postflop
```

应出现 `libwebkit2gtk-4.1.so.0`、`libsoup-3.0.so.0`、`libjxl.so.0.12`，且没有 `not found`。

## 验证记录

- 前端生产构建通过；lint 无错误，保留一条原有格式警告。
- 桌面后端 3 项测试通过；新工具链下求解器 11 项锁定/存档回归测试通过。
- Tauri 2 CLI release 构建通过；动态依赖切换到 WebKitGTK 4.1，没有缺失库。
- 在独立 Xvfb 显示器启动 release，确认 1350×810 主窗口持续运行并正常渲染，原有 IndexedDB 预设列表可见。
- 参见 [Rust 工具链审计](./rust-toolchain-audit.md)，解释当前继续保留 nightly 的原因。

参考：[官方迁移指南](https://v2.tauri.app/start/migrate/from-tauri-1/)、
[开发环境](https://v2.tauri.app/start/prerequisites/)。
