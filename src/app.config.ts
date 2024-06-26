import config from "@colyseus/tools";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";

/**
 * Import your Room files
 */
import auth from "./config/auth";
import { MyRoom } from "./rooms/MyRoom";

export default config({
    getId: () => "Your Colyseus App",

    options: {
    },

    initializeTransport: (options) => new WebSocketTransport(options),

    // initializeGameServer: (gameServer) => {
    //     /**
    //      * Define your room handlers:
    //      */
    //     gameServer.define('room', MyRoom);
    // },
    initializeGameServer: (gameServer) => {
        gameServer.define("my_room", MyRoom).enableRealtimeListing();
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
