# Save/load 与节点锁定

## 提交审阅

检查了 `8d2f11d`（`feat: support full save result`）及当前未提交的节点锁定入口。主要问题及修复如下：

- 保存、加载使用 `unwrap()`：路径不可写、文件不存在或文件损坏时会 panic。现在通过 Tauri `Result` 将错误显示到界面。
- 加载前的 `is_solved() && is_ready()` 条件在该库中互斥，`finalize` 分支实际不可达，属于死代码。现在移除该分支，完整读取、验证新结果后再替换旧结果；失败保留原结果。读取期间仍持有牌局互斥锁，因为解码本身会 finalize，必须避免与使用自定义分配器的求解并发执行。
- 直接写目标文件可能先截断已有存档。现在先写同目录临时文件，完整编码、同步后再重命名替换，失败清理临时文件。
- 用 `isSolverFinished` 的布尔变化触发刷新，连续加载两份已完成结果时不会刷新。现在使用结果版本号触发刷新。
- 合法牌号为 `0..51`，原判断包含 `52`。现已修正。
- 节点锁定入口原本指向占位 HTML。现在使用应用内编辑器，并核对节点历史，避免把策略应用到已切换的节点。

## 本地后端

[Cargo.toml](../src-tauri/Cargo.toml) 使用 `../../postflop-solver`，即桌面项目和本地后端仓库并列放置。后端改动直接位于相邻仓库，并没有内嵌副本。

原来的 Git URL 是 Cargo 下载依赖的来源；修改自己的依赖配置、本地源码或维护自己的 fork 都不需要上游作者权限。以后发布时可继续使用并列仓库布局，或把路径依赖改为自己维护的 fork。

后端新增 `PostFlopGame::restart_solving()`。finalize 会将 regret 缓冲区改写为 EV，不能只把 solved 标记改回去继续迭代。该接口保留牌局、树、压缩设置和所有节点锁定，清空策略/后悔值并回到根节点，从第 0 次迭代重新求解。缺少完整河牌树的截断存档禁止重算。

## 界面操作及可复现实例

1. OOP 范围设为 `AsAh,QsQh`，IP 范围设为 `KsKh`。
2. 公共牌设为 `2s3h4d6c7c`，底池 `20`，有效筹码 `10`。双方河牌下注大小设为 `a`（全下），完成一次求解。
3. 在结果导航中选中 OOP 全下之后的 **IP 决策节点**，点击 **Options → Node Lock**。
4. 勾选 IP 的 `KsKh`，设置 Fold `25`、Call `75`，点击 **Apply locks and re-solve**。OOP 的 QQ 应过牌，AA 应全下。
5. 再次选中同一 IP 节点，把 Fold/Call 改为 `50/50` 并重算。现在 OOP 的 QQ、AA 都应全下。
6. 使用 **Save Result** 保存，使用 **Load Result** 重新载入，再打开同一节点的编辑器。锁定比例应保留，且可以再次修改并重算。

编辑器中的勾选按具体两张底牌组合生效，未勾选的手牌自由求解；锁定行的各动作百分比必须合计 100%。支持筛选、批量复制概率及解除当前节点的所有锁定。应用时会保留其他节点的锁定。重算期间编辑和取消按钮禁用，完成后刷新整棵树的结果。

存档保存的是求解结果，包括后端牌局配置、策略和锁定；载入后结果查看器的牌面、底池和有效筹码同步更新。侧栏中的新牌局配置表单仍用于配置下一次新建牌局。

## 验证命令

项目迁移 Tauri 2 后使用根目录 `rust-toolchain.toml` 固定的 `nightly-2026-10-24`。桌面项目内的 `cargo` 会自动选择它；在相邻后端仓库单独测试时显式指定同一工具链。

桌面仓库：

```sh
npm run build
npm run lint
cd src-tauri
cargo test --locked
```

本地后端仓库：

```sh
cargo +nightly-2026-10-24 test --features zstd --test kuhn --test rps --test node_lock_regression
cargo +nightly-2026-10-24 test --features zstd,custom-alloc --test kuhn --test rps --test node_lock_regression -- --test-threads=1
cargo +nightly-2026-10-24 run --example node_locking --features zstd,custom-alloc
```

测试内容：库恩扑克的已知均衡值、完整/部分根节点锁定；剪刀石头布在固定对手策略下的最优响应及混合锁定的解析收益；真实河牌树锁定修改与移除、其他锁定保留、压缩/非压缩存档往返及加载后重算；无效文件报错；保存失败保留原文件。

剪刀石头布测试将对手的固定分布编码为隐藏私有类型，测试的是锁定对手后的响应，并非双方自由调整策略的完整均衡求解测试。
