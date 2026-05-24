import { app } from "./index";

const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? "4242", 10);

app.listen(DEFAULT_PORT);
console.log(`ILMS_SERVER_LISTENING port=${app.server?.port ?? DEFAULT_PORT}`);
