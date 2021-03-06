import { IServerForm } from './form.factory.server';
import { lib } from '../../std.lib';
import { MSSQL } from '../../mssql';
import { TASKS_POOL } from '../../sql.pool.tasks';
import { Ref } from '../document';
import { FormSearchAndReplace } from './Form.SearchAndReplace';

export default class FormSearchAndReplaceServer extends FormSearchAndReplace implements IServerForm {

  async Execute() {
    return this;
  }
  // tslint:disable
  async Search() {
    if (!this.OldValue) throw new Error('Searched value is not defined');

    const sdbq = new MSSQL(this.user, TASKS_POOL);
    const query = `

      select  COUNT(id) Records
      ,type Type
      ,'Documents.doc' Source
      from Documents
      where contains(doc, @p1)
      GROUP BY type
    UNION
      select COUNT(id) Records
      ,type
      ,'Documents.company' source
      from Documents 
      where company = @p1
      GROUP BY type
      UNION 
    
      select COUNT(id) Records
      ,type
      
      ,'Accumulation.data' source
      from Accumulation 
      where contains(data, @p1)
      GROUP BY type
    
      UNION
    
      select COUNT(id) Records
      ,type
      
      ,'Accumulation.company' source
      from Accumulation 
      where company = @p1
      GROUP BY type
    
      UNION
    
      select COUNT(id) Records
      ,type
      
      ,'Accumulation.document' source
      from Accumulation 
      where document = @p1
      GROUP BY type
    
    UNION
    
      select COUNT(id) Records
      ,type
      
      ,'Register.Info.data' source
      from [Register.Info]
      where contains(data, @p1)
      GROUP BY type
    
    UNION
    
      select COUNT(id) Records
      ,type
      
      ,'Register.Info.company' source
      from [Register.Info]
      where company = @p1
      GROUP BY type
    
    UNION
    
      select COUNT(id) Records
      ,type
      ,'Register.Info.document' source
      from [Register.Info]
      where document = @p1
      GROUP BY type `;

    const searchRes = await sdbq.manyOrNone<{ Records: number, Type: string, Source: string }>(query, [this.OldValue]);
    this.SearchResult = [];
    for (const row of searchRes) {
      this.SearchResult.push({
        Records: row.Records,
        Type: row.Type,
        Source: row.Source
      });
    }

    return this;
  }

  async Replace() {
    if (!this.OldValue) throw new Error('Old value is not defined');
    if (!this.NewValue) throw new Error('New value is not defined');
    if (this.NewValue === this.OldValue) throw new Error('Bad params: The new value cannot be equal to the old value');
    this.user.isAdmin = true;
    const sdbq = new MSSQL(this.user, TASKS_POOL);
    const NewValue = await lib.doc.byId(this.NewValue, sdbq);
    const OldValue = await lib.doc.byId(this.OldValue, sdbq);
    if (NewValue!.type !== OldValue!.type) throw new Error(`Bad params: The new value type ${NewValue!.type} mast be same type ${OldValue!.type} as old value`);

    let query = `
    BEGIN TRANSACTION
    DECLARE @p1 VARCHAR(36) = '@p1Val' ;
    DECLARE @p2 VARCHAR(36) = '@p2Val';
        ALTER TABLE [dbo].[Documents] DISABLE TRIGGER [Documents > Hisroty.Update];
        ALTER TABLE [dbo].[Documents] DISABLE TRIGGER [Documents > Hisroty.Insert];
        ALTER TABLE [dbo].[Documents] DISABLE TRIGGER [Documents.CheckAccessToCommonDocs];
        update documents set doc = REPLACE(doc, @p1, @p2)
        where id in (select id from documents where contains(doc, @p1));
        RAISERROR('REPLACE DOC', 0 ,1) WITH NOWAIT;
        DROP TABLE IF EXISTS #Exchange;
        select ExchangeBase, ExchangeCode into #Exchange from Documents where id = @p1;
        RAISERROR('#Exchange', 0 ,1) WITH NOWAIT;
        IF (select ExchangeBase from #Exchange) <> ''
        BEGIN
            update documents set
                ExchangeBase = (select ExchangeBase from #Exchange),
                ExchangeCode = (select ExchangeCode from #Exchange)
            where id = @p2;
            RAISERROR('set ExchangeBase', 0 ,1) WITH NOWAIT;
            update documents set
                ExchangeBase = '',
                ExchangeCode = ''
            where id = @p1;
            RAISERROR('clear ExchangeBase', 0 ,1) WITH NOWAIT;
        END
        update documents set company = @p2 where company = @p1;
        RAISERROR('company', 0 ,1) WITH NOWAIT;
        update documents set parent = @p2 where parent = @p1;
        RAISERROR('parent', 0 ,1) WITH NOWAIT;
        update documents set [user] = @p2 where [user] = @p1;
        RAISERROR('[user]', 0 ,1) WITH NOWAIT;
        update documents set deleted = 1 where id = @p1 and deleted <> 1;
        RAISERROR('deleted', 0 ,1) WITH NOWAIT;
        update Accumulation set data = REPLACE(data, @p1, @p2)
        where id in (select id from Accumulation where contains(data, @p1));
        RAISERROR('REPLACE Accumulation', 0 ,1) WITH NOWAIT;
        update Accumulation set company = @p2 where company = @p1;
        RAISERROR('company', 0 ,1) WITH NOWAIT;
        update [Register.Info] set data = REPLACE(data, @p1, @p2)
        where id in (select id from [Register.Info] where contains(data, @p1));
        RAISERROR('REPLACE [Register.Info]', 0 ,1) WITH NOWAIT;
        update [Register.Info] set company = @p2 where company = @p1;
        RAISERROR('company', 0 ,1) WITH NOWAIT;
        ALTER TABLE [dbo].[Documents] ENABLE TRIGGER [Documents > Hisroty.Update];
        ALTER TABLE [dbo].[Documents] ENABLE TRIGGER [Documents > Hisroty.Insert];
        ALTER TABLE [dbo].[Documents] ENABLE TRIGGER [Documents.CheckAccessToCommonDocs];
    COMMIT;`;

    query = query.replace('@p1Val', this.OldValue).replace('@p2Val', this.NewValue)
    await sdbq.manyOrNone(query);
    return this;
  }
}
