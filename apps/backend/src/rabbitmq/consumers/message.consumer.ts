import { randomUUID } from "node:crypto";
import type { Channel, ConfirmChannel, ConsumeMessage, Message } from "amqplib";
import { handleMessageEvent } from "../handlers/message.handler.js";

const MAX_RETRIES = 2;

const publishAndConfirm = async (
  channel: ConfirmChannel,
  exchange: string,
  routingKey: string,
  content: Buffer,
  options: ConsumeMessage["properties"],
): Promise<void> => {
  // Unique per publication, even if the same event is delivered twice.
  const publicationId = randomUUID();

  let returned = false;

  const handleReturn = (message: Message) => {
    if (message.properties.messageId === publicationId) {
      returned = true;
    }
  };

  channel.on("return", handleReturn);

  try {
    channel.publish(exchange, routingKey, content, {
      persistent: true,
      mandatory: true,
      contentType: options.contentType ?? "application/json",
      headers: options.headers,
      correlationId: options.correlationId,
      messageId: publicationId,
      timestamp: options.timestamp,
      type: options.type,
    });

    await channel.waitForConfirms();

    if (returned) {
      throw new Error(
        `RabbitMQ could not route publication to ${exchange} (${routingKey})`,
      );
    }
  } finally {
    channel.off("return", handleReturn);
  }
};

export const startMessageRabbitMQConsumer = async (
  channel: Channel,
  confirmChannel: ConfirmChannel,
): Promise<void> => {
  await channel.prefetch(1);

  await channel.consume("backend.messages", async (message) => {
    if (!message) return;

    try {
      const event = JSON.parse(message.content.toString());

      console.log("🐇 Received RabbitMQ event:", event.eventType);

      await handleMessageEvent(event);
    } catch (processingError) {
      console.error("RabbitMQ message processing failed:", processingError);

      try {
        const retryCount = Number(
          message.properties.headers?.["x-retry-count"] ?? 0,
        );

        const headers = {
          ...message.properties.headers,
          "x-retry-count": retryCount + 1,
        };

        const isExhausted = retryCount >= MAX_RETRIES;
        const routingKey = message.fields.routingKey;
        const destinationExchange = isExhausted
          ? "message.dlx"
          : "message.retry";

        await publishAndConfirm(
          confirmChannel,
          destinationExchange,
          routingKey,
          Buffer.from(message.content),
          {
            ...message.properties,
            headers,
          },
        );

        console.warn(
          isExhausted
            ? `☠️ Message sent to DLQ: ${routingKey}`
            : `🔁 Message scheduled for retry ${retryCount + 1}: ${routingKey}`,
        );

        channel.ack(message);
      } catch (publishError) {
        console.error(
          "Failed to publish retry/DLQ message; requeueing original:",
          publishError,
        );

        try {
          channel.nack(message, false, true);
        } catch (ackError) {
          console.error("Could not requeue original delivery:", ackError);
        }
      }

      return;
    }

    try {
      channel.ack(message);
    } catch (ackError) {
      console.error(
        "Processing succeeded, but acknowledgement failed; delivery may be redelivered:",
        ackError,
      );
    }
  });

  console.log("🐇 Message consumer started");
};
