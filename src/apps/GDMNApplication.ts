import {AConnection} from "gdmn-db";
import {DataSource} from "gdmn-er-bridge";
import {Entity, StringAttribute} from "gdmn-orm";
import {IDBDetail} from "../db/Database";
import {Application} from "./Application";

export class GDMNApplication extends Application {

  constructor(dbDetail: IDBDetail) {
    super(dbDetail);
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
