import { attach, Database, DatabaseCallback, ISOLATION_READ_COMMITED_READ_ONLY,
  Options, Transaction } from '../../lib/node-firebird';
import opt from './connection_options';

let db: Database;
let readTransaction: Transaction;

export function connect(alias = '') {
  if (db) {
    throw new Error('db is already connected');
  }
  attach(opt(), (err, connectedDB) => {
    if (err) {
      throw new Error(err);
    }
    db = connectedDB;
    db.transaction(ISOLATION_READ_COMMITED_READ_ONLY, (trErr, tr) => {
      if (trErr) {
        throw new Error(trErr);
      }
      readTransaction = tr;
    });
  });
}

export function disconnect() {
  if (!db) {
    throw new Error('db is not connected');
  }
  if (readTransaction) {
    readTransaction.commit();
  }
  db.detach();
}

export function getDB() {
  if (!db) {
    throw new Error('db is not connected');
  }
  return db;
}
