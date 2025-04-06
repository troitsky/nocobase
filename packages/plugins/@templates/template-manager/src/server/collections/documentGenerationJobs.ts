/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'documentGenerationJobs',
  internal: true, // Hide from UI unless explicitly added
  fields: [
    {
      type: 'integer',
      name: 'templateId',
      required: true,
    },
    {
      type: 'integer',
      name: 'personId',
      required: true,
    },
    {
      type: 'integer',
      name: 'courseId',
      required: true,
    },
    // Optional: Add status fields if needed later
    // {
    //   type: 'string',
    //   name: 'status',
    //   defaultValue: 'pending'
    // },
  ],
});
