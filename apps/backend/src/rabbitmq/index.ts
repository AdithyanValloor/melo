import { startGroupRabbitMQConsumer } from "./consumers/group.consumer.js";
import { startMediaRabbitMQConsumer } from "./consumers/media.consumer.js";
import { startMessageRabbitMQConsumer } from "./consumers/message.consumer.js";
import { startNotificationRabbitMQConsumer } from "./consumers/notification.consumer.js";
import { connectRabbitMQ } from "./connection.js";
import { setupRabbitMQTopology } from "./topology.js";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const startRabbitMQConsumers = async (): Promise<void> => {
  let backoffMs = 1_000;

  while (true) {
    let connection:
      Awaited<ReturnType<typeof connectRabbitMQ>>["connection"]
      | null = null;

    try {
      const session = await connectRabbitMQ();

      connection = session.connection;
      const { channel, confirmChannel } = session;

      const sessionClosed = new Promise<void>((resolve) => {
        let settled = false;

        const onClose = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        connection!.once("close", onClose);
        channel.once("close", onClose);
        confirmChannel.once("close", onClose);
      });

      await setupRabbitMQTopology(channel);

      await startMessageRabbitMQConsumer(channel, confirmChannel);
      await startGroupRabbitMQConsumer(channel);
      await startMediaRabbitMQConsumer(channel);
      await startNotificationRabbitMQConsumer(channel);

      console.log("🐇 All RabbitMQ consumers registered");
      backoffMs = 1_000;

      // Keep this session alive until its connection or a channel closes.
      await sessionClosed;

      console.warn("RabbitMQ disconnected");
    } catch (error) {
      console.error("RabbitMQ startup/recovery failed:", error);
    } finally {
      if (connection) {
        await connection.close().catch(() => undefined);
      }
    }

    console.log(`Retrying RabbitMQ in ${backoffMs}ms`);

    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }
};
