import {Application} from "./Application";
import {IDBDetail} from "../db/Database";

export class GDMNApplication extends Application {

  constructor(dbDetail: IDBDetail) {
    super(dbDetail);
  }
}
