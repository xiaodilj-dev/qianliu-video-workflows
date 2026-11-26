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

### Try one paid shot / 试拍一个镜头

At the sample Hailuo-2 rate, one 5-second 768P text-to-video render is estimated at **$0.39**. Check the [current MiniMax-H3 rates](https://www.plusapi.cn/pricing?keyword=MiniMax-H3) before running it. If you use Qianliu, [create an account / 注册千流](https://www.plusapi.cn/register?channel=c_ipvbujr0), then create a Hailuo-2 token in your account. In the [MiniMax H3 Postman collection](https://www.postman.com/qianliuapi-5737669/qianliu-api-developer-quickstart/collection/5nwixjg/api-minimax-h3), send the create request once and save the task ID. Use the same ID to check progress. Sending another create request can start a second paid render.
