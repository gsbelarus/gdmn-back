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

  protected constructor(dbDetail: IDBDetail) {
    this._dbDetail = dbDetail;
    this._connectionPool = dbDetail.driver.newCommonConnectionPool();
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
    if (this._connectionPool.created) {
      throw new Error("Database already created");
    }
    const {driver, connectionOptions}: IDBDetail = this._dbDetail;
    const connection = driver.newConnection();
    await connection.createDatabase(connectionOptions);
    await this._onCreate(connection);
    await connection.disconnect();
    await this.connect();
  }

  public async delete(): Promise<void> {
    const {driver, connectionOptions}: IDBDetail = this._dbDetail;
    if (this._connectionPool.created) {
      await this.disconnect();
    }
    const connection = driver.newConnection();
    await connection.connect(connectionOptions);
    await this._onDelete(connection);
    await connection.dropDatabase();
  }

  public async connect(): Promise<void> {
    if (this._connectionPool.created) {
      throw new Error("Database already connected");
    }
    const {connectionOptions, poolOptions}: IDBDetail = this._dbDetail;
    console.log(JSON.stringify(connectionOptions));
    await this._connectionPool.create(connectionOptions, poolOptions);
    await this._onConnect();
  }

  public async disconnect(): Promise<void> {
    if (!this._connectionPool.created) {
      throw new Error("Database is not connected");
    }
    await this._onDisconnect();
    await this._connectionPool.destroy();
  }

  public async executeConnection<R>(callback: TExecutor<AConnection, R>): Promise<R> {
    return await AConnectionPool.executeConnection({
      connectionPool: this._connectionPool,
      callback
    });
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
