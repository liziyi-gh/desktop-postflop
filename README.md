# Desktop Postflop

> [!IMPORTANT]
> **As of October 2023, I have started developing a poker solver as a business and have decided to suspend development of this open-source project. See [this issue] for more information.**

[this issue]: https://github.com/b-inary/postflop-solver/issues/46

---

**Desktop Postflop** is a free, open-source GTO solver for Texas hold'em poker.

This is a port of [WASM Postflop] to a native desktop application using the [Tauri] framework.
Since WASM Postflop works on web browsers, it is more suitable for casual use.
However, if you want to use the solver for more serious purposes, please consider trying Desktop Postflop.

[WASM Postflop]: https://github.com/b-inary/wasm-postflop
[Tauri]: https://tauri.app/

**Related repositories**
- Solver engine: https://github.com/b-inary/postflop-solver

## Comparison to WASM Postflop

- **Shared features**:
  - Free to use and open-source
  - Same solver engine and user interface
- **Advantages**:
  - Faster computation
  - Able to use more than 4GB of memory
- **Disadvantages**:
  - Needs to download the program and trust the execution

See the [WASM Postflop repository] for more detailed comparisons, including some commercial solvers.

[WASM Postflop repository]: https://github.com/b-inary/wasm-postflop#comparison

## Supported environments

- OS
  - Windows: 10/11
  - macOS: 11.7 and later
    - Release builds are unsigned and are intended for Apple silicon.
  - Linux: GTK 3 and WebKitGTK 4.1 (e.g., Ubuntu 22.04 and later)
- CPU
  - x86-64: must support AVX2 instructions
    - Intel: Haswell (2013) and later
    - AMD: Zen (1st gen; 2017) and later
    - If you have a CPU without AVX2 support, you can modify `src-tauri/.cargo/config.toml` and build it yourself.
  - Apple silicon: M1 and later

## Download

You can download the app from the [GitHub releases page].

[GitHub releases page]: ../../releases

- Windows
  - The installer version (.msi) automatically installs dependent runtimes.
  - The portable version (.exe) requires the [WebView2 runtime] to be installed.
    - In most cases, the runtime should already be installed on Windows 10/11.
- Linux
  - AppImage should work on most Linux distributions.
  - Alternatively, the .deb package is available for Debian-based distributions, including Ubuntu.
- macOS
  - The Apple silicon `.dmg` is unsigned and not notarized; macOS Gatekeeper may block it.

[WebView2 runtime]: https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section

## Tracker integration / launch API

The solver accepts `--import <request.json>` to open an analysis spot with board,
OOP/IP ranges, pot, stack and betting sizes. Use `--capabilities` for versioned
feature discovery and `--validate <request.json>` to check a request without opening
the GUI. Non-GUI commands support `--output <path>` for machine-readable responses.
See the [launch API contract](./docs/launch-api.md),
[JSON Schema](./docs/launch-request.schema.json) and
[example request](./docs/examples/tracker-request.json).

## Uninstall

On Windows, please remove the following folder after the regular uninstallation to completely uninstall Desktop Postflop:

```
C:\Users\<username>\AppData\Local\b-inary.desktop-postflop
```

## Build

[Rust] (via rustup) and Node.js 22 or later need to be installed to build.
This project uses Tauri 2. On Linux, install GTK 3 and **WebKitGTK 4.1** development packages;
the old WebKitGTK 4.0 package is no longer used. See the [Tauri documentation] for details.
The project pins its nightly toolchain in [rust-toolchain.toml](./rust-toolchain.toml)
for the solver's custom allocator; rustup selects it automatically without changing your global default.

Cargo downloads the maintained solver from
[`liziyi-gh/postflop-solver`](https://github.com/liziyi-gh/postflop-solver).
The dependency follows its `main` branch; no sibling checkout is required.
GitHub Actions runs `cargo update --manifest-path src-tauri/Cargo.toml -p postflop-solver`
before each build to fetch the latest commit, overriding the revision recorded
in `src-tauri/Cargo.lock`. Run the same command locally to refresh the solver.
Push local solver changes to that repository's `main` branch before releasing.

Then clone this reporitory and run the following commands:

```sh
$ npm install
$ npm run tauri build
```

If the build was successful, you should be able to find the application in the `src-tauri/target/release/bundle/` directory.

If you want to use stable Rust (at least 1.90) instead of nightly Rust, remove the
`custom-alloc` feature in `src-tauri/Cargo.toml` and select stable explicitly:

```diff
[dependencies]
...
- postflop-solver = { git = "https://github.com/liziyi-gh/postflop-solver.git", branch = "main", features = ["custom-alloc", "zstd"] }
+ postflop-solver = { git = "https://github.com/liziyi-gh/postflop-solver.git", branch = "main", features = ["zstd"] }
```

[Rust]: https://www.rust-lang.org/learn/get-started
[Node.js]: https://nodejs.org/en/
[Tauri documentation]: https://v2.tauri.app/start/prerequisites/

## Publishing a release

Push a version tag to run the GitHub Actions release workflow. It builds Windows
x86-64 (`.msi` and portable `.exe`), Linux x86-64 (`.deb` and `.AppImage`),
and macOS Apple silicon (`.dmg`). Once all three builds succeed, the workflow
publishes a GitHub Release with generated notes; a version containing a hyphen
is marked as a prerelease. The macOS build is unsigned and not notarized.

Before tagging, update the version in `package.json`, `package-lock.json`,
`src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` to the same value.
For example, `npm version 0.2.8 --no-git-tag-version` updates both npm files;
update the two Tauri/Rust files separately and commit all changes. Then push the
commit and its tag (replace `lzy-gh` with your remote name if needed):

```sh
git push lzy-gh HEAD
git tag v0.2.8
git push lzy-gh v0.2.8
```

The tag must start with `v` and match all four version files. Check the Actions
tab for progress and failures. Each build fetches the latest `postflop-solver`
commit on `main` directly from GitHub. Push local solver changes before creating
the desktop release tag. Rebuilding the same tag can use a newer solver commit.
The release job needs permission to write repository contents.

## ~~Roadmap (in order of priority)~~

- Results saving/loading feature ([#8](https://github.com/b-inary/desktop-postflop/issues/8))
- Hand filter feature for the result viewer ([#6](https://github.com/b-inary/desktop-postflop/issues/6))
- Node-locking feature
- Short deck support
- Aggregated reporting feature for multiple flops
- GTO training mode ([#9](https://github.com/b-inary/desktop-postflop/issues/9))

## License

Copyright (C) 2022 Wataru Inariba

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.
