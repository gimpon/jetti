import { NextFunction, Request, Response } from 'express';
import { MSSQL } from '../../mssql';
import { JETTI_POOL } from '../../sql.pool.jetti';
import { TASKS_POOL } from '../../sql.pool.tasks';

export function jettiDB(req: Request, res: Response, next: NextFunction) {
  const user = (<any>req).user;
  const sdb = new MSSQL(user, JETTI_POOL);
  (<any>req).sdb = sdb;
  next();
}

export function tasksDB(req: Request, res: Response, next: NextFunction) {
  const user = (<any>req).user;
  const sdb = new MSSQL(user, TASKS_POOL);
  (<any>req).sdb = sdb;
  next();
}

export function SDB(req: Request) {
  return (<any>req).sdb as MSSQL;
}
