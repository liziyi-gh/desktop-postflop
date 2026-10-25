# Rust 工具链审计（2026-10-25）

## 结论

当前 stable 是 **Rust 1.99.1**。保留自定义分配器的当前项目继续使用
[固定的 nightly-2026-10-24](../rust-toolchain.toml)，即 Rust 1.101.0-nightly，
保留现有 `custom-alloc` 优化。本地后端仓库也使用相同的工具链配置。

官方 nightly 文档已将 `Allocator` 标注为 **1.100.0 稳定**，但这尚未进入当前发布的 stable。
“代码已合入主线”和“已经可以在当前 stable 使用”需要区分。

## 实际依赖

本地后端的 `src/lib.rs` 只有一个不稳定语言特性开关：

```rust
#![cfg_attr(feature = "custom-alloc", feature(allocator_api))]
```

| API / 配置 | 位置 | 当前 stable 1.99.1 |
| --- | --- | --- |
| `std::alloc::Allocator`、`AllocError` | 后端 `src/alloc.rs` | 仍需 nightly |
| `Vec::with_capacity_in(..., StackAlloc)` | 后端 `src/solver.rs`、`src/utility.rs` | 仍需 nightly |
| `Vec::spare_capacity_mut` | 求解器和解释器 | 已稳定，自 Rust 1.60 起可用 |
| `MaybeUninit`、`std::alloc::alloc/dealloc` | 求解器和分配器 | 已稳定 |
| `panic = "abort"`、`codegen-units = 1` | 桌面 release profile | 已稳定 |
| 旧 CI 的 `-Z build-std` / `-Z build-std-features` | 原发布工作流 | Cargo 不稳定选项；迁移时已移除这项可选构建优化 |

Tauri 2 本身要求至少 Rust 1.90，并不要求 nightly。剩余原因来自后端的自定义分配器。

## 编译核对方法

探针直接 `include!` 本地后端的真实 `src/alloc.rs`，再构造使用 `StackAlloc` 的 Vec；
探针不添加 `#![feature(...)]`。因此不会把“源码残留 feature 属性”误当成 API 仍未稳定。
在 Rust 1.101 nightly 上，该探针无 feature 属性也能编译，确认当前实际调用已包含在新的稳定化范围内。
更新 stable 后，对同一探针的实测结果：

| 编译器 | 不带 feature 属性的真实分配器探针 |
| --- | --- |
| Rust 1.99.1 stable | 失败，8 条 `E0658: use of unstable library feature allocator_api` |
| Rust 1.101.0 nightly（2026-10-24） | 编译通过 |

宿主机的 stable 已从 1.67.0 更新到 1.99.1；更新前清理了停止发布的 RLS 和 rust-analysis 组件。
已有 rust-analyzer 保留。全局默认工具链选择不变，两份项目通过各自配置选择新 nightly。

项目继续固定已通过回归测试的日期版 nightly，避免机器上旧的全局 `nightly` 别名影响构建。

## 以后切换 stable

等 stable 发布 Rust 1.100 或更高版本后，重新运行上述真实源码探针和求解器回归测试。
通过后删除后端残留的 `feature(allocator_api)` 属性（stable 不允许 feature 属性，即使相关 API 已稳定），
将工具链切换到对应 stable 版本，并同步 CI。
原来的 `allocator_api` 在新 nightly 中提示“部分稳定、其余由 allocator_ext 接替”；
实际用到的 API 是否需要新开关应由探针决定，不能直接把它机械替换成 `allocator_ext`。

参考：[stable Allocator 文档](https://doc.rust-lang.org/stable/std/alloc/trait.Allocator.html)、
[nightly Allocator 文档](https://doc.rust-lang.org/nightly/std/alloc/trait.Allocator.html)、
[Vec API](https://doc.rust-lang.org/stable/std/vec/struct.Vec.html)。
