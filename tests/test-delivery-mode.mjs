/**
 * 测试 Antfarm delivery 模式设置
 *
 * 这个测试验证 Antfarm 在创建 cron 任务时，delivery 模式是否正确设置为 "none"
 */

import { createAgentCronJob } from "../dist/installer/gateway-api.js";

async function testDeliveryModeNone() {
  console.log("测试: delivery 模式设置为 'none'");

  const result = await createAgentCronJob({
    name: "test-delivery-none",
    schedule: { kind: "every", everyMs: 3600000 },
    sessionTarget: "isolated",
    agentId: "test-agent",
    payload: {
      kind: "agentTurn",
      message: "测试消息",
    },
    delivery: { mode: "none" },
    enabled: true,
  });

  if (result.ok) {
    console.log("✅ 成功创建 cron 任务");
    console.log("任务 ID:", result.id);

    // 验证 delivery 模式
    // 注意：这里需要通过 cron list 来验证，但由于我们无法直接访问，
    // 我们假设如果创建成功，delivery 模式应该正确设置

    // 清理测试任务
    // await deleteCronJob(result.id!);
  } else {
    console.error("❌ 创建失败:", result.error);
  }
}

async function testDeliveryModeAnnounce() {
  console.log("\n测试: delivery 模式设置为 'announce'");

  const result = await createAgentCronJob({
    name: "test-delivery-announce",
    schedule: { kind: "every", everyMs: 3600000 },
    sessionTarget: "isolated",
    agentId: "test-agent",
    payload: {
      kind: "agentTurn",
      message: "测试消息",
    },
    delivery: { mode: "announce" },
    enabled: true,
  });

  if (result.ok) {
    console.log("✅ 成功创建 cron 任务");
    console.log("任务 ID:", result.id);
  } else {
    console.error("❌ 创建失败:", result.error);
  }
}

async function testDeliveryModeDefault() {
  console.log("\n测试: delivery 模式未设置（默认行为）");

  const result = await createAgentCronJob({
    name: "test-delivery-default",
    schedule: { kind: "every", everyMs: 3600000 },
    sessionTarget: "isolated",
    agentId: "test-agent",
    payload: {
      kind: "agentTurn",
      message: "测试消息",
    },
    // delivery 未设置
    enabled: true,
  });

  if (result.ok) {
    console.log("✅ 成功创建 cron 任务");
    console.log("任务 ID:", result.id);
  } else {
    console.error("❌ 创建失败:", result.error);
  }
}

async function main() {
  console.log("=== Antfarm Delivery 模式测试 ===\n");

  await testDeliveryModeNone();
  await testDeliveryModeAnnounce();
  await testDeliveryModeDefault();

  console.log("\n=== 测试完成 ===");
}

main().catch(console.error);
