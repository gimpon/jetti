// tslint:disable:prefer-const
import { DocumentBase } from '../../models/document';
import { MSSQL } from '../../mssql';
import { DocListRequestBody, DocListResponse } from './../../models/api';
import { configSchema } from './../../models/config';
import { FilterInterval, FormListFilter } from './../../models/user.settings';

export async function List(params: DocListRequestBody, tx: MSSQL): Promise<DocListResponse> {
  params.filter = (params.filter || []).filter(el => el.right);
  params.command = params.command || 'first';
  const direction = params.command !== 'prev';
  const cs = configSchema.get(params.type);
  let { QueryList, Props } = cs!;

  // списк операций Document.Operation оптимизирован отдельной таблицей
  QueryList = params.type === 'Document.Operation' ? 'SELECT * FROM [Documents.Operation] ' : `SELECT d.* FROM (${QueryList})`;

  let row: DocumentBase | null = null;

  if (params.id) { row = (await tx.oneOrNone<DocumentBase>(`SELECT * FROM (${QueryList} d) d WHERE d.id = '${params.id}'`)); }
  if (!row && params.command !== 'last') params.command = 'first';

  params.order.forEach(el => el.field += (Props[el.field].type as string).includes('.') ? '.value' : '');
  params.filter.forEach(el => el.left += (Props[el.left] && Props[el.left].type && (Props[el.left].type as string).includes('.')) ? '.id' : '');
  let valueOrder: { field: string, order: 'asc' | 'desc', value: any }[] = [];
  params.order.filter(el => el.order).forEach(el => {
    const value = row ? el.field.includes('.value') ? row[el.field.split('.')[0]].value : row[el.field] : '';
    valueOrder.push({ field: el.field, order: el.order || 'asc', value: row ? value : '' });
  });

  const lastORDER = valueOrder.length ? valueOrder[valueOrder.length - 1].order === 'asc' : true;
  valueOrder.push({ field: 'id', order: lastORDER ? 'asc' : 'desc', value: params.id });
  let orderbyBefore = ' ORDER BY '; let orderbyAfter = orderbyBefore;
  valueOrder.forEach(o => orderbyBefore += '"' + o.field + (o.order === 'asc' ? '" DESC, ' : '" ASC, '));
  orderbyBefore = orderbyBefore.slice(0, -2);
  valueOrder.forEach(o => orderbyAfter += '"' + o.field + (o.order === 'asc' ? '" ASC, ' : '" DESC, '));
  orderbyAfter = orderbyAfter.slice(0, -2);

  valueOrder = valueOrder.filter(el => el.value);

  const filterBuilder = (filter: FormListFilter[]) => {
    let where = params.type === 'Document.Operation' ? ' (1 = 1) ' : ' isfolder = 0 ';

    filter.filter(f => !(f.right === null || f.right === undefined)).forEach(f => {
      switch (f.center) {
        case '=': case '>=': case '<=': case '>': case '<':
          if (Array.isArray(f.right)) { // time interval
            if (f.right[0]) where += ` AND "${f.left}" >= '${f.right[0]}'`;
            if (f.right[1]) where += ` AND "${f.left}" <= '${f.right[1]}'`;
            break;
          }
          if (typeof f.right === 'object') {
            if (!f.right.id) where += ` AND "${f.left}" IS NULL `; else where += ` AND "${f.left}" ${f.center} '${f.right.id}'`;
            break;
          }
          if (typeof f.right === 'string') f.right = f.right.toString().replace('\'', '\'\'');
          if (!f.right) where += ` AND "${f.left}" IS NULL `; else where += ` AND "${f.left}" ${f.center} '${f.right}'`;
          break;
        case 'like':
          where += ` AND "${f.left}" LIKE N'%${(f.right['value'] || f.right).toString().replace('\'', '\'\'')}%' `;
          break;
        case 'beetwen':
          const interval = f.right as FilterInterval;
          if (interval.start) where += ` AND "${f.left}" BEETWEN '${interval.start}' AND '${interval.end}' `;
          break;
        case 'is null':
          where += ` AND "${f.left}" IS NULL `;
          break;
      }
    });
    return where;
  };

  const queryBuilder = (isAfter: boolean) => {
    if (valueOrder.length === 0) return '';
    const order = valueOrder.slice();
    const dir = lastORDER ? isAfter ? '>' : '<' : isAfter ? '<' : '>';
    let queryBuilderResult = `
      SELECT id FROM (SELECT TOP ${params.count + 1} id FROM (${QueryList} d) ID
      WHERE ${filterBuilder(params.filter)} AND (`;

    valueOrder.forEach(_or => {
      let where = '(';
      order.forEach(_o =>
        where += ` "${_o.field}" ${_o !== order[order.length - 1] ? '=' :
          dir + ((_o.field === 'id') && isAfter ? '=' : '')} '${_o.value instanceof Date ? _o.value.toJSON() : _o.value}' AND `
      );
      where = where.slice(0, -4);
      order.length--;
      queryBuilderResult += ` ${where} ) OR \n`;
    });
    queryBuilderResult = queryBuilderResult.slice(0, -4) + ')';

    queryBuilderResult += `\n${lastORDER ?
      (dir === '>') ? orderbyAfter : orderbyBefore :
      (dir === '<') ? orderbyAfter : orderbyBefore}) ID\n`;
    return queryBuilderResult;
  };

  let query = '';
  const queryBefore = queryBuilder(true);
  const queryAfter = queryBuilder(false);
  if (queryBefore) {
    query = `SELECT id FROM (${queryBefore} \nUNION ALL\n${queryAfter}) ID`;
    query = `SELECT * FROM (${QueryList} d) d WHERE d.id IN (${query}) ${orderbyAfter} `;
  } else
    query = `SELECT TOP ${params.count + 1} * FROM (${QueryList} d) d WHERE ${filterBuilder(params.filter)} ${orderbyAfter} `;

  const data = await tx.manyOrNone<any>(query);
  let result: any[] = [];

  const continuation = { first: null, last: null };
  const calculateContinuation = () => {
    const continuationIndex = data.findIndex(d => d.id === params.id);
    const pageSize = Math.min(data.length, params.count);
    switch (params.command) {
      case 'first':
        continuation.first = null;
        continuation.last = data[pageSize];
        result = data.slice(0, pageSize);
        break;
      case 'last':
        continuation.first = data[data.length - 1 - params.count];
        continuation.last = null;
        result = data.slice(-pageSize);
        break;
      default:
        if (direction) {
          continuation.first = data[continuationIndex - params.offset - 1];
          continuation.last = data[continuationIndex + pageSize - params.offset];
          result = data.slice(continuation.first ? continuationIndex - params.offset : 0,
            continuationIndex + pageSize - params.offset);
          if (result.length < pageSize) {
            const first = Math.max(continuationIndex - params.offset - (pageSize - result.length), 0);
            const last = Math.max(continuationIndex - params.offset + result.length, pageSize);
            continuation.first = data[first - 1];
            continuation.last = data[last + 1] || data[last];
            result = data.slice(first, last);
          }
        } else {
          continuation.first = data[continuationIndex - pageSize - params.offset];
          continuation.last = data[continuationIndex + 1 - params.offset];
          result = data.slice(continuation.first ?
            continuationIndex - pageSize + 1 - params.offset : 0, continuationIndex + 1 - params.offset);
          if (result.length < pageSize) {
            continuation.first = null;
            continuation.last = data[pageSize + 1];
            result = data.slice(0, pageSize);
          }
        }
    }
  };
  calculateContinuation();
  result.length = Math.min(result.length, params.count);
  return { data: result, continuation: continuation };
}