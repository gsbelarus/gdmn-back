export type IProgressListener = (progress: Progress) => void;

export interface IProgressOptions {
  readonly min?: number;
  readonly max?: number;
}

export class Progress {

  public static readonly DEFAULT_MAX = 100;
  public static readonly DEFAULT_MIN = 0;

  private readonly _max: number;
  private readonly _min: number;
  private readonly _progressListener?: IProgressListener;

  private _value: number;
  private _description: string;

  constructor(options: IProgressOptions = {}, _progressListener?: IProgressListener) {
    this._max = options.max !== undefined ? options.max : Progress.DEFAULT_MAX;
    this._min = options.min !== undefined ? options.min : Progress.DEFAULT_MIN;
    if (this._min >= this._max) {
      throw new Error(`Incorrect range: ${this._min} >= ${this._max}`);
    }
    this._value = this._min;
    this._description = "";
    this._progressListener = _progressListener;
  }

  get value(): number {
    return this._value;
  }

  get max(): number {
    return this._max;
  }

  get min(): number {
    return this._min;
  }

  get description(): string {
    return this._description;
  }

  get done(): boolean {
    return this._value === this._max;
  }

  public increment(step: number, description: string): void {
    const i = step !== undefined ? Math.abs(step) : 1;
    if (this._value + i > this._max) {
      throw new Error("Out of range");
    }
    this._value += i;
    this._description = description;
    this.notify();
  }

  public reset(): void {
    this._value = this._min;
    this._description = "";
    this.notify();
  }

  private notify(): void {
    if (this._progressListener) {
      this._progressListener(this);
    }
  }
}
