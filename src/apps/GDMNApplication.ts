import {AccessMode, AConnection} from "gdmn-db";
import {erExport} from "gdmn-er-bridge";
import {Application} from "../context/Application";

export class GDMNApplication extends Application {

  public async onStart(connection: AConnection): Promise<void> {
    await super.onStart(connection);

    console.time("erModel load time");
    try {
      await AConnection.executeTransaction({
        connection,
        options: {accessMode: AccessMode.READ_ONLY},
        callback: (transaction) => erExport(this.dbStructure, connection, transaction, this.erModel)
      });
    } catch (error) {
      console.warn(error);
    }
    console.log(`erModel: loaded ${Object.entries(this.erModel.entities).length} entities`);
    console.timeEnd("erModel load time");

    // if (fs.existsSync("c:/temp/test")) {
    //   fs.writeFileSync("c:/temp/test/ermodel.json", this.erModel.inspect().reduce((p, s) => `${p}${s}\n`, ""));
    //   console.log("ERModel has been written to c:/temp/test/ermodel.json");
    // }
  }
}
