const { z } = require('zod');

const isoDate = z
  .string({ invalid_type_error: 'Ngày phải có dạng YYYY-MM-DD' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Ngày không hợp lệ');

const notFuture = (v) => new Date(`${v}T00:00:00Z`) <= new Date();

const idParam = z.object({ id: z.string().trim().min(1).max(20) });

const fields = {
  id: z.string().trim().regex(/^[A-Za-z0-9-]{3,20}$/, 'Mã nhân viên gồm 3-20 ký tự chữ, số hoặc dấu -'),
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(100),
  departmentId: z.string().trim().min(1).max(20),
  positionId: z.string().trim().min(1).max(20),
  jobTitle: z.string().trim().min(1, 'Vui lòng nhập chức danh công việc').max(100),
  workEmail: z.string().trim().toLowerCase().email('Email không hợp lệ').max(100),
  phoneNumber: z.string().trim().regex(/^[0-9 +().-]{8,20}$/, 'Số điện thoại không hợp lệ'),
  citizenId: z.string().trim().regex(/^(\d{9}|\d{12})$/, 'CCCD/CMND phải gồm 9 hoặc 12 chữ số'),
  dateOfBirth: isoDate.refine(notFuture, 'Ngày sinh không được ở tương lai'),
  gender: z.enum(['Nam', 'Nu', 'Khac']),
  address: z.string().trim().max(500),
  baseSalary: z.number({ invalid_type_error: 'Lương phải là số' }).min(0, 'Lương không được âm').max(9_999_999_999),
  contractType: z.enum(['CHINH_THUC', 'THU_VIEC', 'THOI_VU', 'CONG_TAC_VIEN']),
  joinedDate: isoDate,
  managerId: z.string().trim().min(1).max(20),
  avatarUrl: z.string().trim().max(2000),
  bankAccount: z.string().trim().max(30),
  bankName: z.string().trim().max(50),
};

const createBody = z.object({
  id: fields.id.optional(),
  fullName: fields.fullName,
  jobTitle: fields.jobTitle,
  workEmail: fields.workEmail,
  joinedDate: fields.joinedDate,
  departmentId: fields.departmentId.nullish(),
  positionId: fields.positionId.nullish(),
  phoneNumber: fields.phoneNumber.nullish(),
  citizenId: fields.citizenId.nullish(),
  dateOfBirth: fields.dateOfBirth.nullish(),
  gender: fields.gender.nullish(),
  address: fields.address.nullish(),
  baseSalary: fields.baseSalary.optional(),
  contractType: fields.contractType.optional(),
  managerId: fields.managerId.nullish(),
  avatarUrl: fields.avatarUrl.nullish(),
  bankAccount: fields.bankAccount.nullish(),
  bankName: fields.bankName.nullish(),
});

const updateBody = z
  .object({
    fullName: fields.fullName.optional(),
    jobTitle: fields.jobTitle.optional(),
    workEmail: fields.workEmail.optional(),
    departmentId: fields.departmentId.nullable().optional(),
    positionId: fields.positionId.nullable().optional(),
    phoneNumber: fields.phoneNumber.nullable().optional(),
    citizenId: fields.citizenId.nullable().optional(),
    dateOfBirth: fields.dateOfBirth.nullable().optional(),
    gender: fields.gender.nullable().optional(),
    address: fields.address.nullable().optional(),
    baseSalary: fields.baseSalary.optional(),
    contractType: fields.contractType.optional(),
    managerId: fields.managerId.nullable().optional(),
    avatarUrl: fields.avatarUrl.nullable().optional(),
    bankAccount: fields.bankAccount.nullable().optional(),
    bankName: fields.bankName.nullable().optional(),
    status: z.enum(['DANG_LAM_VIEC', 'THU_VIEC', 'TAM_HOAN', 'DA_NGHI_VIEC']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Không có thay đổi nào' });

const listQuery = z.object({
  search: z.string().trim().optional(),
  department: z.string().trim().optional(),
  status: z.enum(['DANG_LAM_VIEC', 'THU_VIEC', 'TAM_HOAN', 'DA_NGHI_VIEC']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const offboardBody = z.object({
  terminationDate: isoDate,
  reason: z.string({ required_error: 'Vui lòng nhập lý do nghỉ việc' }).trim().min(1, 'Vui lòng nhập lý do nghỉ việc').max(500),
  note: z.string().trim().max(1000).optional(),
});

const importBody = z.object({
  rows: z.array(z.unknown(), { required_error: 'Thiếu danh sách nhân viên', invalid_type_error: 'rows phải là một mảng' })
    .min(1, 'Danh sách trống').max(500, 'Tối đa 500 dòng mỗi lần nhập'),
  dryRun: z.boolean().optional(),
});

module.exports = { offboardBody, importBody, idParam, createBody, updateBody, listQuery, isoDate, fields };
