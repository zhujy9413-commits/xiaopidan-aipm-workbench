# 小皮蛋的 AIPM 工作台

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 定制的个人 AI 产品工作台，把想法梳理、研究证据、立项判断、需求定义与 PRD 放进同一个使用流程。

当前是个人使用与持续迭代版本，按私有仓库整理。已在作者现有 macOS 环境启动并检查 Skills 列表及模式菜单；新电脑上的完整安装构建还未验证。

## 我的定制部分

- 中文产品工作台与项目导航。
- 从想法到 PRD 的阶段管理，记录证据、问题、决定与交付物。
- 理解、内容和交付等关键节点的确认卡。
- 六个产品工作流 Skill，以及对应中文专用模式。
- 工作台主题、磨砂外观、桌面图标和本地启动体验。

底层 Agent、模型连接、工具系统、会话存储及大量界面基础能力来自上游。这里是基于上游的定制项目，不把整个框架作为个人原创。

## 仓库如何组成

本仓库保存可审阅的定制源码 `overlay/`、完整 Skills `skills/`、可移植模式配置 `config/` 和安装脚本 `setup.py`。安装时拉取固定的上游版本，再应用本仓库的修改。

| 内容 | 位置 |
| --- | --- |
| 定制界面与后端源码 | [overlay/](overlay/) |
| 六个完整 Skill | [skills/](skills/) |
| 桌面与网页模式模板 | [config/](config/) |
| 上游版本与来源 | [UPSTREAM.md](UPSTREAM.md) |
| 维护方法 | [MAINTAINING.md](MAINTAINING.md) |
| 检查范围与结果 | [VALIDATION.md](VALIDATION.md) |

固定上游标签为 `dsh-v0.2.1-alpha.1`，提交为 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。避免直接套用到其他上游版本。

## 安装与启动

准备 Git、Python 3.9+、Node.js `^22.19.0` 或 `>=24.0.0`，以及 pnpm `11.7.0`。首次下载依赖和构建需要联网、时间与磁盘空间；桌面启动还会准备上游运行环境。

```sh
git clone https://github.com/zhujy9413-commits/xiaopidan-aipm-workbench.git
cd xiaopidan-aipm-workbench
python3 setup.py
cd runtime/deepseek-harness
sh start-workbench.sh
```

私有仓库的克隆需要有访问权限的 Git 登录。模型账号或 API Key 在启动后的设置中自行配置，不写进仓库。模型调用费用取决于所用服务。

只准备源码与配置，不下载依赖或构建：

```sh
python3 setup.py --source-only
```

启动网页界面：

```sh
cd runtime/deepseek-harness
sh start-workbench.sh web
```

默认安装目标为本仓库的 `runtime/deepseek-harness`。目标目录已存在时脚本停止，避免覆盖已有工作；可用 `--target` 指定一个新的目录。脚本不会启动模型任务，也不会自动迁入原有会话或项目数据。

## 怎么调用 Skills

新建任务后，在输入框上方的模式选择器中选择所需中文模式，也可以在普通对话中输入下表中的命令。

| 模式 | 对话调用 |
| --- | --- |
| 问题定义 | `/xqdy-skill` |
| 用户画像 | `/yhhx-skill` |
| 需求池 | `/xqc-skill` |
| 竞品分析 | `/jpfx-skill` |
| 立项报告 | `/lxbg-skill` |
| MVP 范围 | `/mvp-skill` |

示例输入：“我想做一个帮助个人整理衣柜的 AI 工具，目前只有想法，请先和我梳理用户和场景。”这是演示场景，不是用户调研事实。

Skills 可以独立使用，不要求每个项目完成全部环节。工作台副本将名称中的下划线改为短横线，以符合 Harness 的 Skill 名称规则，指令正文与配套资源保留。

## 数据与授权

本仓库不包含个人会话、附件、项目材料、API Key、账户凭据、浏览器登录状态、依赖目录和本地运行环境。安装后产生的数据保存在运行目录，已由 `.gitignore` 排除。

上游源码遵循 [MIT License](LICENSE)，第三方组件说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。保留上游版权及许可证。Skills 中保留的方法参考资料，访问权限与再分发授权尚未全部核对；本仓库暂不额外授予 Skills 的开源许可，公开前再处理。
