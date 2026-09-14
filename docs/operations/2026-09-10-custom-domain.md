# 2026-09-10 自定义域名与后台登录配置记录

## 当前访问地址

- 网站：<https://z.ziwu.win>
- 管理后台：<https://z.ziwu.win/admin>
- 根域名：`ziwu.win`，在 Cloudflare 注册。
- Route 53 公有托管区域：`z.ziwu.win`。
- 原 CloudFront 分配域名：`d1v1mg445zdh54.cloudfront.net`。

实际域名已由用户确认是 `z.ziwu.win`；对话中出现的 `z.zw.win` 是笔误。

## 用户完成的配置

用户按自定义子域名流程完成配置并确认网站可访问。根域名仍留在
Cloudflare，子域名 `z.ziwu.win` 委派给 Route 53，由其解析到现有 CloudFront
网站。没有将整个根域名的注册转入 AWS。

2026-09-10 公开 DNS 查询返回以下 Route 53 名称服务器：

```text
ns-470.awsdns-58.com.
ns-1795.awsdns-32.co.uk.
ns-1035.awsdns-01.org.
ns-843.awsdns-41.net.
```

本次未通过 AWS 配置 API 重新读取具体 Alias 记录、CloudFront 备用域名列表
或 ACM 证书配置；公开 HTTPS 访问已验证成功。

## 后台登录问题与修复

切换域名后，登录页面显示“账号或密码错误”。实际请求返回的是
HTTP 403 `{"error":"请求来源无效。"}`。应用 Lambda 在校验密码之前，
先通过 `validOrigin` 比较请求的 `Origin` 与环境变量 `PUBLIC_ORIGIN`。
新域名尚未被允许，因此请求没有进入密码验证。

前端 `components/admin/serverless-admin.tsx` 的登录异常处理将所有失败统一
显示成“账号或密码错误”，造成误导。诊断时，旧 CloudFront Origin 配合空请求
返回 HTTP 401，而新域名 Origin 配合相同请求返回 HTTP 403，验证了来源限制。

用户随后确认已按说明修改 AWS Lambda 配置并恢复访问：

| 配置项 | 值 |
| --- | --- |
| 区域 | `ap-northeast-1`（东京） |
| Lambda 函数 | `our-pictures-dev-api` |
| 环境变量 | `PUBLIC_ORIGIN` |
| 修改后的值 | `https://z.ziwu.win`（末尾不加 `/`） |

这次处理不涉及修改管理员账号或密码。项目文档不保存密码、会话令牌或 AWS 凭据。

## 修改后的验证与账户状态

- Codex 实测网站首页 HTTPS 返回 HTTP 200。
- Codex 使用 `Origin: https://z.ziwu.win` 和空 JSON 请求登录接口，返回
  HTTP 401 `{"error":"账号或密码错误。"}`，不再返回来源无效的 HTTP 403。
  此处空请求的 401 是预期结果，说明请求已进入账号密码校验。
- 用户确认修改后可以访问；本轮没有使用真实密码重新验证登录、Cookie 会话、
  上传或其他后台写入操作。
- 用户表示已登录 root 账号和 AWS 账号。此为用户报告的控制台登录状态，
  不代表本机部署角色会话已经恢复。
- Codex 尝试使用 `our-pictures-dev` 读取 Lambda 配置时，AWS CLI 仍报告
  会话过期，因此没有读取回环境变量，也没有修改线上资源。

## 后续部署前必须同步

`scripts/deploy-serverless.sh` 的 `public_origin` 当前仍硬编码为旧地址
`https://d1v1mg445zdh54.cloudfront.net`。该脚本会写入 Lambda 环境变量，
直接再次运行 `npm run deploy` 会覆盖此次控制台修复。

下次部署前应将脚本中的值同步为 `https://z.ziwu.win`，并恢复本机部署角色
的有效 AWS 登录会话。本次仅记录文档，未修改部署脚本或重新部署。

前端区分来源拒绝、密码错误与其他请求失败的提示也尚未修复。

## 同日后续：前端视觉版本已部署

用户确认本地视觉版本后授权部署。已续期 `our-pictures-source`，通过
`OurPicturesDeployerRole` 发布。部署脚本的 `public_origin` 已同步为
`https://z.ziwu.win`，上节的“下次部署前必须同步”事项已完成。

本次只上传 Next.js 静态页面与构建资源，没有运行完整服务端部署脚本，
没有更新 Lambda、IAM、DynamoDB 或照片文件。先上传带内容哈希的构建资源，
再上传页面；保留原有资源，未执行删除同步。旧页面通过公开 HTTPS 备份于
`work/deploy-2026-09-10/backup/`（不纳入版本控制）。

验证结果：

- `npm run lint`、`npm test`、`git diff --check` 通过。
- `/`、`/admin`、`/admin/login` 均为 HTTP 200，页面及引用的构建资源与本地逐字节一致。
- `site-data.json` 发布前后逐字节一致：7 条记录、22 张照片。
- CloudFront 刷新 `ICIRDE5S2CLGZAFOG4EVS44TBA` 状态为 `Completed`。
- 浏览器控制在部署后无响应，未重新操作真实账号登录或执行后台写入。
