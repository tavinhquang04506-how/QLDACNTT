const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../policies');
const c = require('./controller');
const s = require('./schema');

const router = express.Router();
router.use(authenticate);

router.get('/reviews', requirePermission('analytics.read'), validate({ query: s.reviewsQuery }), c.listReviews);
router.post('/reviews', requirePermission('review.write'), validate({ body: s.reviewBody }), c.createReview);
router.put('/reviews/:id', requirePermission('review.write'), validate({ params: s.idParam, body: s.reviewUpdate }), c.updateReview);
router.delete('/reviews/:id', requirePermission('review.delete'), validate({ params: s.idParam }), c.deleteReview);

router.get('/nine-box', requirePermission('analytics.insight'), validate({ query: s.periodQuery }), c.nineBox);
router.get('/department-scores', requirePermission('analytics.insight'), validate({ query: s.periodQuery }), c.departmentScores);
router.get('/summary', requirePermission('analytics.insight'), validate({ query: s.periodQuery }), c.summary);

router.get('/turnover-risk', requirePermission('analytics.risk'), validate({ query: s.riskQuery }), c.listRisk);
router.get('/turnover-risk/:employeeId', requirePermission('analytics.risk'), validate({ params: s.employeeParam }), c.getRisk);

router.get('/pip', requirePermission('pip.read'), validate({ query: s.pipQuery }), c.listPip);
router.post('/pip', requirePermission('pip.propose'), validate({ body: s.pipBody }), c.createPip);
router.get('/pip/:id', requirePermission('pip.read'), validate({ params: s.idParam }), c.getPip);
router.put('/pip/:id', requirePermission('pip.manage'), validate({ params: s.idParam, body: s.pipUpdate }), c.updatePip);
router.post('/pip/:id/decision', requirePermission('pip.manage'), validate({ params: s.idParam, body: s.pipDecision }), c.decidePip);
router.patch('/pip/:id/progress', requirePermission('pip.track'), validate({ params: s.idParam, body: s.pipProgress }), c.progressPip);

module.exports = router;
