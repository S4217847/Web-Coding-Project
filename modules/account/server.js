/**
 * HTTP entry point for RMIT Connect.
 *
 * Running this file starts the server. Importing it exposes the app factory and
 * data reset seam without opening a port, which keeps automated tests isolated.
 */
import path from "node:path";

import {
    fileURLToPath
} from "node:url";

import {
    createApp
} from "./src/app.js";

const port = Number.parseInt(
    process.env.PORT ?? "3000",
    10
);

const host =
    process.env.HOST ?? "127.0.0.1";

const isEntryPoint =
    process.argv[1] &&
    path.resolve(process.argv[1]) ===
        fileURLToPath(import.meta.url);

// Guarding the listener lets tests import createApp() without starting a server.
if (isEntryPoint) {
    const app = createApp();

    app.listen(port, host, () => {
        console.log(
            `RMIT Connect is running at http://${host}:${port}`
        );
    });
}

export {
    createApp
} from "./src/app.js";

export {
    dataStore,
    resetData
} from "./src/data.js";
