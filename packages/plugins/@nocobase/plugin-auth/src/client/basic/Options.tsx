/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SchemaComponent, useCollectionManager, useCurrentUserVariable, useDatetimeVariable, useGlobalVariable, useRecord } from '@nocobase/client';
import React, { useEffect, useMemo } from 'react';
import { lang, useAuthTranslation } from '../locale';
import { FormTab, ArrayTable } from '@formily/antd-v5';
import { Alert } from 'antd';
import { uid } from '@formily/shared';

const SignupFormSettings = () => {
  const record = useRecord();
  const cm = useCollectionManager();
  const userCollection = cm.getCollection('users');
  const fields = userCollection.fields.filter(
    (field) => !field.hidden && !field.target && field.interface && !field.uiSchema?.['x-read-pretty'],
  );
  const enumArr = fields.map((field) => ({ value: field.name, label: field.uiSchema?.title }));
  const value = useMemo(() => {
    const fieldValue = record.options?.public?.signupForm || [];
    const newValue = fieldValue.filter((item: any) => fields.find((field) => field.name === item.field));
    for (const field of fields) {
      const exist = newValue.find((item: any) => item.field === field.name);
      if (!exist) {
        newValue.push({
          field: field.name,
          show: field.name === 'username',
          required: field.name === 'username',
        });
      }
    }
    return newValue;
  }, [fields, record]);
  useEffect(() => {
    record.options = {
      ...record.options,
      public: {
        ...record.options?.public,
        signupForm: value,
      },
    };
  }, [record, value]);

  return (
    <SchemaComponent
      components={{ ArrayTable }}
      schema={{
        type: 'void',
        properties: {
          signupForm: {
            title: '{{t("Sign up form")}}',
            type: 'array',
            'x-decorator': 'FormItem',
            'x-component': 'ArrayTable',
            'x-component-props': {
              bordered: false,
            },
            'x-validator': `{{ (value) => {
  const check = value?.some((item) => ['username', 'email'].includes(item.field) && item.show && item.required);
  if (!check) {
    return t('At least one of the username or email fields is required');
  }
} }}`,
            default: value,
            items: {
              type: 'object',
              'x-decorator': 'ArrayItems.Item',
              properties: {
                column0: {
                  type: 'void',
                  'x-component': 'ArrayTable.Column',
                  'x-component-props': { width: 20, align: 'center' },
                  properties: {
                    sort: {
                      type: 'void',
                      'x-component': 'ArrayTable.SortHandle',
                    },
                  },
                },
                column1: {
                  type: 'void',
                  'x-component': 'ArrayTable.Column',
                  'x-component-props': { width: 100, title: lang('Field') },
                  properties: {
                    field: {
                      type: 'string',
                      'x-decorator': 'FormItem',
                      'x-component': 'Select',
                      enum: enumArr,
                      'x-read-pretty': true,
                    },
                  },
                },
                column2: {
                  type: 'void',
                  'x-component': 'ArrayTable.Column',
                  'x-component-props': { width: 80, title: lang('Show') },
                  properties: {
                    show: {
                      type: 'boolean',
                      'x-decorator': 'FormItem',
                      'x-component': 'Checkbox',
                      'x-reactions': {
                        dependencies: ['.required'],
                        fulfill: {
                          state: {
                            value: '{{ $deps[0] || $self.value }}',
                          },
                        },
                      },
                    },
                  },
                },
                column3: {
                  type: 'void',
                  'x-component': 'ArrayTable.Column',
                  'x-component-props': { width: 80, title: lang('Required') },
                  properties: {
                    required: {
                      type: 'boolean',
                      'x-decorator': 'FormItem',
                      'x-component': 'Checkbox',
                      'x-reactions': {
                        dependencies: ['.show'],
                        fulfill: {
                          state: {
                            value: '{{ !$deps[0] ? false : $self.value }}',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }}
    />
  );
};

const useVariableOptionsOfForgetPassword = () => {
  const { t } = useAuthTranslation();
  const environmentVariables = useGlobalVariable('$env');
  const { currentUserSettings } = useCurrentUserVariable({ maxDepth: 1 });
  const { datetimeSettings } = useDatetimeVariable({ noDisabled: true });
  return [environmentVariables, currentUserSettings, datetimeSettings, {
    value: '$resetLink',
    label: t('Reset password link'),
  }].filter(Boolean);
}

export const Options = () => {
  const { t } = useAuthTranslation();
  const forgetPasswordVariableOptions = useVariableOptionsOfForgetPassword();

  return (
    <SchemaComponent
      scope={{ t }}
      components={{ Alert, SignupFormSettings, FormTab }}
      schema={{
        type: 'object',
        properties: {
          notice: {
            type: 'void',
            'x-decorator': 'FormItem',
            'x-component': 'Alert',
            'x-component-props': {
              showIcon: true,
              message: '{{t("The authentication allows users to sign in via username or email.")}}',
            },
          },
          public: {
            type: 'object',
            properties: {
              collapse: {
                type: 'void',
                'x-component': 'FormTab',
                properties: {
                  basic: {
                    type: 'void',
                    'x-component': 'FormTab.TabPane',
                    'x-component-props': {
                      tab: lang('Sign up settings'),
                    },
                    properties: {
                      allowSignUp: {
                        'x-decorator': 'FormItem',
                        type: 'boolean',
                        title: '{{t("Allow to sign up")}}',
                        'x-component': 'Checkbox',
                        default: true,
                      },
                      [uid()]: {
                        type: 'void',
                        'x-component': 'SignupFormSettings',
                      },
                    },
                  },
                  forgetPassword: {
                    type: 'void',
                    'x-component': 'FormTab.TabPane',
                    'x-component-props': {
                      tab: lang('Forget password'),
                    },
                    properties: {
                      enableResetPassword: {
                        'x-decorator': 'FormItem',
                        type: 'boolean',
                        title: '{{t("Enable forget password feature")}}',
                        'x-component': 'Checkbox',
                        default: false,
                      },
                      emailChannel: {
                        type: 'string',
                        title: '{{t("Email Channel")}}',
                        required: true,
                        'x-decorator': 'FormItem',
                        'x-component': 'RemoteSelect',
                        'x-component-props': {
                          multiple: false,
                          manual: false,
                          fieldNames: {
                            label: 'title',
                            value: 'name',
                          },
                          service: {
                            resource: 'notificationChannels',
                            action: 'list',
                            params: {
                              filter: {
                                notificationType: 'email',
                              },
                            },
                          },
                        },
                        'x-reactions': [
                          {
                            dependencies: ['.enableResetPassword'],
                            fulfill: {
                              state: {
                                visible: '{{$deps[0]}}',
                              },
                            },
                          },
                        ],
                      },
                      emailSubject: {
                        type: 'string',
                        required: true,
                        title: `{{t("Subject")}}`,
                        'x-decorator': 'FormItem',
                        'x-component': 'Variable.TextArea',
                        'x-component-props': {
                          scope: [...forgetPasswordVariableOptions],
                        },
                        'x-reactions': [
                          {
                            dependencies: ['.enableResetPassword'],
                            fulfill: {
                              state: {
                                visible: '{{$deps[0]}}',
                              },
                            },
                          },
                        ],
                      },
                      emailContentType: {
                        type: 'string',
                        title: `{{t("Content type")}}`,
                        'x-decorator': 'FormItem',
                        'x-component': 'Radio.Group',
                        enum: [
                          { label: 'HTML', value: 'html' },
                          { label: `{{t("Plain text")}}`, value: 'text' },
                        ],
                        default: 'html',
                        'x-reactions': [
                          {
                            dependencies: ['.enableResetPassword'],
                            fulfill: {
                              state: {
                                visible: '{{$deps[0]}}',
                              },
                            },
                          },
                        ],
                      },
                      emailContentHTML: {
                        type: 'string',
                        required: true,
                        title: `{{t("Content")}}`,
                        'x-decorator': 'FormItem',
                        'x-component': 'Variable.RawTextArea',
                        'x-component-props': {
                          scope: [...forgetPasswordVariableOptions],
                          placeholder: 'Hi,',
                          autoSize: {
                            minRows: 10,
                          },
                        },
                        'x-reactions': [
                          {
                            dependencies: ['.enableResetPassword', '.emailContentType'],
                            fulfill: {
                              state: {
                                visible: '{{$deps[0] && $deps[1] === "html"}}',
                              },
                            },
                          },
                        ],
                      },
                      emailContentText: {
                        type: 'string',
                        required: true,
                        title: `{{t("Content")}}`,
                        'x-decorator': 'FormItem',
                        'x-component': 'Variable.RawTextArea',
                        'x-component-props': {
                          scope: [...forgetPasswordVariableOptions],
                          placeholder: 'Hi,',
                          autoSize: {
                            minRows: 10,
                          },
                        },
                        'x-reactions': [
                          {
                            dependencies: ['.enableResetPassword', '.emailContentType'],
                            fulfill: {
                              state: {
                                visible: '{{$deps[0] && $deps[1] === "text"}}',
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }}
    />
  );
};
