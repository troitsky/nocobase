import { ISchema, Schema, useField, useFieldSchema } from '@formily/react';
import {
  Plugin,
  SchemaComponent,
  SchemaSettings,
  SchemaSettingsModalItem,
  Variable,
  VariableEvaluateProvider,
  useVariableEvaluateContext,
} from '@nocobase/client';
import { mockApp } from '@nocobase/client/demo-utils';
import { dayjs } from '@nocobase/utils/client';
import React from 'react';

const DefaultValueEditor = () => {
  const fieldSchema = useFieldSchema();
  const TodayKeyMap = {
    dateOnly: 'today_dateOnly',
    datetime_withTZ: 'today_withTZ',
    datetime_withoutTZ: 'today_withoutTZ',
  };
  const scope = [{ label: 'Today', value: `${TodayKeyMap[fieldSchema['x-field-type']]}` }];
  const data = {
    today_dateOnly: dayjs().format('YYYY-MM-DD'),
    today_withTZ: new Date().toISOString(),
    today_withoutTZ: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  };
  const defaultValueSchema = {
    type: 'object',
    'x-component-props': {
      data: {
        today_dateOnly: dayjs().format('YYYY-MM-DD'),
        today_withTZ: new Date().toISOString(),
        today_withoutTZ: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      },
      context: {},
    },

    properties: {
      variable: {
        'x-decorator': 'FormItem',
        'x-component': 'VariableInput',
      },
      value: {
        'x-decorator': 'FormItem',
        'x-component': 'VairableValue',
      },
    },
  };

  const VariableInput = (props) => {
    return (
      <VariableEvaluateProvider data={data} context={{}}>
        <Variable.Input scope={scope} {...props} />
      </VariableEvaluateProvider>
    );
  };

  return (
    <VariableEvaluateProvider data={data} context={{}}>
      <SchemaSettingsModalItem
        title={'Set default value'}
        width={800}
        onSubmit={(v) => null}
        schema={defaultValueSchema}
        components={{ VariableInput }}
      />
    </VariableEvaluateProvider>
  );
};

const simpleSettings = new SchemaSettings({
  name: 'simpleSettings',
  items: [
    {
      name: 'defaultValue',
      Component: DefaultValueEditor,
    },
  ],
});

const schema: ISchema = {
  type: 'void',
  name: 'root',
  'x-decorator': 'DndContext',
  'x-component': 'FormV2',
  properties: {
    dateonly: {
      type: 'string',
      title: 'Dateonly',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-settings': 'simpleSettings',
      'x-field-type': 'dateOnly',
      required: true,
    },
    datetime_withTZ: {
      type: 'string',
      title: 'Nickname',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-settings': 'simpleSettings',
      'x-field-type': 'datetime_withTZ',
    },
    datetime_withoutTZ: {
      type: 'string',
      title: 'Datetime without TZ',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-settings': 'simpleSettings',
      'x-field-type': 'datetime_withoutTZ',
    },
  },
};

const Demo = () => {
  return <SchemaComponent schema={schema} />;
};

class DemoPlugin extends Plugin {
  async load() {
    this.app.router.add('root', { path: '/', Component: Demo });
  }
}

const app = mockApp({
  designable: true,
  plugins: [DemoPlugin],
  schemaSettings: [simpleSettings],
});

export default app.getRootComponent();
