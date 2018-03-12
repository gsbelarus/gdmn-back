import { attach, Database, DatabaseCallback, Options } from 'node-firebird';
import opt from './connection_options';

let db: Database;

export function connect(alias = '') {
  if (db) {
    throw new Error('db already attached');
  }
  attach(opt(), (err, connectedDB) => {
    if (err) {
      throw new Error(err);
    }
    db = connectedDB;
  });
}

export function disconnect() {
  if (!db) {
    throw new Error('db has not been connected');
  }
  db.detach();
}

export function getDB() {
  if (!db) {
    throw new Error('db has not been connected');
  }
  return db;
}
