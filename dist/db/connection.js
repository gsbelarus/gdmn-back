"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_firebird_1 = require("node-firebird");
const connection_options_1 = require("./connection_options");
let db;
let readTransaction;
function connect(alias = '') {
    if (db) {
        throw new Error('db is already connected');
    }
    node_firebird_1.attach(connection_options_1.default(), (err, connectedDB) => {
        if (err) {
            throw new Error(err);
        }
        db = connectedDB;
        db.transaction(node_firebird_1.ISOLATION_READ_COMMITED_READ_ONLY, (trOptions, tr) => {
            readTransaction = tr;
        });
    });
}
exports.connect = connect;
function disconnect() {
    if (!db) {
        throw new Error('db is not connected');
    }
    if (readTransaction) {
        readTransaction.commit();
    }
    db.detach();
}
exports.disconnect = disconnect;
function getDB() {
    if (!db) {
        throw new Error('db is not connected');
    }
    return db;
}
exports.getDB = getDB;
function getReadTransaction() {
    if (!readTransaction) {
        throw new Error('read transaction is not active');
    }
    return readTransaction;
}
exports.getReadTransaction = getReadTransaction;
//# sourceMappingURL=connection.js.map