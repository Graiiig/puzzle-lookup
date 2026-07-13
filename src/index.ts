import { closeBrowser } from "./browser.js";
import { assertConfig, config } from "./config.js";
import { buildServer } from "./server.js";

assertConfig();

const app = buildServer();

async function shutdown(): Promise<void> {
  await app.close();
  await closeBrowser();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app
  .listen({ host: config.host, port: config.port })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
