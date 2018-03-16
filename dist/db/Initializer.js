"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gdmn_db_1 = require("gdmn-db");
class Initializer {
    static async init(options) {
        try {
            await gdmn_db_1.FirebirdDatabase.executeTransaction(new gdmn_db_1.FirebirdDatabase(), options, async (transaction) => {
                const fields = await transaction.query(`
                        SELECT 
                            TRIM(f.RDB$FIELD_NAME)                              AS RDB$FIELD_NAME,
                            f.RDB$FIELD_TYPE,
                            f.RDB$NULL_FLAG 
                        FROM RDB$FIELDS f
                    `);
                const relationFields = await transaction.query(`
                        SELECT
                            TRIM(rf.RDB$RELATION_NAME)                          AS RDB$RELATION_NAME,
                            TRIM(rf.RDB$FIELD_NAME)                             AS RDB$FIELD_NAME,
                            TRIM(rf.RDB$FIELD_SOURCE)                           AS RDB$FIELD_SOURCE,
                            rf.RDB$NULL_FLAG
                        FROM RDB$RELATION_FIELDS rf
                        ORDER BY RDB$RELATION_NAME
                    `);
                const constraints = await transaction.query(`
                        SELECT
                            TRIM(rc.RDB$RELATION_NAME)                          AS RDB$RELATION_NAME,
                            TRIM(rc.RDB$CONSTRAINT_NAME)                        AS RDB$CONSTRAINT_NAME,
                            TRIM(CAST(rc.RDB$CONSTRAINT_TYPE AS CHAR(11)))      AS RDB$CONSTRAINT_TYPE,
                            s.RDB$FIELD_POSITION,
                            TRIM(s.RDB$INDEX_NAME)                              AS RDB$INDEX_NAME,
                            TRIM(s.RDB$FIELD_NAME)                              AS RDB$FIELD_NAME,
                            TRIM(rfc.RDB$CONST_NAME_UQ)                         AS RDB$CONST_NAME_UQ,
                            TRIM(CAST(rfc.RDB$UPDATE_RULE AS CHAR(11)))         AS RDB$UPDATE_RULE,
                            TRIM(CAST(rfc.RDB$DELETE_RULE AS CHAR(11)))         AS RDB$DELETE_RULE
                        FROM RDB$RELATION_CONSTRAINTS rc
                            JOIN RDB$INDEX_SEGMENTS s ON s.RDB$INDEX_NAME = rc.RDB$INDEX_NAME
                            LEFT JOIN RDB$REF_CONSTRAINTS rfc ON rfc.RDB$CONSTRAINT_NAME = rc.RDB$CONSTRAINT_NAME
                        ORDER BY rc.RDB$RELATION_NAME, rc.RDB$CONSTRAINT_NAME, s.RDB$FIELD_POSITION
                    `);
                Initializer.dbStructure.load(fields, relationFields, constraints);
            });
        }
        catch (error) {
            console.error(error);
        }
    }
}
Initializer.dbStructure = new gdmn_db_1.DBStructure();
exports.default = Initializer;
//# sourceMappingURL=Initializer.js.map