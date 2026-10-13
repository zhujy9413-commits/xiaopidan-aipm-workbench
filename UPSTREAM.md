# 上游与来源

- 上游项目：DeepSeek Harness，https://github.com/deepseek-ai/deepseek-harness
- 固定标签：`dsh-v0.2.1-alpha.1`
- 固定提交：`5badb15009ae1756c3afe0ae0cef1faafc290ccc`
- 核对日期：2026-10-13
- 上游根许可证：MIT，Copyright (c) 2026 DeepSeek，原文保存在根目录 LICENSE。

原本地目录不含 Git 历史。通过与官方标签源码逐文件比较，发现该版本没有缺失的上游跟踪文件，59 个上游跟踪文件内容不同；另收录 33 个定制源码和资源文件。不能据此还原过去每次修改的时间和作者。

这些差异包含工作台、主题与桌面适配，不将差异中沿用的上游代码声明为个人原创。未将当前上游新版直接合入现有工作台。

GitHub 导入服务在首次整理时返回 HTTP 500，因此采用固定上游加定制源码的分发结构。安装脚本核对上游提交和 overlay 文件的 SHA-256，再应用定制。
