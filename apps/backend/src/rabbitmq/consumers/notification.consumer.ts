
import type { Channel } from "amqplib";
import {
  notifyMention,
  notifyReply,
  notifyGroupAdded,
} from "../../services/notifications/api/notifications.api.js";

export const startNotificationRabbitMQConsumer = async (
  channel: Channel,
): Promise<void> => {
  await channel.prefetch(1);

  await channel.consume("backend.notifications", async (message) => {
    if (!message) return;

    try {
      const event = JSON.parse(message.content.toString());

      console.log("🐇 Received notification event:", event.eventType);

      switch (event.eventType) {
        case "notification.notify-reply":
          await notifyReply(
            event.payload.replyUserId,
            event.payload.senderId,
            event.payload.chatId,
            event.payload.messageId,
          );
          break;

        case "notification.notify-mention":
          await notifyMention(
            event.payload.userId,
            event.payload.senderId,
            event.payload.chatId,
            event.payload.messageId,
          );
          break;

        case "notification.notify-group-added":
          await notifyGroupAdded(
            event.payload.userId,
            event.payload.currentUserId,
            event.payload.chatId,
          );
          break;

        default:
          console.warn(`Unknown notification event: ${event.eventType}`);
      }
    } catch (error) {
      console.error(
        "Notification RabbitMQ message processing failed:",
        error,
      );

      channel.nack(message, false, false);
      return;
    }

    channel.ack(message);
  });

  console.log("🐇 Notification RabbitMQ consumer started");
};
