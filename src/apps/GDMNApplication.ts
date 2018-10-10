import {AConnection} from "gdmn-db";
import {DataSource} from "gdmn-er-bridge";
import {Entity, StringAttribute} from "gdmn-orm";
import log4js from "log4js";
import {IDBDetail} from "../db/Database";
import {Application} from "./base/Application";

export class GDMNApplication extends Application {

  constructor(dbDetail: IDBDetail) {
    super(dbDetail, log4js.getLogger("GDMNApp"));

    // TODO verify
    this.sessionManager.emitter.on("forceClose", () => {
      if (!this.sessionManager.size()) {
        if (this.connected) {
          this.disconnect().catch(this._logger.warn);
        }
      }
    });
  }

  protected async _onCreate(connection: AConnection): Promise<void> {
    await super._onCreate(connection);

    await this.erModel.initDataSource(new DataSource(connection));

    const transaction = await this.erModel.startTransaction();
    try {

      const entity = await this.erModel.create(transaction, new Entity({
        name: "TEST", lName: {ru: {name: "Тестовая сущность"}}
      }));

      await entity.create(transaction, new StringAttribute({
        name: "TEST_FILED", lName: {ru: {name: "Тестовое поле"}}, required: true, maxLength: 150
      }));

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
    }
  }
}
