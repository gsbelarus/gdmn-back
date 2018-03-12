"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_firebird_1 = require("node-firebird");
const connection_options_1 = require("./connection_options");
let db;
function connect(alias = '') {
    if (db) {
        throw new Error('db already attached');
    }
    node_firebird_1.attach(connection_options_1.default(), (err, connectedDB) => {
        if (err) {
            throw new Error(err);
        }
        db = connectedDB;
    });
}
exports.connect = connect;
function disconnect() {
    if (!db) {
        throw new Error('db has not been connected');
    }
    db.detach();
}
exports.disconnect = disconnect;
function getDB() {
    if (!db) {
        throw new Error('db has not been connected');
    }
    return db;
}
exports.getDB = getDB;
//# sourceMappingURL=connection.js.map