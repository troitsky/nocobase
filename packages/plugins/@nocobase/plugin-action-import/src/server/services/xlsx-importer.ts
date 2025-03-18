/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import * as XLSX from 'xlsx';
import lodash from 'lodash';
import { ICollection, ICollectionManager, IRelationField } from '@nocobase/data-source-manager';
import { Collection as DBCollection, Database } from '@nocobase/database';
import { Transaction } from 'sequelize';
import EventEmitter from 'events';
import { ImportValidationError, ImportError } from '../errors';
import { Context } from '@nocobase/actions';
import _ from 'lodash';

export type ImportColumn = {
  dataIndex: Array<string>;
  defaultTitle: string;
  title?: string;
  description?: string;
};

export type ImporterOptions = {
  collectionManager: ICollectionManager;
  collection: ICollection;
  columns: Array<ImportColumn>;
  workbook: any;
  chunkSize?: number;
  explain?: string;
  repository?: any;
};

export type RunOptions = {
  transaction?: Transaction;
  context?: any;
};

export class XlsxImporter extends EventEmitter {
  private repository;

  constructor(protected options: ImporterOptions) {
    super();

    if (typeof options.columns === 'string') {
      options.columns = JSON.parse(options.columns);
    }

    if (options.columns.length == 0) {
      throw new Error(`columns is empty`);
    }
    this.repository = options.repository ? options.repository : options.collection.repository;
  }

  async validate(ctx: Context) {
    const columns = this.getColumnsByPermission(ctx);
    if (columns.length == 0) {
      throw new ImportValidationError('Columns configuration is empty');
    }

    for (const column of columns) {
      const field = this.options.collection.getField(column.dataIndex[0]);
      if (!field) {
        throw new ImportValidationError('Field not found: {{field}}', { field: column.dataIndex[0] });
      }
    }

    const data = await this.getData(ctx);
    return data;
  }

  async run(options: RunOptions = {}) {
    let transaction = options.transaction;

    // @ts-ignore
    if (!transaction && this.options.collectionManager.db) {
      // @ts-ignore
      transaction = options.transaction = await this.options.collectionManager.db.sequelize.transaction();
    }

    try {
      await this.validate(options.context);
      const imported = await this.performImport(options);

      // @ts-ignore
      if (this.options.collectionManager.db) {
        await this.resetSeq(options);
      }

      transaction && (await transaction.commit());

      return imported;
    } catch (error) {
      transaction && (await transaction.rollback());
      throw error;
    }
  }

  async resetSeq(options?: RunOptions) {
    const { transaction } = options;

    // @ts-ignore
    const db: Database = this.options.collectionManager.db;
    const collection: DBCollection = this.options.collection as DBCollection;

    // @ts-ignore
    const autoIncrementAttribute = collection.model.autoIncrementAttribute;
    if (!autoIncrementAttribute) {
      return;
    }

    let hasImportedAutoIncrementPrimary = false;
    for (const importedDataIndex of this.getColumnsByPermission(options?.context)) {
      if (importedDataIndex.dataIndex[0] === autoIncrementAttribute) {
        hasImportedAutoIncrementPrimary = true;
        break;
      }
    }

    if (!hasImportedAutoIncrementPrimary) {
      return;
    }

    let tableInfo = collection.getTableNameWithSchema();
    if (typeof tableInfo === 'string') {
      tableInfo = {
        tableName: tableInfo,
      };
    }

    const autoIncrInfo = await db.queryInterface.getAutoIncrementInfo({
      tableInfo,
      fieldName: autoIncrementAttribute,
      transaction,
    });

    const maxVal = (await collection.model.max(autoIncrementAttribute, { transaction })) as number;

    const queryInterface = db.queryInterface;

    await queryInterface.setAutoIncrementVal({
      tableInfo,
      columnName: collection.model.rawAttributes[autoIncrementAttribute].field,
      currentVal: maxVal,
      seqName: autoIncrInfo.seqName,
      transaction,
    });

    this.emit('seqReset', { maxVal, seqName: autoIncrInfo.seqName });
  }

  async performImport(options?: RunOptions): Promise<any> {
    const transaction = options?.transaction;
    const data = await this.getData(options?.context);
    const chunks = lodash.chunk(data.slice(1), this.options.chunkSize || 200);

    let handingRowIndex = 1;
    let imported = 0;

    // Calculate total rows to be imported
    const total = data.length - 1; // Subtract header row

    if (this.options.explain) {
      handingRowIndex += 1;
    }
    const columns = this.getColumnsByPermission(options?.context);

    for (const chunkRows of chunks) {
      for (const row of chunkRows) {
        const rowValues = {};
        handingRowIndex += 1;
        try {
          for (let index = 0; index < columns.length; index++) {
            const column = columns[index];

            const field = this.options.collection.getField(column.dataIndex[0]);

            if (!field) {
              throw new ImportValidationError('Import validation.Field not found', {
                field: column.dataIndex[0],
              });
            }

            const str = row[index];

            const dataKey = column.dataIndex[0];

            const fieldOptions = field.options;

            const interfaceName = fieldOptions.interface;

            const InterfaceClass = this.options.collectionManager.getFieldInterface(interfaceName);

            if (!InterfaceClass) {
              rowValues[dataKey] = str;
              continue;
            }

            const interfaceInstance = new InterfaceClass(field.options);

            const ctx: any = {
              transaction,
              field,
            };

            if (column.dataIndex.length > 1) {
              ctx.associationField = field;
              ctx.targetCollection = (field as IRelationField).targetCollection();
              ctx.filterKey = column.dataIndex[1];
            }

            rowValues[dataKey] = await interfaceInstance.toValue(this.trimString(str), ctx);
          }

          await this.performInsert({
            values: rowValues,
            transaction,
            context: options?.context,
          });

          imported += 1;

          // Emit progress event
          this.emit('progress', {
            total,
            current: imported,
          });

          await new Promise((resolve) => setTimeout(resolve, 5));
        } catch (error) {
          throw new ImportError(`Import failed at row ${handingRowIndex}`, {
            rowIndex: handingRowIndex,
            rowData: Object.entries(rowValues)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', '),
            cause: error,
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return imported;
  }

  async performInsert(insertOptions: { values: any; transaction: Transaction; context: any; hooks?: boolean }) {
    const { values, transaction, context } = insertOptions;

    return this.repository.create({
      values,
      context,
      transaction,
      hooks: insertOptions.hooks == undefined ? true : insertOptions.hooks,
    });
  }

  renderErrorMessage(error) {
    let message = error.message;
    if (error.parent) {
      message += `: ${error.parent.message}`;
    }

    return message;
  }
  trimString(str: string) {
    if (typeof str === 'string') {
      return str.trim();
    }

    return str;
  }

  private getColumnsByPermission(ctx: Context): ImportColumn[] {
    const columns = this.options.columns;
    return columns.filter((x) =>
      ctx?.permission?.can?.params?.fields?.length
        ? _.includes(ctx?.permission?.can?.params?.fields || [], x.dataIndex[0])
        : true,
    );
  }

  private getExpectedHeaders(ctx: Context): string[] {
    const columns = this.getColumnsByPermission(ctx);
    return columns.map((col) => col.title || col.defaultTitle);
  }

  private alignWithHeaders(expectedHeaders: string[], data: string[][]): string[][] {
    const headers = this.options.explain ? data[1] : data[0];

    const keepCols = headers.map((x, i) => (expectedHeaders.includes(x) ? i : -1)).filter((i) => i > -1);

    return data.map((row) => keepCols.map((i) => row[i]));
  }

  async getData(ctx: Context) {
    const workbook = this.options.workbook;
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    let data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as string[][];

    // Find and validate header row
    const expectedHeaders = this.getExpectedHeaders(ctx);
    data = this.alignWithHeaders(expectedHeaders, data);
    const { headerRowIndex, headers } = this.findAndValidateHeaders({ data, expectedHeaders });
    if (headerRowIndex === -1) {
      throw new ImportValidationError('Headers not found. Expected headers: {{headers}}', {
        headers: expectedHeaders.join(', '),
      });
    }

    // Extract data rows
    const rows = data.slice(headerRowIndex + 1);

    // if no data rows, throw error
    if (rows.length === 0) {
      throw new ImportValidationError('No data to import');
    }

    return [headers, ...rows];
  }

  private findAndValidateHeaders(options: { expectedHeaders: string[]; data: string[][] }): {
    headerRowIndex: number;
    headers: string[];
  } {
    const { expectedHeaders, data } = options;
    // Find header row and validate
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const actualHeaders = row.filter((cell) => cell !== null && cell !== '');

      const allHeadersFound = expectedHeaders.every((header) => actualHeaders.includes(header));
      const noExtraHeaders = actualHeaders.length === expectedHeaders.length;

      if (allHeadersFound && noExtraHeaders) {
        const mismatchIndex = expectedHeaders.findIndex((title, index) => actualHeaders[index] !== title);

        if (mismatchIndex === -1) {
          // All headers match
          return { headerRowIndex: rowIndex, headers: actualHeaders };
        } else {
          // Found potential header row but with mismatch
          throw new ImportValidationError(
            'Header mismatch at column {{column}}: expected "{{expected}}", but got "{{actual}}"',
            {
              column: mismatchIndex + 1,
              expected: expectedHeaders[mismatchIndex],
              actual: actualHeaders[mismatchIndex] || 'empty',
            },
          );
        }
      }
    }

    // No row with matching headers found
    throw new ImportValidationError('Headers not found. Expected headers: {{headers}}', {
      headers: expectedHeaders.join(', '),
    });
  }
}
