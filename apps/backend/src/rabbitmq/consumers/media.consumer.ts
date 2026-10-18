
import type { Channel } from "amqplib";
import * as MediaAPI from "../../services/media/api/media.api.js";

export const startMediaRabbitMQConsumer = async (
  channel: Channel,
): Promise<void> => {
  await channel.prefetch(1);

  await channel.consume("backend.media", async (message) => {
    if (!message) return;

    try {
      const event = JSON.parse(message.content.toString());

      console.log("🐇 Received media event:", event.eventType);

      switch (event.eventType) {
        case "media.delete-file":
          await MediaAPI.deleteFileApi(event.payload.key);
          break;

        default:
          // Unknown events are intentionally discarded.
          console.warn(`Unknown media event: ${event.eventType}`);
      }
    } catch (error) {
      console.error("Media RabbitMQ message processing failed:", error);

      channel.nack(message, false, false);
      return;
    }

    channel.ack(message);
  });

  console.log("🐇 Media RabbitMQ consumer started");
};
