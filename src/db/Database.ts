import {
  AConnection,
  AConnectionPool,
  ADriver,
  ICommonConnectionPoolOptions,
  IConnectionOptions,
  TExecutor
} from "gdmn-db";

export interface IDBDetail<ConnectionOptions extends IConnectionOptions = IConnectionOptions> {
  alias: string;
  driver: ADriver;
  connectionOptions: ConnectionOptions;
  poolOptions: ICommonConnectionPoolOptions;
}

export abstract class Database {

  private readonly _dbDetail: IDBDetail;
  private readonly _connectionPool: AConnectionPool<ICommonConnectionPoolOptions>;

  private _isBusy: boolean = false;

  protected constructor(dbDetail: IDBDetail) {
    this._dbDetail = dbDetail;
    this._connectionPool = dbDetail.driver.newCommonConnectionPool();
  }

  get busy(): boolean {
    return this._isBusy;
  }

  get dbDetail(): IDBDetail {
    return this._dbDetail;
  }

  get connectionPool(): AConnectionPool<ICommonConnectionPoolOptions> {
    return this._connectionPool;
  }

  get connected(): boolean {
    return this._connectionPool.created;
  }

  public async create(): Promise<void> {
    this._checkBusy();

    this._isBusy = true;
    try {
      if (this._connectionPool.created) {
        throw new Error("Database already created");
      }
      const {driver, connectionOptions}: IDBDetail = this._dbDetail;
      console.log(`\nCreate '${connectionOptions.host}:${connectionOptions.port}/${connectionOptions.path}'`);
      const connection = driver.newConnection();
      await connection.createDatabase(connectionOptions);
      await this._onCreate(connection);
      await connection.disconnect();
    } finally {
      this._isBusy = false;
    }
    await this.connect();
  }

  public async delete(): Promise<void> {
    const {driver, connectionOptions}: IDBDetail = this._dbDetail;
    if (this._connectionPool.created) {
      await this.disconnect();
    }
    this._isBusy = true;
    try {
      const connection = driver.newConnection();
      await connection.connect(connectionOptions);
      await this._onDelete(connection);
      await connection.dropDatabase();
    } finally {
      this._isBusy = false;
    }
  }

  public async connect(): Promise<void> {
    this._checkBusy();

    this._isBusy = true;
    try {
      if (this._connectionPool.created) {
        throw new Error("Database already connected");
      }
      const {connectionOptions, poolOptions}: IDBDetail = this._dbDetail;
      console.log(`\nConnect '${connectionOptions.host}:${connectionOptions.port}/${connectionOptions.path}'`);
      await this._connectionPool.create(connectionOptions, poolOptions);
      await this._onConnect();
    } finally {
      this._isBusy = false;
    }
  }

  public async disconnect(): Promise<void> {
    this._checkBusy();

    this._isBusy = true;
    try {
      if (!this._connectionPool.created) {
        throw new Error("Database is not connected");
      }
      await this._onDisconnect();
      await this._connectionPool.destroy();
    } finally {
      this._isBusy = false;
    }
  }

  public async executeConnection<R>(callback: TExecutor<AConnection, R>): Promise<R> {
    this._checkBusy();

    return await this._executeConnection(callback);
  }

  protected async _executeConnection<R>(callback: TExecutor<AConnection, R>): Promise<R> {
    return await AConnectionPool.executeConnection({
      connectionPool: this._connectionPool,
      callback
    });
  }

  protected _checkBusy(): void | never {
    if (this._isBusy) {
      throw new Error("Database is busy");
    }
  }

  protected async _onCreate(_connection: AConnection): Promise<void> {
    // empty
  }

  protected async _onDelete(_connection: AConnection): Promise<void> {
    // empty
  }

  protected async _onConnect(): Promise<void> {
    // empty
  }

  protected async _onDisconnect(): Promise<void> {
    // empty
  }
}
