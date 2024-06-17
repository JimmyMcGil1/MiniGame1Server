import { Room, Client } from "colyseus";
import {
    GameState, MyRoomState, Player,
    PositionMessage, ActionFromClientMessage, PlayerLostMushroomMessage,
    TargetTile
} from "./schema/MyRoomState";
import { Timmer } from "./Timmer";
import { GameRules } from "./schema/GameRules";


export class MyRoom extends Room<MyRoomState> {
    pauseDelay: number = 2082240000;
    //array holds information of unlocked tile
    //0: not unlock, 1: unlock
    unlockedTileLst: number[] = Array(49).fill(0);
    //counting number of player that has voted in each face off round
    votedCouter: number = 0;
    voteMap: Map<number, number> = new Map<number, number>();
    //
    targetTileMap: Map<number, TargetTile> = new Map<number, TargetTile>();

    turnCter: number = 0;
    timmer: Timmer;

    onCreate(options: any) {
        console.info("*********************** ROOM CREATED ***********************");
        console.log(options);
        console.info("***********************");
        this.maxClients = 4;
        this.setState(new MyRoomState());
        this.roomId = options.roomId;
        this.registerMessageFromClient();
        this.setServerPause(false);
        this.timmer = new Timmer();
        this.state.gameState = GameState.waitForGameBegin;
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        let pName: string = this.state.numberOfPlayer > 0 ? options["playerName"] : options["creatorId"];
        let newPlayer = new Player(pName, this.state.numberOfPlayer);
        this.state.players.set(client.sessionId, newPlayer);
        console.log("Player[" + this.state.numberOfPlayer + "] " + pName + " joined!");

        // Send welcome message to the client.
        client.send("welcomeMessage", "Welcome player[" + this.state.numberOfPlayer + "] " + pName + " to Colyseus!");
        this.state.numberOfPlayer += 1;

        console.log(`set metadata player${this.state.numberOfPlayer}` + pName);
         this.setMetadata({ [`player${this.state.numberOfPlayer}`]: pName });
        //if number of player is equal to maximum player , start game
        if (this.state.numberOfPlayer == GameRules.MAX_PLAYER_IN_ROOM) {
            setTimeout(() => {
                this.ChangeGameState(GameState.gameBegin);
            }, 500);

        }
    }

    onLeave(client: Client, consented: boolean) {
        this.broadcast("informAPlayerLeft", { pSlot: this.state.players.get(client.sessionId).pSlot });
        this.state.numberOfPlayer -= 1;
        this.state.players.delete(client.sessionId);
        console.log(client.sessionId, "left!");
        if (this.state.numberOfPlayer <= 1) {
            this.ChangeGameState(GameState.gameEnd);
        }
        if (this.state.numberOfPlayer == 0) {
            this.disconnect();
        }
    }

    onDispose() {
    console.log("room", this.roomId, "disposing...");
    }

    /*
    *
    */
    gameLoop(deltaTime: number) { //deltattime in milisecond
        if (this.state.gameState == GameState.waitForGameBegin) {
            return;
        }
        this.timmer.UpdateTimmer(deltaTime);

        this.state.remainTimeInTurn = this.getRemainTimeInTurn();
        this.state.gameTotalTime = this.timmer.GetDurFromStartGame();
        if (this.getRemainTimeInTurn() < 0) {
            switch (this.state.gameState) {
                case GameState.gameBegin:
                    this.ChangeGameState(GameState.chooseTile);
                    break;

                case GameState.chooseTile:
                    this.ChangeGameState(GameState.revealTile);
                    break;
                case GameState.revealTile:
                    this.turnCter += 1;
                    if (this.turnCter % 3 == 0) {
                        this.turnCter = 0;
                        this.ChangeGameState(GameState.faceOff);
                    } else if (this.checkEndGame())
                        this.ChangeGameState(GameState.gameEnd);
                    else
                        this.ChangeGameState(GameState.chooseTile);

                    break;
                case GameState.faceOff:
                    let votedValLst: Array<number> = Array(this.state.numberOfPlayer).fill(0);
                    this.voteMap.forEach((val: number) => {
                        votedValLst[val] += 1;
                    });
                    let maxVotedPSlot: number = -1;
                    let maxVotedVal: number = 0;
                    let isOnlyOneMax: boolean = false;
                    for (let i = 0; i < votedValLst.length; i++) {
                        const votedVal = votedValLst[i];
                        if (votedVal > maxVotedVal) {
                            maxVotedVal = votedVal;
                            maxVotedPSlot = i;
                            isOnlyOneMax = true
                        } else if (votedVal == maxVotedVal) {
                            isOnlyOneMax = false;
                        }
                    }
                    if (maxVotedPSlot >= 0 && isOnlyOneMax) {
                        console.log("Max voted player:" + maxVotedPSlot + " with " + maxVotedVal + " votes!");
                        if (maxVotedPSlot == this.state.playerHoldMushroomIdx) {
                            for (let [key, value] of this.state.players) {
                                if (value.pSlot == maxVotedPSlot) {
                                    this.playerLostMushroom(value);
                                    break;
                                }
                            }
                        }
                    } else
                        console.log("Not found highest voted player!");


                    //pVal: player that has been voted by player pKey
                    this.voteMap.forEach((pVal: number, pKey: number) => {
                        if (pVal == maxVotedPSlot && isOnlyOneMax) {
                            let client: Client = this.getClientByPSlot(pKey);
                            let player: Player = this.state.players.get(client.sessionId);
                            player.point += GameRules.BONUS_POINT_FOR_VOTE_RIGHT;
                            client.send("voteResult", "Bạn đã chọn đúng người giữ nấm, bạn được thưởng " + GameRules.BONUS_POINT_FOR_VOTE_RIGHT + " điểm!");
                        } else {
                            let client: Client = this.getClientByPSlot(pKey);
                            if (client == null) return;
                            client.send("voteResult", "Lần tới, chúng ta sẽ tìm được người giữ nấm!");
                        }
                    });
                    this.votedCouter = 0;
                    this.voteMap.clear();
                    this.ChangeGameState(GameState.chooseTile);
                    break;
                default:
                    break;
            }
        }
    }

    private ChangeGameState(newGameState: GameState): void {
        this.timmer.SetMarkedTimeForNewTurn();
        this.state.gameState = newGameState;
        if (newGameState == GameState.gameBegin) {
            this.state.gridValue = this.initGridValue();
            this.timmer.StartTimmer();
        } else if (newGameState == GameState.chooseTile) {
            this.targetTileMap.clear();
        } else if (newGameState == GameState.revealTile) {
            //confirm target position of each player
            this.state.players.forEach((player: Player, clientId: string) => {
                let pTarTile: TargetTile = this.targetTileMap.get(player.pSlot);
                if (pTarTile == null) return;

                //set curr pos of player to the target pos
                player.x = pTarTile.targetX;
                player.y = pTarTile.targetY;
                this.broadcast("updatePlayerPos", { x: player.x, y: player.y, pSlot: player.pSlot })


            });
        } else if (newGameState == GameState.faceOff) {
            console.log("Face off Round!");
        } else if (newGameState == GameState.gameEnd) {
            console.log("Game end!");
            //if there is only a play in this room
            if (this.state.numberOfPlayer == 1) {
                let player: Player = this.state.players.values().next().value;
                this.broadcast("informSpecialWinner", "Mọi người chơi đã rời bàn| Người chơi '" + player.pName + "' thắng");
            }

            if (this.state.playerHoldMushroomIdx >= 0) {
                this.broadcast("informWinner", { pSlot: this.state.playerHoldMushroomIdx, byMushroom: true });
            }
            //chose winner by point
            else {
                let winnerSlot: number = -1;
                let maxPt: number = 0;
                this.state.players.forEach((player: Player) => {
                    if (player.point > maxPt) {
                        maxPt = player.point;
                        winnerSlot = player.pSlot;
                    }
                });
                this.broadcast("informWinner", { pSlot: winnerSlot, byMushroom: false });

            }
        }


    }

    private registerMessageFromClient() {
        //register message from client

        // Listen to target position  from the client.
        this.onMessage("targetPosition", (client: Client, message: PositionMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (this.state.gameState == GameState.chooseTile) {
                //check if target position is already assigned
                for (const tarPos of this.targetTileMap.values()) {
                    if (tarPos.targetX == message.x && tarPos.targetY == message.y) {
                        client.send("informInvalidTargetPos", "Ô đất này đã được chọn rồi!");
                        return;
                    }
                }

                this.targetTileMap.set(player.pSlot, { targetX: message.x, targetY: message.y });
                console.log("Player[" + message.pSlot + "]:" + player.pName + " will move to position: " + "(" + message.x + "," + message.y + ")");
                this.broadcast("informTargetPos",
                    {
                        x: message.x,
                        y: message.y,
                        pSlot: message.pSlot,
                    },
                );
            }


        });


        this.onMessage("votedPlayer", (client, message: ActionFromClientMessage) => {
            if (this.state.gameState == GameState.faceOff) {
                let clientVote: Player = this.state.players.get(client.sessionId);
                console.log("Player '" + clientVote.pName + "' has voted " + message.pSlot + " as the player holding mushroom!");
                this.voteMap.set(clientVote.pSlot, message.pSlot);
                this.votedCouter += 1;
            }
        });
        this.onMessage("sendChat", (client, message) => {
            this.broadcast("informChat", { pSlot: message.pSlot, msg: message.msg }, { except: client });
        });
        this.onMessage("stopMove", (client, message: ActionFromClientMessage) =>{
                let player: Player = this.state.players.get(client.sessionId);

                let tileSlotFromPos: number = player.x * GameRules.NUMBER_OF_AXIS_LENGTH + player.y;
                this.unlockedTileLst[tileSlotFromPos] = 1;

                //check value of the tile that player move to
                if (tileSlotFromPos == this.state.mushroomSlot) {
                    console.log("Player[" + player.pSlot + "]:" + player.pName + " has found the mushroom!");
                    this.state.playerHoldMushroomIdx = player.pSlot;
                } else if (this.state.gridValue[tileSlotFromPos] < 0) {
                    if (this.state.gridValue[tileSlotFromPos] == -2) {
                        console.log("Player[" + player.pSlot + "]:" + player.pName + " unlocked a good magic tile!");
                        if (this.state.goodEffectType[tileSlotFromPos] == 0) {
                            let guide: string = "";
                            if (this.state.playerHoldMushroomIdx >= 0) {
                                guide = "Một người chơi đang giữ nấm!";
                            } else {
                                let col: number = Math.floor(this.state.mushroomSlot / GameRules.NUMBER_OF_AXIS_LENGTH);
                                guide = "Nấm đang ở cột " + col + 1;
                            }
                            client.send("informMushroomGuide", guide);
                            console.log("Magic tile cast a spell that give position of mushroom guide!");
                        }
                    } else if (this.state.gridValue[tileSlotFromPos] == -3) {
                        console.log("Player[" + player.pSlot + "]:" + player.pName + " unlocked a bad magic tile!");
                        if (this.state.badEffectType[tileSlotFromPos] == 0) {
                            console.log("Magic tile cast a spell that make player lost mushroom!");
                            if (player.pSlot == this.state.playerHoldMushroomIdx) {
                                this.playerLostMushroom(player);
                            } else {
                                this.broadcast("informPlayerGetALostMushroomSpell", {
                                    playerGetSpellSlot: player.pSlot,
                                    mushroomGetLost: 0
                                }, { afterNextPatch: false });
                            }
                        }
                    }
                }
                //unlock a point tile
                else {
                    console.log("   [-]Point of " + tileSlotFromPos + ":" + this.state.gridValue[tileSlotFromPos]);
                    player.point += this.state.gridValue[tileSlotFromPos];
                }
        })
    }

    private setServerPause(pause: boolean) {
        if (pause) {
            this, this.setSimulationInterval(dt => this.gameLoop(dt), this.pauseDelay);
        } else {
            this.setSimulationInterval(dt => this.gameLoop(dt));
        }
    }

    private initGridValue(): Array<number> {
        let array: number[] = Array(GameRules.NUMBER_OF_AXIS_LENGTH ** 2).fill(0);
        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 3) + 1;
        }
        var numOfEmptyTile = GameRules.NUMBER_OF_EMPTY_TILE;
        while (numOfEmptyTile > 0) {
            let rdIndex = Math.floor(Math.random() * 36);
            if (array[rdIndex] > 0) {
                array[rdIndex] = -1;
                numOfEmptyTile -= 1;
            }
        }
        var numOfMushroom = 1;
        while (numOfMushroom > 0) {
            let rdIndex = Math.floor(Math.random() * 36);
            if (array[rdIndex] > 0) {
                array[rdIndex] = 0;
                this.state.mushroomSlot = rdIndex;
                numOfMushroom -= 1;
            }
        }
        var numOfEffectTile = 8;
        var numOfGoodEffectTile = 4
        while (numOfEffectTile > 0) {
            let rdIndex = Math.floor(Math.random() * 36);
            if (array[rdIndex] > 0) {
                if (numOfGoodEffectTile > 0) {
                    array[rdIndex] = -2;
                    this.state.goodEffectType[rdIndex] = 0; //0: give mushroom pos guide
                    //if make more good effect type, need to change this to random
                    numOfGoodEffectTile -= 1;
                } else {
                    array[rdIndex] = -3;
                    this.state.badEffectType[rdIndex] = 0; //0: give mushroom pos guide
                }
                numOfEffectTile -= 1;
            }
        }
        return array;
    }

    private getRemainTimeInTurn(): number {
        let durFromBgTurn = this.timmer.GetDurFromBeginingTurn();
        if (this.state.gameState == GameState.chooseTile) {
            return GameRules.CHOOSE_TILE_DURATION - durFromBgTurn;
        } else if (this.state.gameState == GameState.revealTile) {
            return GameRules.REVEAL_TILE_DURATION - durFromBgTurn;

        } else if (this.state.gameState == GameState.gameBegin) {
            return GameRules.GAME_BEGIN_DURATION - durFromBgTurn;
        } else if (this.state.gameState == GameState.faceOff) {
            return GameRules.FACE_OFF_DURATION - durFromBgTurn;
        }
    }

    private playerLostMushroom(player: Player): void {
        this.state.playerHoldMushroomIdx = -1;
        var isSet: boolean = false;
        while (!isSet) {
            var rdNewMushroomSlot = Math.floor(Math.random() * 36);
            if (this.state.gridValue[rdNewMushroomSlot] > 0 && this.unlockedTileLst[rdNewMushroomSlot] == 0) {
                this.state.mushroomSlot = rdNewMushroomSlot;
                isSet = true;
            }
        }
        this.broadcast("informPlayerGetALostMushroom", {
            playerGetSpellSlot: player.pSlot,
            mushroomGetLost: 1
        }, { afterNextPatch: false });
    }

    private checkEndGame(): boolean {
        let unlockTileCter: number = 0;
        this.unlockedTileLst.forEach((val: number) => {
            if (val == 1) unlockTileCter += 1
        });
        //the game end in the following condition
        //remaining unlocked tile is less than number of player
        if (36 - GameRules.NUMBER_OF_EMPTY_TILE - unlockTileCter < this.state.numberOfPlayer) {
            return true;
        }
    }

    private getClientByPSlot(pSlot: number): Client {
        let client: Client = null;
        this.state.players.forEach((player: Player, clientId: string) => {
            if (player.pSlot == pSlot) {
                client = this.clients.getById(clientId);
                return client;
            }
        })
        return client;
    }
}
