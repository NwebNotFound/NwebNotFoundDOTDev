// Disposable comparison launcher; copy to the ai-panel root inside the test container.
import { spawn } from "node:child_process";
import { startMockHermes, PANEL_SECRET } from "./test/helpers.mjs";

const mock = await startMockHermes();
mock.state.approvalInStream = true;
const server = spawn(process.execPath, ["scripts/dev-server.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: "8788",
    SESSION_SECRET: "dev-only-session-secret-0000000000000000",
    ALLOWED_DISCORD_ID: "111111111111111111",
    PANEL_HOST: "localhost:8788",
    HERMES_ORIGIN: mock.url,
    HERMES_PANEL_SECRET: PANEL_SECRET,
  },
});
process.on("SIGTERM", async () => {
  server.kill();
  await mock.close();
  process.exit(0);
});
