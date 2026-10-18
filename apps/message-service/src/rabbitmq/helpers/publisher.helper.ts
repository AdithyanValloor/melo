import { getRabbitMQChannel } from "../connection.js";
import amqp from "amqplib";

const MESSAGE_EVENTS_EXCHANGE = "message.events";

interface RabbitMQEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: object;
}

export const publishEvent = async (
  routingKey: string,
  event: RabbitMQEvent,
): Promise<void> => {
  const channel = await getRabbitMQChannel();

  const message = Buffer.from(JSON.stringify(event));
  let returned = false;

  const onReturn = (msg: amqp.Message) => {
    if (msg.properties.messageId === event.eventId) {
      returned = true;
    }
  };

  channel.on("return", onReturn);

  try {
    channel.publish("message.events", routingKey, message, {
      persistent: true,
      mandatory: true,
      contentType: "application/json",
      messageId: event.eventId,
    });

    await channel.waitForConfirms();

    if (returned) {
      throw new Error(
        `RabbitMQ could not route event "${event.eventType}" (${routingKey})`,
      );
    }
  } finally {
    channel.off("return", onReturn);
  }
};
