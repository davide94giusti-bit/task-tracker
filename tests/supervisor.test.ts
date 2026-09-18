import {describe,expect,it} from 'vitest';
import path from 'node:path';
import {serviceDirectoryName,serviceEntryPath} from '../src/main/supervisor';

describe('service supervisor packaging paths',()=>{
  it('maps the public gateway service name to its api-gateway build directory',()=>{
    expect(serviceDirectoryName('gateway')).toBe('api-gateway');
    expect(serviceEntryPath('C:\\PriorityDesk\\dist-services','gateway')).toBe(path.join('C:\\PriorityDesk\\dist-services','api-gateway','index.cjs'));
  });

  it('keeps all other service directory names unchanged',()=>{
    expect(serviceDirectoryName('data')).toBe('data');
    expect(serviceDirectoryName('dependencies-progress')).toBe('dependencies-progress');
  });
});
