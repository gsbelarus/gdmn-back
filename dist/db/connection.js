"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
Object.defineProperty(exports, "__esModule", { value: true });
const node_firebird_1 = require("node-firebird");
const connection_options_sample_1 = __importDefault(require("./connection_options.sample"));
let db;
let readTransaction;
function connect(alias = '') {
    if (db) {
        throw new Error('db is already connected');
    }
    return new Promise((resolve, reject) => {
        node_firebird_1.attach(connection_options_sample_1.default(alias), (err, connectedDB) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(connectedDB);
            }
        });
    })
        .then(connectedDB => { db = connectedDB; })
        .then(() => new Promise(resolve => {
        db.transaction(node_firebird_1.ISOLATION_READ_COMMITED_READ_ONLY, (trOptions, tr) => {
            resolve(tr);
        });
    }))
        .then(tr => { readTransaction = tr; })
        .catch(err => { throw new Error(err); });
}
exports.connect = connect;
function disconnect() {
    if (!db) {
        throw new Error('db is not connected');
    }
    return new Promise(resolve => {
        if (readTransaction) {
            readTransaction.commit(() => resolve());
        }
        else {
            resolve();
        }
    })
        .then(() => {
        return new Promise(resolve => db.detach(() => resolve()));
    })
        .catch(err => { throw new Error(err); });
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
    if (!db) {
        throw new Error('db is not connected');
    }
    return readTransaction;
}
exports.getReadTransaction = getReadTransaction;
//# sourceMappingURL=connection.js.map