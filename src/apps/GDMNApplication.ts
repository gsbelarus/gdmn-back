import {AConnection} from "gdmn-db";
import {ERBridge} from "gdmn-er-bridge";
import {Entity, ERModel, StringAttribute} from "gdmn-orm";
import {IDBDetail} from "../db/Database";
import {Application} from "./Application";

export class GDMNApplication extends Application {

  constructor(dbDetail: IDBDetail) {
    super(dbDetail);
  }

  protected async _onCreate(_connection: AConnection): Promise<void> {
    await super._onCreate(_connection);
    const erModel = ERBridge.completeERModel(new ERModel());

    const testEntity = ERBridge.addEntityToERModel(erModel, new Entity({
      name: "TEST", lName: {ru: {name: "Тестовая сущность"}}
    }));

    testEntity.add(new StringAttribute({
      name: "TEST_FILED", lName: {ru: {name: "Тестовое поле"}}, required: true, maxLength: 150
    }));

    await new ERBridge(_connection).importToDatabase(erModel);
  }
}
