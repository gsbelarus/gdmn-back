import {AConnection} from "gdmn-db";
import {ERBridge} from "gdmn-er-bridge";
import {Entity, StringAttribute} from "gdmn-orm";
import {IDBDetail} from "../db/Database";
import {Application} from "./Application";

export class GDMNApplication extends Application {

  constructor(dbDetail: IDBDetail) {
    super(dbDetail);
  }

  protected async _onCreate(_connection: AConnection): Promise<void> {
    await super._onCreate(_connection);

    await AConnection.executeTransaction({
      connection: _connection,
      callback: async (transaction) => {
        const builder = await ERBridge.getERModelBuilder();
        await builder.prepare(_connection, transaction);
        try {
          const erModel = await builder.initERModel();

          const entity = await builder.addEntity(erModel, new Entity({
            name: "TEST", lName: {ru: {name: "Тестовая сущность"}}
          }));

          await builder.entityBuilder.addAttribute(entity, new StringAttribute({
            name: "TEST_FILED", lName: {ru: {name: "Тестовое поле"}}, required: true, maxLength: 150
          }));
        } finally {
          if (builder.prepared) {
            await builder.dispose();
          }
        }
      }
    });
  }
}
