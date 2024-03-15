export class Timmer {
    constructor() {
    }
    public startTime: number = 0;
    public currTime: number = 0;
    public lastMarkedTime: number = 0;
    public StartTimmer(): void {
        this.startTime = 0;
        this.currTime = 0;
    }
    public UpdateTimmer(deltaTime: number): void {
        this.currTime += deltaTime;
    }
    //return time in second
    private GetCurrTime(): number {
        return Math.ceil(this.currTime / 1000);
    }
    public SetMarkedTimeForNewTurn(): void {
        this.lastMarkedTime = this.GetCurrTime();
    }
    public GetDurFromBeginingTurn(): number {
        return this.GetCurrTime() - this.lastMarkedTime;
    }
    public GetDurFromStartGame(): number { 
        return this.GetCurrTime() - this.startTime;
    }
}