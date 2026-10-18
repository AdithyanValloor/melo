
import amqp, {
  type ConfirmChannel,
  type ChannelModel,
} from "amqplib";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ??
  "amqp://guest:guest@localhost:5672";

interface RabbitMQSession {
  connection: ChannelModel;
  channel: ConfirmChannel;
}

let session: RabbitMQSession | null = null;
let connecting: Promise<ConfirmChannel> | null = null;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const createSession = async (): Promise<ConfirmChannel> => {
  const connection = await amqp.connect(RABBITMQ_URL);

  connection.on("error", (error) => {
    console.error("🐇 Message Service RabbitMQ connection error:", error);
  });

  try {
    const channel = await connection.createConfirmChannel();

    channel.on("error", (error) => {
      console.error("🐇 Message Service RabbitMQ channel error:", error);
    });

    const newSession: RabbitMQSession = { connection, channel };
    session = newSession;

    const invalidateSession = () => {
      if (session !== newSession) return;

      session = null;

      console.warn(
        "🐇 Message Service RabbitMQ session closed; reconnecting",
      );

      // Start recovery in the background. All callers share one attempt loop.
      void getRabbitMQChannel();
    };

    connection.once("close", invalidateSession);
    channel.once("close", invalidateSession);

    console.log("🐇 Message Service connected to RabbitMQ");

    return channel;
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
};

const connectWithRetry = async (): Promise<ConfirmChannel> => {
  let backoffMs = 1_000;

  while (true) {
    try {
      if (session) return session.channel;

      return await createSession();
    } catch (error) {
      console.error(
        `🐇 Message Service RabbitMQ connection failed. Retrying in ${backoffMs}ms:`,
        error,
      );

      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    }
  }
};

export const getRabbitMQChannel = async (): Promise<ConfirmChannel> => {
  if (session) return session.channel;

  if (!connecting) {
    connecting = connectWithRetry().finally(() => {
      connecting = null;
    });
  }

  return connecting;
};
