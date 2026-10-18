import amqp, {
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
} from "amqplib";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

export interface RabbitMQSession {
  connection: ChannelModel;
  channel: Channel;
  confirmChannel: ConfirmChannel;
}

export const connectRabbitMQ = async (): Promise<RabbitMQSession> => {
  const connection = await amqp.connect(RABBITMQ_URL);

  connection.on("error", (error) => {
    console.error("RabbitMQ connection error:", error);
  });

  try {
    const channel = await connection.createChannel();
    const confirmChannel = await connection.createConfirmChannel();

    channel.on("error", (error) => {
      console.error("RabbitMQ consumer channel error:", error);
    });

    confirmChannel.on("error", (error) => {
      console.error("RabbitMQ publisher channel error:", error);
    });

    console.log("🐇 RabbitMQ connected");

    return { connection, channel, confirmChannel };
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
};
