const asyncHandler = require('../../utils/asyncHandler');

/** HTTP handlers shared by every request type built on createApprovalService. `labels` are Vietnamese response messages. */
function createApprovalController(service, labels) {
  return {
    list: asyncHandler(async (req, res) => {
      const { data, pagination } = await service.list(req.user, req.query, req.scope);
      res.json({ success: true, data, pagination });
    }),
    get: asyncHandler(async (req, res) => {
      res.json({ success: true, data: await service.get(req.user, req.params.id, req.scope) });
    }),
    approve: asyncHandler(async (req, res) => {
      const row = await service.decideOn(req.user, req.params.id, 'approve', req.body.note, req);
      res.json({ success: true, message: row.stage === 'DA_PHE_DUYET' ? labels.approved : labels.step1, data: row });
    }),
    reject: asyncHandler(async (req, res) => {
      res.json({ success: true, message: labels.rejected, data: await service.decideOn(req.user, req.params.id, 'reject', req.body.note, req) });
    }),
    cancel: asyncHandler(async (req, res) => {
      res.json({ success: true, message: labels.cancelled, data: await service.cancel(req.user, req.params.id, req) });
    }),
  };
}

module.exports = { createApprovalController };
