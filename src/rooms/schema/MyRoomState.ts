import { MapSchema, Schema, Context, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") pName: string = "Unknown";
  @type("number") pSlot: number;
  @type("number") point: number = 0;
  /**
   *
   */
  constructor(_name: string, _pSlot: number) {
    super();
    this.pName = _name;
    this.pSlot = _pSlot;
  }

}

export class MyRoomState extends Schema {
  @type({ map: Player })
  players: MapSchema<Player> = new MapSchema<Player>();
  @type("number") numberOfPlayer: number = 0;
  @type("number") playerHoldMushroomIdx: number = -1;
  @type("number") mushroomSlot: number = -1;
  @type(["number"]) gridValue: number[] = Array(36).fill(0);
  //0: give mushroom pos guide, 1:...
  @type({map: "number"}) goodEffectType: number[] = Array(4).fill(0);
  //0: lost mushroom, 1:...
  @type({map: "number"}) badEffectType: number[] = Array(4).fill(0);
  @type("string") gameState: string = "waitForGameBegin";
  @type("number") remainTimeInTurn: number = 0;
  @type("number") gameTotalTime: number = 0;

}
export enum GameState {
  waitForGameBegin = "waitForGameBegin",
  gameBegin = "gameBegin",
  chooseTile = "chooseTile",
  revealTile = "revealTile",
  faceOff = "faceOff",
  gameEnd = "gameEnd",
}
export type PositionMessage = {
  x: number,
  y: number
  pSlot: number;
}
export type ActionFromClientMessage = {
  pSlot: number;
}

export type PlayerLostMushroomMessage = {
  mrNewPosX: number,
  mrNewPosY: number,
  playerLostSlot: number,
}
export type TargetTile = {
  targetX: number,
  targetY: number
}