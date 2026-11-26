# 在 n8n 中核对一张分镜表的生成预算

剪辑师给了三个镜头，制片预留 3 美元。其中两个镜头各允许生成两次。把时长、分辨率和次数放进工作流，就能在试拍前看到首轮金额、重拍预留和整批支出。试算在自己的 n8n 中完成，无需密钥，运行时不向模型发送请求。

[下载 n8n 工作流 JSON](https://raw.githubusercontent.com/xiaodilj-dev/qianliu-video-workflows/main/shot-budget.json)

## 使用方法

1. 在 n8n 的空白工作流中，通过菜单选择 **Import from File**，打开下载的 JSON。
2. 双击 **Enter shot list, rates and cap**。在 JSON 中填写项目名、美元预算 `budgetUsd`、对应分辨率的每秒美元单价 `usdPerSecond`，以及分镜列表 `shots`。每行需要唯一的 `shotId`、分辨率 `preset`、每条输出秒数 `seconds` 和预计最多计费次数 `maxTakes`。次数包括首拍。
3. 点击 **Execute workflow**。在 **Price first takes and retakes** 查看首拍金额、重拍预留和预算余额。整批都在预算内时，**Release one budgeted item per shot** 输出逐镜清单。超额、重复镜号或缺少必要字段时，打开 **Hold batch for review** 查看原因，改好后可以重新试算。

| 示例镜号 | 分辨率 | 每条秒数 | 最多计费次数 | 预计最高费用（美元） |
| --- | --- | ---: | ---: | ---: |
| S010 | 768P | 5 | 2 | 0.7800 |
| S020 | 2K | 6 | 2 | 1.5216 |
| S030 | 768P | 4 | 1 | 0.3120 |

按示例单价，三个镜头各生成一次需 1.4628 美元，重拍预留为 1.1508 美元，共 2.6136 美元。将预算从 3.00 改成 2.60 美元再运行，整批会进入复核，超额 0.0136 美元。

适用范围是 MiniMax-H3 的纯文生视频，每条 4–15 秒。示例采用 2026 年 11 月 26 日千流 Hailuo-2 分组公示的每秒价，768P 为 0.0780 美元，2K 为 0.1268 美元。估算按输入的秒数计算。请在出预算前更新单价，成片后按实际输出时长和账单核对。带参考素材的额外计费另算。[分组公开价目](https://www.plusapi.cn/pricing?keyword=MiniMax-H3)

由千流 API 运营方维护。文件已在 n8n 2.49.7 的独立本地实例导入并运行，核对了预算内、超额、重复镜号与重复执行。需要试拍时，可另行使用自己的千流令牌创建一条付费任务，再按同一任务编号查询结果。[单镜头试拍说明](https://qianliu-api-tools.deed.page/#h3-postman)


## Run the shot estimate in n8n

1. [Download the workflow JSON](https://raw.githubusercontent.com/xiaodilj-dev/qianliu-video-workflows/main/shot-budget.json). In a blank n8n workflow, choose **Import from File**. The estimate runs locally without an API key.
2. Open **Enter shot list, rates and cap**. Set the project budget, the per-second rate for each resolution, and the duration and maximum takes for each shot. Count the first take in that maximum.
3. Choose **Execute workflow**. The sample reserves $1.4628 for first takes and $1.1508 for retakes. A $3.00 cap releases all three shots. With a $2.60 cap, open **Hold batch for review** to see the $0.0136 overrun.

## 用已生成的镜头核对费用 / Reconcile completed takes

[下载 n8n 费用核对工作流（JSON）](https://raw.githubusercontent.com/xiaodilj-dev/qianliu-video-workflows/main/shot-cost-review.json)。在 n8n 里选择 `Import from File` 后直接运行示例。最后一个节点的 `Binary` 输出是一份 Excel 表，列有三个镜头的首拍和重拍预算。示例可以离线运行。

有实际拍摄记录后，在对应分镜的 `receipts` 中加入任务编号，例如 `[{"taskId":"1234567890123456789","chargedUsd":null}]`。将示例编号换成自己的，保留引号。在 `Read existing H3 receipt` 节点选择创建任务时所用令牌的 `Bearer Auth` 凭据，再运行一次。工作流每次只查询已有编号。把使用日志里这次拍摄的实际美元扣费填进 `chargedUsd`，表中就能比较扣费和按输出秒数计算的估价。带参考素材、仍在生成或缺少用量的镜头会标明原因，估价留空。MiniMax 的查询窗口为最近七天。[任务状态文档](https://platform.minimax.cn/docs/api-reference/video-generation-v2-query)

In n8n, import the [receipt reconciliation workflow](https://raw.githubusercontent.com/xiaodilj-dev/qianliu-video-workflows/main/shot-cost-review.json) and run the sample to download the Excel budget from the final node’s `Binary` output. To reconcile your own takes, enter each existing task ID as a quoted string under its shot, choose the original token’s Bearer Auth credential, and enter its USD charge from your usage log when available. The workflow checks each listed ID once. It estimates completed text-only takes with sufficient usage data and flags the rest for review.

### Try one paid shot / 试拍一个镜头

也可以在 n8n 内试拍。[下载单镜头工作流](https://raw.githubusercontent.com/xiaodilj-dev/qianliu-video-workflows/main/single-shot.json)，在空白工作流中选择 **Import from File**。默认的 `preview` 只展示请求和预算。决定生成时，在两个 HTTP 节点选择同一个 **Bearer Auth** 凭据，填入自己的千流 Hailuo-2 令牌。在输入节点将 `action` 改成 `create`，执行一次并保存回执中的 `task_id`。随后将 `action` 改为 `status`，把编号作为字符串填入 `taskId`，保存后用这个模式查询进度。提交超时先查任务记录。每次执行 `create` 都可能产生一笔新的生成费用。

**To run it in n8n**, [import the single-shot workflow](https://raw.githubusercontent.com/xiaodilj-dev/qianliu-video-workflows/main/single-shot.json). Start in `preview` to inspect the payload locally. Select the same Hailuo-2 **Bearer Auth** credential in both HTTP nodes. Execute `create` once, copy the returned `task_id`, then switch to `status`, paste the ID into `taskId` as a string, and save. You can repeat `status` to check that render. The default preview and the create, query and error paths were checked in n8n 2.49.7 using a local API fixture. A live render needs your funded account.

At the sample Hailuo-2 rate, one 5-second 768P text-to-video render is estimated at **$0.39**. Check the [current MiniMax-H3 rates](https://www.plusapi.cn/pricing?keyword=MiniMax-H3) before running it. If you use Qianliu, [create an account / 注册千流](https://www.plusapi.cn/register?channel=c_ipvbujr0), then create a Hailuo-2 token in your account. In the [MiniMax H3 Postman collection](https://www.postman.com/qianliuapi-5737669/qianliu-api-developer-quickstart/collection/5nwixjg/api-minimax-h3), send the create request once and save the task ID. Use the same ID to check progress. Sending another create request can start a second paid render.
