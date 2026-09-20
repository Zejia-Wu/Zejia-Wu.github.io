# Google Sheet 数据接收端部署

调查页是静态 GitHub Pages，不能直接写入数据库。本目录中的 `Code.gs` 是一个 Google Apps Script Web App 接收端，会把每次调查写入 Google Sheet 的 `Responses` 工作表。

## 部署步骤

1. 新建一个 Google Sheet，并保持表格为私有。
2. 打开 `扩展程序 → Apps Script`。
3. 删除编辑器中的示例代码，把 `Code.gs` 的内容粘贴进去并保存。
4. 点击 `部署 → 新建部署`。
5. 类型选择 `Web 应用`。
6. “执行身份”选择“我”；“谁有权访问”选择“任何人”。
7. 点击部署并完成 Google 授权，复制生成的 Web App URL。
8. 把 URL 粘贴到 `user_study/config.js` 的 `submissionEndpoint` 字段：

```js
window.USER_STUDY_CONFIG = Object.freeze({
  submissionEndpoint: "https://script.google.com/macros/s/你的部署ID/exec",
  studyVersion: "user-study-v1"
});
```

9. 将修改后的仓库发布到 GitHub Pages。

如果之后修改了 `Code.gs`，需要在 Apps Script 中打开「部署 → 管理部署」，点击编辑，在“版本”处选择“新版本”，再点击部署。仅修改 GitHub 仓库中的 `Code.gs` 不会自动更新已经部署的 Apps Script。

首次提交后，脚本会自动创建 `Responses` 工作表并写入表头。网页使用 `text/plain` POST，避免静态 GitHub Pages 调用 Apps Script 时触发跨域预检。

## 数据字段

每次提交占一行。表格前两行是分组表头：每个指标下面固定有 `ours`、`c2w`、`viga`、`direct`、`mcp` 五列，便于直接横向比较；提交时间、昵称、组编号、完成方式和视频展示顺序位于左侧。`set_id` 是对应的 01–13 视频组编号，不是评分。

调查页会通过 `doGet?action=history` 查询同一昵称已经完成的组别，并从未完成的组别中继续随机选择。若已有旧版三方法数据，新的五方法数据会自动写入 `Responses_5_methods`，旧数据保留不变；历史查询会同时读取两个工作表。

请不要通过此调查收集身份证号、联系方式、健康信息等敏感个人信息。
