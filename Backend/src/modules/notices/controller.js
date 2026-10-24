const asyncHandler = require('../../utils/asyncHandler');
const service = require('./service');

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.user, req.query);
  res.json({ success: true, data, pagination });
});
const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.get(req.user, req.params.id) });
});
const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, message: 'Đã đăng thông báo', data: await service.create(req.user, req.body, req) });
});
const update = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Đã cập nhật thông báo', data: await service.update(req.user, req.params.id, req.body, req) });
});
const remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.params.id, req);
  res.json({ success: true, message: 'Đã xóa thông báo' });
});
const getReaders = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getReaders(req.user, req.params.id) });
});
const remindUnread = asyncHandler(async (req, res) => {
  const result = await service.remindUnread(req.user, req.params.id, req);
  res.json({ success: true, ...result });
});
const uploadAttachment = asyncHandler(async (req, res) => {
  const data = await service.uploadAttachment(req.user, req.body);
  res.status(201).json({ success: true, message: 'Đã tải tệp đính kèm lên máy chủ', data });
});
const deleteAttachment = asyncHandler(async (req, res) => {
  const data = await service.deleteAttachment(req.user, req.params.attachmentId);
  res.json({ success: true, message: 'Đã xóa tệp đính kèm tạm thời', data });
});
const downloadAttachment = asyncHandler(async (req, res) => {
  const { buffer, fileName, mimeType, sizeBytes, sha256 } = await service.downloadAttachment(
    req.user,
    req.params.id,
    req.params.attachmentId
  );
  const encodedName = encodeURIComponent(fileName);
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(sizeBytes));
  res.setHeader('X-Attachment-SHA256', sha256);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
  );
  res.send(buffer);
});

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  getReaders,
  remindUnread,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
};
