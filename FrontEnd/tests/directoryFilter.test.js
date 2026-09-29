import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmployee } from '../src/utils/dataAdapters.js';

describe('Directory Filtering and Search Tests', () => {
  const sampleEmployees = [
    {
      id: 'NV-1001',
      full_name: 'Nguyễn Văn Tuấn',
      work_email: 'tuan.nv@nexus.vn',
      department_name: 'Kỹ thuật Phần mềm',
      job_title: 'Kỹ sư Cấp cao',
      status: 'active',
      base_salary: 30000000
    },
    {
      id: 'NV-1002',
      full_name: 'Trần Thị Mai',
      work_email: 'mai.tt@nexus.vn',
      department_name: 'Nhân sự và Vận hành',
      job_title: 'Chuyên viên Tuyển dụng',
      status: 'active',
      base_salary: 18000000
    },
    {
      id: 'NV-1003',
      full_name: null,
      work_email: null,
      department_name: null,
      job_title: null,
      status: 'inactive'
    }
  ].map(normalizeEmployee);

  it('filters employees by text query without case sensitivity or crashing on nulls', () => {
    const query = 'TUẤN';
    const filtered = sampleEmployees.filter(emp =>
      (emp.name || '').toLowerCase().includes(query.toLowerCase()) ||
      (emp.email || '').toLowerCase().includes(query.toLowerCase()) ||
      (emp.id || '').toLowerCase().includes(query.toLowerCase())
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'NV-1001');
  });

  it('filters employees by department correctly', () => {
    const filtered = sampleEmployees.filter(emp => emp.department === 'Nhân sự và Vận hành');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'NV-1002');
  });

  it('handles empty or malformed employee safely with safe defaults', () => {
    const emp = sampleEmployees[2];
    assert.equal(emp.name, 'Chưa rõ');
    assert.equal(emp.department, 'Chưa phân bổ');
    assert.equal(emp.email, '');
    assert.equal(emp.status, 'inactive');
  });
});
