/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin, Application } from '@nocobase/server';
import { Context, Next } from 'koa';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import axios from 'axios';
import { Stream } from 'stream';
import { Logger } from '@nocobase/logger';
import { Database } from '@nocobase/database';
import path from 'path';

// Augmented Koa Context type (remove app property)
type NocoActionContext = Context & {
  db?: Database;
  action?: any;
  origin?: string;
  logger?: Logger;
  state?: any;
  throw?: any;
  request?: any; // Keep for middleware body hint
};

// Helper function to convert Buffer to Stream
function bufferToStream(buffer) {
  const stream = new Stream.Readable();
  stream.push(buffer);
  stream.push(null); // Signal EOF
  return stream;
}

// Update signature: use 'any' for app parameter type
async function generateDocument(ctx: NocoActionContext, next: Next) {
  const db = ctx.db;
  const logger = ctx.logger;

  // Check db
  if (!db) {
    ctx.throw(500, 'Database service not available in Noco context');
    return;
  }

  // No storage access needed here

  const { templateId, personId, courseId } = ctx.action.params.values;

  if (!templateId || !personId || !courseId) {
    ctx.throw(400, 'Missing required parameters: templateId, personId, courseId');
    return;
  }

  try {
    // 1. Fetch data (use ctx.db)
    logger?.info('Fetching data from repositories...');
    const templatesRepo = db.getRepository('templates');
    const personsRepo = db.getRepository('persons');
    const coursesRepo = db.getRepository('courses');
    const generatedDocsRepo = db.getRepository('generatedDocuments');

    const template = await templatesRepo.findOne({
      filter: { id: templateId },
      appends: ['file'],
    });
    const person = await personsRepo.findOne({ filter: { id: personId } });
    const course = await coursesRepo.findOne({ filter: { id: courseId } });
    logger?.info(`Fetched template: ${template?.id}, person: ${person?.id}, course: ${course?.id}`);

    if (!template || !person || !course) {
      ctx.throw(404, 'Required data not found (template, person, or course)');
      return;
    }

    // 2. Fetch template file content
    const fileInfo = Array.isArray(template.get('file')) ? template.get('file')[0] : template.get('file');
    if (!fileInfo || !fileInfo.url) {
      ctx.throw(500, 'Template file URL not found');
      return;
    }
    const relativeTemplateUrl = fileInfo.url;
    if (!ctx.origin) {
      ctx.throw(500, 'Could not determine application origin URL from context');
      return;
    }
    const absoluteTemplateUrl = new URL(relativeTemplateUrl, ctx.origin).toString();
    logger?.info(`Fetching template content from: ${absoluteTemplateUrl}`);

    const response = await axios.get(absoluteTemplateUrl, { responseType: 'arraybuffer' });
    const templateContent = response.data;
    logger?.info(`Template content fetched successfully (${templateContent.byteLength} bytes)`);

    // 3. Prepare data for docxtemplater
    const data = {
      person: person.get(),
      course: course.get(),
      generationDate: new Date().toLocaleDateString(),
    };
    logger?.info('Prepared data for template rendering');

    // 4. Generate document using docxtemplater
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    logger?.info('Rendering template...');
    doc.render(data);
    logger?.info('Template rendered successfully');

    const outputBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    logger?.info(`Generated output buffer (${outputBuffer.length} bytes)`);

    // 5. Prepare filename
    const originalFileName = `${person.lastName}_${person.firstName}_${course.shortName}_${
      template.name || 'doc'
    }.docx`.replace(/\s+/g, '_');

    // 6. Set response body with filename and Base64 buffer
    logger?.info('Encoding buffer to Base64 for response');
    const base64Buffer = outputBuffer.toString('base64');

    ctx.body = {
      filename: originalFileName,
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: base64Buffer,
    };
    logger?.info('Sending JSON response with filename and base64 buffer');

    // Set status explicitly (optional, defaults to 200)
    ctx.status = 200;
  } catch (error) {
    logger?.error('Error generating document buffer:', error);
    if (error.properties && error.properties.errors) {
      logger?.error('Docxtemplater Errors:', { errors: error.properties.errors });
      ctx.throw(500, `Template Error: ${error.properties.errors.map((e) => e.message).join(', ')}`);
    } else {
      // Ensure error response is JSON if request accepts it
      ctx.status = 500;
      ctx.body = { error: `Error generating document: ${error.message}` };
      // ctx.throw(500, `Error generating document: ${error.message}`); // Avoid throw if setting body
    }
  }
  // No next() call
}

export class TemplateManagerServer extends Plugin {
  logger: Logger;

  async afterAdd() {
    this.logger = this.app.logger.child({ plugin: 'template-manager' });
    this.logger.info('Template Manager Plugin Added');
  }

  async beforeLoad() {
    // Remove manual collection registration
  }

  // Middleware just injects logger
  generateDocumentMiddleware(plugin: TemplateManagerServer) {
    return async (ctx: NocoActionContext, next: Next) => {
      ctx.logger = plugin.logger;
      await generateDocument(ctx, next);
    };
  }

  async load() {
    this.logger.info('Loading Template Manager plugin (using resource action)...');
    try {
      // Import collections from the directory
      await this.app.db.import({ directory: path.join(__dirname, 'collections') });
      this.logger.info('Imported collections from ./collections directory');

      const handler = this.generateDocumentMiddleware(this);
      // Register action handler against the (now loaded) collection resource
      this.app.resourceManager.registerActionHandler('documentGenerationJobs:generate', handler);
      this.logger.info('Registered action handler for documentGenerationJobs:generate');
      // Define the action for ACL
      this.app.resourceManager.define({
        name: 'documentGenerationJobs',
        actions: { generate: {} },
      });
      // Allow the action
      this.app.acl.allow('documentGenerationJobs', 'generate', 'loggedIn');
      this.logger.info('Associated ACL permission documentGenerationJobs:generate with loggedIn role');
    } catch (error) {
      this.logger.error('Error loading Template Manager plugin:', error);
    }
    this.logger.info('Template Manager plugin loading finished.');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default TemplateManagerServer;
