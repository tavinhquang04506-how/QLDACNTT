const asyncHandler = require('../../utils/asyncHandler');
const reviews = require('./reviews');
const turnover = require('./turnover');
const pip = require('./pip');

const ok = (res, body, status = 200) => res.status(status).json({ success: true, ...body });

module.exports = {
  listReviews: asyncHandler(async (req, res) => {
    const { data, pagination } = await reviews.list(req.user, req.query, req.scope);
    ok(res, { data, pagination });
  }),
  createReview: asyncHandler(async (req, res) => ok(res, { message: 'Đã lưu đánh giá', data: await reviews.create(req.user, req.body, req) }, 201)),
  updateReview: asyncHandler(async (req, res) => ok(res, { message: 'Đã cập nhật đánh giá', data: await reviews.update(req.user, req.params.id, req.body, req) })),
  deleteReview: asyncHandler(async (req, res) => {
    await reviews.remove(req.user, req.params.id, req);
    ok(res, { message: 'Đã xóa đánh giá' });
  }),
  nineBox: asyncHandler(async (req, res) => ok(res, await reviews.nineBox(req.user, req.query, req.scope))),
  departmentScores: asyncHandler(async (req, res) => ok(res, await reviews.departmentScores(req.user, req.query, req.scope))),
  summary: asyncHandler(async (req, res) => {
    const { period, data: departmentScores } = await reviews.departmentScores(req.user, req.query, req.scope);
    const box = await reviews.nineBox(req.user, { period }, req.scope);
    const scored = box.data.flatMap((c) => c.employees);
    const avgScore = scored.length ? Math.round((scored.reduce((s, e) => s + e.performance_score, 0) / scored.length) * 10) / 10 : 0;
    const topTalentsCount = box.data.filter((c) => c.cell >= 8).reduce((s, c) => s + c.count, 0);
    ok(res, { data: { period, avgScore, topTalentsCount, atRiskCount: await turnover.atRiskCount(req.user, req.scope), departmentScores } });
  }),
  listRisk: asyncHandler(async (req, res) => {
    const { data, pagination } = await turnover.list(req.user, req.query, req.scope);
    ok(res, { data, pagination });
  }),
  getRisk: asyncHandler(async (req, res) => ok(res, { data: await turnover.get(req.user, req.params.employeeId, req.scope) })),
  listPip: asyncHandler(async (req, res) => {
    const { data, pagination } = await pip.list(req.user, req.query, req.scope);
    ok(res, { data, pagination });
  }),
  getPip: asyncHandler(async (req, res) => ok(res, { data: await pip.get(req.user, req.params.id, req.scope) })),
  createPip: asyncHandler(async (req, res) => {
    const data = await pip.create(req.user, req.body, req, req.scope);
    ok(res, { message: data.status === 'proposed' ? 'Đã gửi đề xuất PIP tới HR phê duyệt' : 'Đã kích hoạt kế hoạch cải thiện hiệu suất', data }, 201);
  }),
  updatePip: asyncHandler(async (req, res) => ok(res, { message: 'Đã cập nhật kế hoạch', data: await pip.update(req.user, req.params.id, req.body, req) })),
  decidePip: asyncHandler(async (req, res) => {
    const data = await pip.decide(req.user, req.params.id, req.body, req);
    ok(res, { message: data.status === 'active' ? 'Đã phê duyệt và kích hoạt PIP' : 'Đã từ chối đề xuất PIP', data });
  }),
  progressPip: asyncHandler(async (req, res) => ok(res, { message: 'Đã cập nhật tiến độ mục tiêu', data: await pip.progress(req.user, req.params.id, req.body, req, req.scope) })),
};
