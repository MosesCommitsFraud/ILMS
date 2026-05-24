import { createRpcClient } from "@ilms/client-runtime";

import { resolveWsUrl } from "../env";

export const rpc = createRpcClient({ url: () => resolveWsUrl() });
