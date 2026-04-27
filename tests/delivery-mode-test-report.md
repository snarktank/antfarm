# Antfarm Delivery 模式测试报告

## 测试目标
验证 Antfarm 在创建 cron 任务时，delivery 模式是否正确设置为 "none"

## 测试环境
- Antfarm 版本: 0.5.1
- OpenClaw 版本: 2026.4.10
- Node.js 版本: v24.14.1
- 操作系统: Windows 10

## 问题发现

### 原始代码问题
在 `src/installer/gateway-api.ts` 的 `createAgentCronJob` 函数中，CLI fallback 部分只处理了 `delivery?.mode === "announce"` 的情况：

```typescript
if (job.delivery?.mode === "announce") {
  args.push("--announce");
}
```

当 `delivery?.mode === "none"` 时，代码没有添加任何参数，导致 delivery 模式默认为 "announce"。

### 预期行为
当 `delivery?.mode === "none"` 时，应该添加 `--no-deliver` 参数。

## 修复方案

### 代码修改
在 `src/installer/gateway-api.ts` 的 `createAgentCronJob` 函数中，添加对 `delivery?.mode === "none"` 的处理：

```typescript
if (job.delivery?.mode === "announce") {
  args.push("--announce");
} else if (job.delivery?.mode === "none") {
  args.push("--no-deliver");
}
```

### 修改位置
文件: `C:\Users\main\.openclaw\workspace\antfarm\src\installer\gateway-api.ts`
行号: 164-166

## 验证测试

### 测试 1: 使用 --no-deliver 参数
```bash
openclaw cron add --name "test-antfarm-delivery" --every 1h --session isolated --agent test-agent --message "测试消息" --json --no-deliver
```

**结果**:
```json
{
  "id": "d79a61f5-005d-432a-b396-665b007f1f8c",
  "agentId": "test-agent",
  "name": "test-antfarm-delivery",
  "enabled": true,
  "createdAtMs": 1777103783833,
  "updatedAtMs": 1777103783833,
  "schedule": {
    "kind": "every",
    "everyMs": 3600000,
    "anchorMs": 1777103783833
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "测试消息"
  },
  "delivery": {
    "mode": "none",
    "channel": "last"
  },
  "state": {
    "nextRunAtMs": 1777107383833
  }
}
```

✅ **验证通过**: delivery 模式正确设置为 "none"

### 测试 2: 不使用 --no-deliver 参数（默认行为）
```bash
openclaw cron add --name "test-antfarm-default" --every 1h --session isolated --agent test-agent --message "测试消息" --json
```

**结果**:
```json
{
  "id": "334f071a-11ca-4757-8fb3-a9a9e4d166f1",
  "agentId": "test-agent",
  "name": "test-antfarm-default",
  "enabled": true,
  "createdAtMs": 1777103796530,
  "updatedAtMs": 1777103796530,
  "schedule": {
    "kind": "every",
    "everyMs": 3600000,
    "anchorMs": 1777103796530
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "测试消息"
  },
  "delivery": {
    "mode": "announce",
    "channel": "last"
  },
  "state": {
    "nextRunAtMs": 1777107396530
  }
}
```

✅ **验证通过**: delivery 模式默认为 "announce"

## 修复验证

### 修复前行为
当 Antfarm 创建 cron 任务时，如果 `delivery?.mode === "none"`，CLI fallback 不会添加 `--no-deliver` 参数，导致 delivery 模式默认为 "announce"。

### 修复后行为
当 Antfarm 创建 cron 任务时，如果 `delivery?.mode === "none"`，CLI fallback 会添加 `--no-deliver` 参数，确保 delivery 模式正确设置为 "none"。

### 编译验证
```bash
Select-String -Path "C:\Users\main\.openclaw\workspace\antfarm\dist\installer\gateway-api.js" -Pattern "no-deliver"
```

**结果**:
```
antfarm\dist\installer\gateway-api.js:130:            args.push("--no-deliver");
```

✅ **验证通过**: 修复已成功编译到 dist 文件中

## 结论

✅ **修复成功**

1. 问题已确认：Antfarm 在 CLI fallback 时没有正确处理 `delivery?.mode === "none"` 的情况
2. 修复已应用：在 `gateway-api.ts` 中添加了对 `--no-deliver` 参数的处理
3. 验证通过：OpenClaw CLI 正确支持 `--no-deliver` 参数，并能正确设置 delivery 模式为 "none"
4. 编译成功：修复已成功编译到 dist 文件中

## 后续建议

1. 在 Antfarm 的测试套件中添加对 delivery 模式的自动化测试
2. 在文档中明确说明 delivery 模式的行为和配置方法
3. 考虑在 Antfarm 的安装过程中验证 cron 工具的可用性

## 清理

测试任务已清理：
- ✅ test-antfarm-delivery (d79a61f5-005d-432a-b396-665b007f1f8c)
- ✅ test-antfarm-default (334f071a-11ca-4757-8fb3-a9a9e4d166f1)

## 修复文件清单

1. `C:\Users\main\.openclaw\workspace\antfarm\src\installer\gateway-api.ts` - 源代码修复
2. `C:\Users\main\.openclaw\workspace\antfarm\dist\installer\gateway-api.js` - 编译后的文件
3. `C:\Users\main\.openclaw\workspace\antfarm\tests\delivery-mode-test-report.md` - 测试报告
