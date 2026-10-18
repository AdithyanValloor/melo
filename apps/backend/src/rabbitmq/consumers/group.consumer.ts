
import type { Channel } from "amqplib";
import { handleGroupEvent } from "../handlers/group.handler.js";

export const startGroupRabbitMQConsumer = async (
  channel: Channel,
): Promise<void> => {
  await channel.prefetch(1);

  await channel.consume("backend.groups", async (message) => {
    if (!message) return;

    let event: unknown;

    try {
      event = JSON.parse(message.content.toString());

      console.log("🐇 Received group RabbitMQ event");

      await handleGroupEvent(event);

    } catch (error) {
      console.error("RabbitMQ group message processing failed:", error);

      channel.nack(message, false, false);
      return;
    }

    channel.ack(message);
  });

  console.log("🐇 Group RabbitMQ consumer started");
};
