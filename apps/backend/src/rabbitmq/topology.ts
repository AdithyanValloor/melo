import type { Channel } from "amqplib";

export const setupRabbitMQTopology = async (
  channel: Channel,
): Promise<void> => {
  // Main event exchange
  await channel.assertExchange("message.events", "direct", {
    durable: true,
  });

  // Retry and dead-letter exchanges
  await channel.assertExchange("message.retry", "direct", {
    durable: true,
  });

  await channel.assertExchange("message.dlx", "direct", {
    durable: true,
  });

  // Message events queue
  await channel.assertQueue("backend.messages", {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": "message.retry",
    },
  });

  const messageEvents = [
    "message.created",
    "message.mentioned",
    "message.unread-update",
    "message.edited",
    "message.reaction",
    "message.delete",
    "message.seen",
    "message-request.created",
    "message-request.accepted",
    "message-request.rejected",
  ];

  for (const routingKey of messageEvents) {
    await channel.bindQueue("backend.messages", "message.events", routingKey);
  }

  // Failed messages wait here for 5 seconds,
  // then return to the main event exchange.
  await channel.assertQueue("backend.messages.retry", {
    durable: true,
    arguments: {
      "x-message-ttl": 5000,
      "x-dead-letter-exchange": "message.events",
    },
  });

  for (const routingKey of messageEvents) {
    await channel.bindQueue(
      "backend.messages.retry",
      "message.retry",
      routingKey,
    );
  }

  // Permanently failed messages are retained for inspection.
  await channel.assertQueue("backend.messages.dlq", {
    durable: true,
  });

  for (const routingKey of messageEvents) {
    await channel.bindQueue("backend.messages.dlq", "message.dlx", routingKey);
  }

  // Group events queue
  await channel.assertQueue("backend.groups", {
    durable: true,
  });

  const groupEvents = [
    "group.created",
    "group.members-added",
    "group.member-removed",
    "group.updated",
    "group.deleted",
    "group.admin-toggle",
    "group.member-left",
    "group.transfer-owner",
  ];

  for (const routingKey of groupEvents) {
    await channel.bindQueue("backend.groups", "message.events", routingKey);
  }

  // Notification events queue
  await channel.assertQueue("backend.notifications", {
    durable: true,
  });

  const notificationEvents = [
    "notification.notify-reply",
    "notification.notify-mention",
    "notification.notify-group-added",
  ];

  for (const routingKey of notificationEvents) {
    await channel.bindQueue(
      "backend.notifications",
      "message.events",
      routingKey,
    );
  }

  // Media events queue
  await channel.assertQueue("backend.media", {
    durable: true,
  });

  const mediaEvents = ["media.delete-file"];

  for (const routingKey of mediaEvents) {
    await channel.bindQueue("backend.media", "message.events", routingKey);
  }

  console.log("🐇 RabbitMQ topology ready");
};
