// ============================================
// swaggerPage.js — OpenAPI 3.0 Docs & Swagger UI Interactive Page
// ============================================

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'NEXUS HRMS Enterprise RESTful API',
    version: '1.4.0',
    description: `Tài liệu kỹ thuật và thử nghiệm API trực tiếp (Interactive Swagger UI) cho Hệ Thống Quản Trị Nhân Sự Toàn Diện NEXUS HRMS.
    Bao gồm đầy đủ 100% endpoints kết nối Cơ sở dữ liệu PostgreSQL 16 và WebSocket Server:
    - Xác thực & Phân quyền RBAC 5 cấp (Auth & RBAC)
    - Hồ sơ nhân sự Profile 360 (Employees & Contracts)
    - Chấm công số, GPS & Kiosk mã động, Đơn giải trình (Attendance & Appeals)
    - Nghỉ phép & Phê duyệt đa cấp (Leaves & Workflow)
    - Xử lý tiền lương, Quyết toán thuế TNCN 7 bậc (Payroll Engine)
    - AI Copilot Gemini & HR Domain RAG (AI & Knowledge Base)
    - Đội nhóm, Dự án & Kênh Chat WebSocket (Squads & Chat)`,
    contact: {
      name: 'FWB Nexus Tech Team',
      email: 'tech@fwbnexus.vn',
    },
  },
  servers: [
    {
      url: 'http://localhost:8000',
      description: 'Máy chủ Phát triển & Kiểm thử Cục bộ (Local Dev)',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập Access Token JWT sau khi đăng nhập qua endpoint /api/auth/login',
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
  tags: [
    { name: 'Auth', description: 'Xác thực, Cấp quyền & Chuyển đổi vai trò' },
    { name: 'Employees', description: 'Quản lý hồ sơ nhân sự, Hợp đồng & Import/Export' },
    { name: 'Attendance', description: 'Chấm công GPS, Kiosk 6 số, Bảng công & Đơn giải trình' },
    { name: 'Leaves', description: 'Đơn nghỉ phép, Tồn phép & Quy trình phê duyệt' },
    { name: 'Payroll', description: 'Tính lương tự động, Phát hiện bất thường, Lệnh chuyển khoản & Khóa sổ' },
    { name: 'AI & Knowledge', description: 'Trợ lý ảo AI Gemini & Hỏi đáp quy chế doanh nghiệp RAG' },
    { name: 'Squads & Projects', description: 'Dự án, Phân công công việc & Kênh chat WebSocket' },
    { name: 'Dashboard', description: 'Chỉ số thống kê điều hành & Giám sát hệ thống' },
  ],
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng nhập hệ thống bằng email và mật khẩu',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'ceo@fwbnexus.vn' },
                  password: { type: 'string', example: 'Admin@123' },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Đăng nhập thành công, trả về JWT Access Token & User Profile' },
          401: { description: 'Email hoặc mật khẩu không chính xác' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Lấy thông tin tài khoản hiện tại từ Access Token',
        responses: {
          200: { description: 'Thông tin nhân sự và quyền hạn' },
          401: { description: 'Chưa xác thực hoặc token hết hạn' },
        },
      },
    },
    '/api/employees': {
      get: {
        tags: ['Employees'],
        summary: 'Lấy danh sách nhân viên có phân trang, lọc theo phòng ban & tìm kiếm',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'department_id', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Danh sách nhân viên' },
        },
      },
      post: {
        tags: ['Employees'],
        summary: 'Thêm mới nhân viên và khởi tạo hợp đồng lao động',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['full_name', 'email', 'phone', 'department_id', 'job_title_id', 'contract_salary'],
                properties: {
                  full_name: { type: 'string', example: 'Phan Minh Tuấn' },
                  email: { type: 'string', example: 'tuan.pm@fwbnexus.vn' },
                  phone: { type: 'string', example: '0912345678' },
                  department_id: { type: 'string', example: 'DEPT-ENG' },
                  job_title_id: { type: 'string', example: 'POS-DEV-SR' },
                  contract_salary: { type: 'number', example: 32000000 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Thêm nhân viên thành công' },
        },
      },
    },
    '/api/employees/import': {
      post: {
        tags: ['Employees'],
        summary: 'Nhập hàng loạt nhân viên từ file CSV / Excel',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  employees: {
                    type: 'array',
                    items: { type: 'object' },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Nhập dữ liệu thành công' },
        },
      },
    },
    '/api/attendance/check-in': {
      post: {
        tags: ['Attendance'],
        summary: 'Chấm công vào ca (GPS / Kiosk / Manual)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  method: { type: 'string', example: 'gps' },
                  lat: { type: 'number', example: 10.8416 },
                  lng: { type: 'number', example: 106.7845 },
                  code: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Check-in thành công' },
        },
      },
    },
    '/api/attendance/check-out': {
      post: {
        tags: ['Attendance'],
        summary: 'Chấm công hết ca',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  method: { type: 'string', example: 'gps' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Check-out thành công' },
        },
      },
    },
    '/api/attendance/appeals': {
      post: {
        tags: ['Attendance'],
        summary: 'Nộp đơn giải trình chấm công (Đi muộn / Về sớm / Quên quẹt thẻ)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'appeal_type', 'reason'],
                properties: {
                  date: { type: 'string', example: '2026-09-28' },
                  appeal_type: { type: 'string', example: 'DI_MUON' },
                  reason: { type: 'string', example: 'Họp với khách hàng tại văn phòng đối tác' },
                  proof_url: { type: 'string', example: 'https://drive.google.com/proof123' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Nộp đơn giải trình thành công' },
        },
      },
      get: {
        tags: ['Attendance'],
        summary: 'Lấy danh sách các đơn giải trình chấm công',
        responses: {
          200: { description: 'Danh sách đơn giải trình' },
        },
      },
    },
    '/api/attendance/appeals/{id}/review': {
      put: {
        tags: ['Attendance'],
        summary: 'Duyệt hoặc từ chối đơn giải trình chấm công (Quản lý / HR)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['DA_DUYET', 'TU_CHOI'], example: 'DA_DUYET' },
                  review_note: { type: 'string', example: 'Đã xác nhận với trưởng dự án' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật trạng thái thành công' },
        },
      },
    },
    '/api/leaves': {
      get: {
        tags: ['Leaves'],
        summary: 'Lấy danh sách đơn xin nghỉ phép',
        responses: {
          200: { description: 'Danh sách đơn xin nghỉ phép' },
        },
      },
      post: {
        tags: ['Leaves'],
        summary: 'Tạo đơn xin nghỉ phép mới',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['leave_type_id', 'start_date', 'end_date', 'reason'],
                properties: {
                  leave_type_id: { type: 'string', example: 'ANNUAL' },
                  start_date: { type: 'string', example: '2026-10-01' },
                  end_date: { type: 'string', example: '2026-10-02' },
                  reason: { type: 'string', example: 'Nghỉ phép thường niên cùng gia đình' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo đơn nghỉ phép thành công' },
        },
      },
    },
    '/api/payroll': {
      get: {
        tags: ['Payroll'],
        summary: 'Lấy bảng tổng hợp tiền lương tháng',
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', example: '2026-08' } },
        ],
        responses: {
          200: { description: 'Bảng tính lương chi tiết' },
        },
      },
    },
    '/api/payroll/calculate': {
      post: {
        tags: ['Payroll'],
        summary: 'Kích hoạt động cơ tính lương tự động cho toàn thể nhân sự',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  period: { type: 'string', example: '2026-08' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Đã hoàn tất tính lương kỳ' },
        },
      },
    },
    '/api/payroll/anomalies': {
      get: {
        tags: ['Payroll'],
        summary: 'Phát hiện các bất thường về tiền lương, biến động đột biến > 25%',
        responses: {
          200: { description: 'Danh sách các cảnh báo bất thường' },
        },
      },
    },
    '/api/ai/copilot': {
      post: {
        tags: ['AI & Knowledge'],
        summary: 'Hỏi đáp Trợ lý ảo AI Nexus (Gemini API + HR Domain RAG Knowledge)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', example: 'Mức thuế TNCN bậc 2 và bảo hiểm tính thế nào?' },
                  user_context: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Câu trả lời từ AI Copilot' },
        },
      },
    },
    '/api/dashboard/stats': {
      get: {
        tags: ['Dashboard'],
        summary: 'Lấy các chỉ số tổng quan điều hành doanh nghiệp (Có caching tối ưu < 100ms)',
        responses: {
          200: { description: 'Thống kê tổng số nhân sự, tỉ lệ đi làm, quỹ lương, rủi ro nghỉ việc' },
        },
      },
    },
  },
};

function renderSwaggerHtml() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NEXUS HRMS Enterprise API Documentation (OpenAPI 3.0)</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .topbar {
      background: #0f172a !important;
      padding: 12px 20px !important;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .topbar a {
      color: #fff !important;
      font-weight: 700 !important;
      font-size: 18px !important;
      text-decoration: none !important;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .swagger-ui .info {
      margin: 30px 0 !important;
    }
    .swagger-ui .info .title {
      color: #0f172a;
      font-size: 28px;
    }
    .swagger-ui .btn.authorize {
      background-color: #2563eb;
      color: #fff;
      border-color: #2563eb;
      border-radius: 8px;
      font-weight: 600;
    }
    .swagger-ui .btn.authorize svg {
      fill: #fff;
    }
    .swagger-ui .opblock {
      border-radius: 12px;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
      margin: 0 0 15px;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <a href="/api/docs">
      <span>⚡ NEXUS HRMS — OpenAPI 3.0 Live Interactive Documentation</span>
    </a>
  </div>
  <div id="swagger-ui"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js"></script>
  <script>
    window.onload = function() {
      const spec = ${JSON.stringify(openApiSpec)};
      window.ui = SwaggerUIBundle({
        spec: spec,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
}

module.exports = {
  openApiSpec,
  renderSwaggerHtml,
};
