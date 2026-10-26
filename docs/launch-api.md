# Solver 启动接口（Launch API v1）

本接口供 PokerTracker 等桌面应用将一个 **heads-up 翻后决策点**及双方范围导入
Desktop Postflop。普通无参数启动保持原来的 GUI 行为。

设计上分开三层：启动参数选择操作；带版本号的 JSON 表达业务数据；GUI 通过
Tauri command 获取已验证的启动状态。以后增加 IPC、文件关联或自动求解时，可复用
请求模型和校验逻辑，无须让调用方拼接几十个命令行参数。

## 启动参数

| 参数 | 行为 |
| --- | --- |
| 无参数 | 正常打开 GUI |
| `--import <path>` | 读取、校验请求，打开新的 GUI 实例，填入配置和范围，进入 Run Solver |
| `--validate <path>` | 校验请求并返回 JSON，退出，不初始化 GUI、不求解 |
| `--capabilities` | 返回应用标识、应用版本、接口版本、支持的请求版本和能力 JSON |
| `--version` / `-V` | 返回应用标识和应用版本 JSON |
| `--help` / `-h` | 返回帮助文本 |
| `--output <path>` | 将非 GUI 命令的响应写入 UTF-8 文件，代替 stdout |

只能选择一种操作；未知参数、重复操作和重复 `--output` 都报错。路径使用操作系统
原生路径类型，支持中文和空格，相对路径相对于调用进程的工作目录。v1 使用分开的
参数和值，不支持 `--import=...`。`--output` 会创建或覆盖响应文件，请使用独立路径。

退出码：`0` 表示非 GUI 操作成功或 GUI 正常退出，`1` 表示请求、文件 I/O 等操作
失败，`2` 表示命令行用法错误。诊断写入 stderr；`--validate` 的请求错误还会生成：

```json
{"ok":false,"error":{"code":"INVALID_REQUEST","message":"..."}}
```

成功校验返回 `{"ok":true,"schemaVersion":1,"requestId":"..."}`。
命令行用法和响应文件写入失败时，不保证有 JSON 响应，调用方必须检查退出码。

查询和校验在初始化 Tauri、窗口和线程池之前执行，适合自动化探测。可执行文件仍
依赖平台运行库，并不是独立发行的无依赖 CLI。Windows 发行版使用 GUI 子系统，
调用方应等待进程退出，并使用 `--output`，避免依赖控制台输出是否可用。

## 请求格式

完整约束见 [JSON Schema](./launch-request.schema.json)，可直接使用
[请求示例](./examples/tracker-request.json)。请求最大 1 MiB，使用 UTF-8 JSON。

```json
{
  "schemaVersion": 1,
  "requestId": "tracker-hand-123-turn",
  "context": {
    "source": "MyPokerTracker",
    "handId": "123",
    "heroPosition": "ip",
    "heroCards": ["Qh", "Qs"]
  },
  "spot": {
    "board": ["As", "Kd", "2c", "7h"],
    "ranges": {"oop": "AA,KK,AKs,AKo", "ip": "QQ,JJ,TT"},
    "startingPot": 200,
    "effectiveStack": 900,
    "rakePercent": 5,
    "rakeCap": 30
  },
  "tree": {
    "turn": {
      "oop": {"bet": "50%,100%", "raise": "2.5x"},
      "ip": {"bet": "50%,100%", "raise": "2.5x"}
    },
    "river": {
      "oop": {"bet": "75%,a", "raise": "a"},
      "ip": {"bet": "75%,a", "raise": "a"}
    }
  },
  "extensions": {"com.example.tracker": {"tableId": "table-9"}}
}
```

字段语义：

- `schemaVersion` 必填。v1 只接受 `1`，不推测或降级解释其他版本。
- `requestId` 可选，由调用方生成用于关联请求。v1 不提供去重、回调或完成通知。
- `context` 可选，仅作为手牌来源和 Hero 信息显示；Hero 手牌不会替代 Hero 范围，
  也不会在结果页自动筛选该组合。建议同时提供 `heroPosition` 和 `heroCards`。
- `spot` 必填；只支持双方 OOP/IP 的翻后局面。`board` 为按发牌顺序排列的 3–5
  张牌，牌面如 `As`、`Td`，点数大写、花色小写；不接受 `10s` 或重复牌。
- `ranges` 中双方均必填且不能为空。使用 solver 原有范围语法，如 `AA,AKs,AKo`、
  `QQ:0.5`、`QhQs`；权重 `0.5` 表示 50%。范围不是原始牌谱。
- `startingPot` 是当前街开始时的底池，`effectiveStack` 是此时双方剩余有效筹码。
  都是 1–30000 的整数，使用相同单位。Tracker 应统一缩放金额，例如以美分或
  0.1 BB 为单位，不能直接传入小数 BB。
- `rakePercent` 默认 `0`，单位为百分数，例如 `5` 表示 5%，范围 0–100。
  `rakeCap` 默认 `0`，与底池同单位，范围 0–90000。
- `tree.flop/turn/river` 每街分别配置 `oop/ip` 的 `bet/raise` 字符串。省略的
  街、玩家或尺寸字段默认为空，意味着没有常规下注/加注尺寸；不会替调用方生成
  策略模板。建议 Tracker 显式提供当前及后续街的完整尺寸模板。
- 尺寸沿用引擎语法：`50%` 为底池比例，`2.5x` 为加注倍数，`a` 为 all-in，
  多个尺寸用逗号分隔，每类最多 30 个。百分比需要显式 `%`，避免单位歧义。
- `tree.addAllInThreshold/forceAllInThreshold/mergingThreshold` 默认分别为
  `150/20/10`，均使用 GUI 的百分数单位，范围 0–3000000。
- 已知对象拒绝未知字段，便于尽早发现拼写错误。自定义数据放入 `extensions`，
  建议以反向域名区分命名空间；solver 保留但不执行这些数据。

校验覆盖结构、版本、牌面、Hero 手牌冲突、金额、范围和尺寸语法。它不构建完整
游戏树、不分配求解内存，也不保证范围经公共牌阻断后一定存在可玩的组合。
范围、公共牌和树的完整可求解性检查仍由用户点击 Run Solver 后的既有流程执行。

## PokerTracker 对接顺序

1. 找到候选可执行文件：优先使用用户保存的安装路径，然后按平台查询安装位置。
   Windows 可查询标准卸载注册表，Linux 可检查 PATH 或让用户指定 AppImage，
   macOS 可检查应用包内可执行文件。本次没有新增注册表键、PATH 修改、文件关联
   或自定义 URL scheme，不能假设安装后存在全局 `desktop-postflop` 命令。
2. 使用独立临时文件调用 `--capabilities --output <response>`，等待结束并检查
   退出码、`application == "desktop-postflop"`、`launchApiVersion`、
   `requestSchemaVersions` 和 `features.guiImport`。设置合理超时；旧版本可能
   忽略参数而打开 GUI，不能只用“进程启动成功”判断支持。
3. 生成每次请求独有的文件路径，完整写入后关闭文件，再调用 `--validate`。
   按字段消息向用户报告错误。不要在日志中默认记录完整手牌及范围。
4. 校验成功后以 `--import <request>` 启动。使用进程 API 的参数数组，避免经过
   shell 拼接。导入进程再次校验实际读取的数据。
5. v1 每次启动一个独立实例，不会覆盖已有分析。导入成功的 GUI 进程持续运行；
   进程创建成功并不代表 GUI 已就绪或求解已完成。请求文件必须保留到已确认读取，
   v1 无读取回执，可在进程退出后清理，或让 Tracker 在以后安全清理过期临时文件。

Node.js 调用示例（其他语言同样使用参数数组）：

```js
import { spawn } from "node:child_process";

const child = spawn(solverExecutable, ["--import", requestPath], {
  shell: false,
  windowsHide: true,
  stdio: "ignore"
});
child.on("error", reportLaunchError);
child.on("exit", (code) => {
  if (code !== 0) reportLaunchError(new Error(`Solver exited: ${code}`));
  // 这里可以清理该次请求文件。
});
```

macOS 也可通过 `open -n -a "Desktop Postflop" --args --import <absolute-path>`
打开独立实例；需要可靠退出码和能力查询时直接运行应用包内可执行文件。

## 扩展边界

应用版本、Launch API 版本、请求 Schema 版本相互独立。当前查询返回
`autoSolve: false` 和 `singleInstanceForwarding: false`，调用方不得假定这些功能存在。
未来可按能力增加 `--solve`、求解结果导出、请求完成回执或向已有实例转发；有破坏性
的数据变化需增加 Schema 版本。原始牌谱解析、行动历史映射、donk 配置、树的增删
线路、节点锁定、结果高亮和自动求解均留在后续接口版本中，不通过无约束参数偷偷启用。

首版传输的是指定街开始时的局面。若用户从街内某次 bet/raise 决策点发起分析，
Tracker 应还原该街初始底池、筹码和范围；不能把街内下注简单加到底池后当作新街，
因为当前 solver 默认从 OOP 的根节点开始，尚不支持在请求中指定当前行动节点。

## 开发验证

`npm run test:launch-api` 检查普通启动、导入状态、引擎与 GUI 尺寸往返转换和
初始化失败时的状态。`npm run build` 执行 TypeScript 检查及前端构建，
`npm run lint` 检查前端代码。Rust 参数解析、请求校验和示例兼容测试位于
[startup.rs](../src-tauri/src/startup.rs)，安装项目所需工具链及相邻的 solver
仓库后，运行 `cargo test --manifest-path src-tauri/Cargo.toml startup::tests`。
