import { Room, Client, Presence } from "colyseus";
import {
  GameState, MyRoomState, Player,
  PositionMessage, ActionFromClientMessage, PlayerLostMushroomMessage,
  TargetPos
} from "./schema/MyRoomState";
import { Dispatcher } from "@colyseus/command";
import { Timmer } from "./Timmer";
import { GameRules } from "./schema/GameRules";


export class MyRoom extends Room<MyRoomState> {
  dispatcher = new Dispatcher(this);
  pauseDelay: number = 2082240000;
  //array holds information of unlocked tile 
  //0: not unlock, 1: unlock
  unlockedTileLst: number[] = Array(36).fill(0);
  //counting number of player that has voted in each face off round
  votedCouter: number = 0;
  voteMap: Map<number, number> = new Map<number, number>();
  //
  targetPos: Map<number, TargetPos> = new Map<number, TargetPos>();

  turnCter: number = 0;
  timmer: Timmer;
  onCreate(options: any) {
    console.info("*********************** ROOM CREATED ***********************");
    console.log(options);
    console.info("***********************");
    this.autoDispose = true;
    this.maxClients = 4;
    this.setState(new MyRoomState());

    this.registerMessageFromClient();
    this.setServerPause(false);
    this.timmer = new Timmer();
    this.state.gameState = GameState.waitForGameBegin;
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");
    var newPlayer = new Player(options["playerName"], this.state.numberOfPlayer);
    this.state.players.set(client.sessionId, newPlayer);
    console.log("Player[" + this.state.numberOfPlayer + "] " + options["playerName"] + " joined!");

    // Send welcome message to the client.
    client.send("welcomeMessage", "Welcome player[" + this.state.numberOfPlayer + "] " + options["playerName"] + " to Colyseus!");
    this.state.numberOfPlayer += 1;

    //if number of player is equal to maximum player , start game
    if (this.state.numberOfPlayer == GameRules.MAX_PLAYER_IN_ROOM) {
      setTimeout(() => { this.ChangeGameState(GameState.gameBegin); }, 500);

    }
  }

  onLeave(client: Client, consented: boolean) {
    this.broadcast("informAPlayerLeft", { pSlot: this.state.players.get(client.sessionId).pSlot });
    this.state.numberOfPlayer -= 1;
    this.state.players.delete(client.sessionId);
    console.log(client.sessionId, "left!");
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

    this.state.remainTimeInTurn = this.GetRemainTimeInTurn();
    switch (this.state.gameState) {
      case GameState.gameBegin:
        if (this.GetRemainTimeInTurn() < 0) {
          this.ChangeGameState(GameState.chooseTile);
        }
        break;

      case GameState.chooseTile:
        if (this.GetRemainTimeInTurn() < 0) {
          this.ChangeGameState(GameState.revealTile);
        }
        break;
      case GameState.revealTile:
        if (this.GetRemainTimeInTurn() < 0) {
          this.turnCter += 1;
          if (this.turnCter % 3 == 0) {
            this.turnCter = 0;
            this.ChangeGameState(GameState.faceOff);
          }
          else if (this.checkEndGame())
            this.ChangeGameState(GameState.gameEnd);
          else
            this.ChangeGameState(GameState.chooseTile);

        }
        break;
      case GameState.faceOff:
        if (this.votedCouter >= this.state.numberOfPlayer || this.GetRemainTimeInTurn() < 0) {
          let votedValLst: Array<number> = Array(this.state.numberOfPlayer).fill(0);
          this.voteMap.forEach((val: number) => {
            votedValLst[val] += 1;
          });
          let maxVotedPSlot: number = 0;
          let maxVotedVal: number = votedValLst[0];
          for (let i = 1; i < votedValLst.length; i++) {
            const votedVal = votedValLst[i];
            if (votedVal > maxVotedVal) {
              maxVotedVal = votedVal;
              maxVotedPSlot = i;
            }
          }
          console.log("Max voted player:" + maxVotedPSlot + " with " + maxVotedVal + " votes!");
          if (maxVotedPSlot == this.state.playerHoldMushroomIdx) {
            for (let [key, value] of this.state.players) {
              if (value.pSlot == maxVotedPSlot) {
                this.PlayerLostMushroom(value);
                break;
              }
            }
          }
          this.votedCouter = 0;
          this.ChangeGameState(GameState.chooseTile);
        }
        break;
      default:
        break;
    }
  }
  private ChangeGameState(newGameState: GameState): void {
    this.timmer.SetMarkedTimeForNewTurn();
    this.state.gameState = newGameState;
    if (newGameState == GameState.gameBegin) {
      this.state.gridValue = this.initGridValue();
      console.log("Grid value: ", this.state.gridValue.toString());
      this.timmer.StartTimmer();
    }
    else if (newGameState == GameState.chooseTile) {
      this.targetPos.clear();
    }
    else if (newGameState == GameState.revealTile) {
      //confirm target position of each player
      this.state.players.forEach((player: Player) => {
        let tarPos: TargetPos = this.targetPos.get(player.pSlot);
        if (tarPos == null) return;

        //set curr pos of player to the target pos
        player.x = tarPos.targetX;
        player.y = tarPos.targetY;
        this.broadcast("updatePlayerPos", { x: player.x, y: player.y, pSlot: player.pSlot })

        let tileSlotFromPos: number = tarPos.targetX * 6 + tarPos.targetY;
        this.unlockedTileLst[tileSlotFromPos] = 1;

        //check value of the tile that player move to
        if (tileSlotFromPos == this.state.mushroomSlot) {
          console.log("Player[" + player.pSlot + "]:" + player.pName + " has found the mushroom!");
          this.state.playerHoldMushroomIdx = player.pSlot;
        }
        else if (this.state.gridValue[tileSlotFromPos] < 0) {
          if (this.state.gridValue[tileSlotFromPos] == -2) {
            console.log("Player[" + player.pSlot + "]:" + player.pName + " unlocked a good magic tile!");
            if (this.state.goodEffectType[tileSlotFromPos] == 0) {
              console.log("Magic tile cast a spell that give position of mushroom guide!");
            }
          }
          else if (this.state.gridValue[tileSlotFromPos] == -3) {
            console.log("Player[" + player.pSlot + "]:" + player.pName + " unlocked a bad magic tile!");
            if (this.state.badEffectType[tileSlotFromPos] == 0) {
              console.log("Magic tile cast a spell that make player lost mushroom!");
              if (player.pSlot == this.state.playerHoldMushroomIdx) {
                this.PlayerLostMushroom(player);
              }
              else {
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
          player.point += this.state.gridValue[tileSlotFromPos];
        }
      });
    }
    else if (newGameState == GameState.faceOff) {
      console.log("Face off Round!");
    }
    else if (newGameState == GameState.gameEnd) {
      console.log("Game end!");
      if (this.state.playerHoldMushroomIdx > 0) {
        this.broadcast("informWinner", { pSlot: this.state.playerHoldMushroomIdx, byMushroom: true});
      }
      //chose winner by point
      else {
        let winnerSlot: number = -1;
        let maxPt: number = 0;
        this.state.players.forEach((player: Player) => {
          if (player.point > maxPt) { maxPt = player.point; winnerSlot = player.pSlot; }
        });
        this.broadcast("informWinner", { pSlot: winnerSlot,  byMushroom: false});

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
        for (const tarPos of this.targetPos.values()) {
          if (tarPos.targetX == message.x && tarPos.targetY == message.y) {
            client.send("informInvalidTargetPos", "This position is already assigned!");
            return;
          }
        }

        this.targetPos.set(player.pSlot, { targetX: message.x, targetY: message.y });
        console.log("Player[" + message.pSlot + "]:" + player.pName + " will move to position: " + "(" + player.x + "," + player.y + ")");
        this.broadcast("informTargetPos",
          {
            x: message.x,
            y: message.y,
            pSlot: message.pSlot,
          },
        );
      }


    });

    this.onMessage("endGame", (client, message: ActionFromClientMessage) => {
      console.log("Player[" + message.pSlot + "] has won the game!");
      this.broadcast("informAPlayerEndGame", { pSlot: message.pSlot });
    })
    this.onMessage("playerLostMushroom", (client, message: PlayerLostMushroomMessage) => {
      console.log("Player[" + message.playerLostSlot + "] has lost the mushroom!");
      this.state.mushroomSlot = message.mrNewPosX * 6 + message.mrNewPosY;
      this.broadcast("informAPlayerLostMushroom", { pSlot: message.playerLostSlot }); //give slot of player that has lost mushroom
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
      this.broadcast("informChat", { pSlot: message.pSlot, msg: message.msg });
    })
  }
  private setServerPause(pause: boolean) {
    if (pause) {
      this, this.setSimulationInterval(dt => this.gameLoop(dt), this.pauseDelay);
    }
    else {
      this.setSimulationInterval(dt => this.gameLoop(dt));
    }
  }
  private initGridValue(): Array<number> {
    let array: number[] = Array(36).fill(0);
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
        }
        else {
          array[rdIndex] = -3;
          this.state.badEffectType[rdIndex] = 0; //0: give mushroom pos guide
        }
        numOfEffectTile -= 1;
      }
    }
    return array;
  }
  private GetRemainTimeInTurn(): number {
    let durFromBgTurn = this.timmer.GetDurFromBeginingTurn();
    if (this.state.gameState == GameState.chooseTile) {
      return GameRules.CHOOSE_TILE_DURATION - durFromBgTurn;
    }
    else if (this.state.gameState == GameState.revealTile) {
      return GameRules.REVEAL_TILE_DURATION - durFromBgTurn;

    }
    else if (this.state.gameState == GameState.gameBegin) {
      return GameRules.GAME_BEGIN_DURATION - durFromBgTurn;
    }
    else if (this.state.gameState == GameState.faceOff) {
      return GameRules.FACE_OFF_DURATION - durFromBgTurn;
    }
  }
  private PlayerLostMushroom(player: Player): void {
    this.state.playerHoldMushroomIdx = -1;
    var isSet: boolean = false;
    while (!isSet) {
      var rdNewMushroomSlot = Math.floor(Math.random() * 36);
      if (this.state.gridValue[rdNewMushroomSlot] > 0 && this.unlockedTileLst[rdNewMushroomSlot] == 0) {
        this.state.mushroomSlot = rdNewMushroomSlot;
        isSet = true;
      }
    }
    this.broadcast("informPlayerGetALostMushroomSpell", {
      playerGetSpellSlot: player.pSlot,
      mushroomGetLost: 1
    }, { afterNextPatch: false });
  }
  private checkEndGame(): boolean {
    let unlockTileCter: number = 0;
    this.unlockedTileLst.forEach((val: number) => { if (val == 1) unlockTileCter += 1 });
    //the game end in the following condition
    //remaining unlocked tile is less than number of player
    if (36 - GameRules.NUMBER_OF_EMPTY_TILE - unlockTileCter < this.state.numberOfPlayer) {
      return true;
    }
  }
}
