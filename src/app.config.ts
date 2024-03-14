import config from "@colyseus/tools";

import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";

// import { RedisDriver } from "@colyseus/redis-driver";
// import { RedisPresence } from "@colyseus/redis-presence";

/**
 * Import your Room files
 */
import auth from "./config/auth";
import { MyRoom } from "./rooms/MyRoom";

export default config({
    getId: () => "Your Colyseus App",

    options: {
        // devMode: true,
        // driver: new RedisDriver(),
        // presence: new RedisPresence(),
    },

    initializeTransport: (options) => new WebSocketTransport(options),

    initializeGameServer: (gameServer) => {
        /**
         * Define your room handlers:
         */
        gameServer.define('room1', MyRoom);
        gameServer.define('room2', MyRoom);
        gameServer.define('room3', MyRoom);
        gameServer.define('room4', MyRoom);
        gameServer.define('room5', MyRoom);
        gameServer.define('room6', MyRoom);
        gameServer.define('room7', MyRoom);
        gameServer.define('room8', MyRoom);
        gameServer.define('room9', MyRoom);
        gameServer.define('room10', MyRoom);
    },

    initializeExpress: (app) => {
        /**
         * Bind your custom express routes here:
         */
        app.get("/", (req, res) => {
            res.send(`Instance ID => ${process.env.NODE_APP_INSTANCE ?? "NONE"}`);
        });

        /**
         * Bind @colyseus/monitor
         * It is recommended to protect this route with a password.
         * Read more: https://docs.colyseus.io/tools/monitor/
         */
        app.use("/colyseus", monitor());

        // Bind auth routes
        app.use(auth.prefix, auth.routes());
    },


    beforeListen: () => {
        /**
         * Before before gameServer.listen() is called.
         */
    }
});
