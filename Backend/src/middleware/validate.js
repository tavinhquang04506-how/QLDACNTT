/**
 * validate({ params, query, body }) — each value is a zod schema.
 * On success the parsed (coerced) value replaces req.params/query/body.
 * On failure the ZodError is forwarded to the error handler (400 VALIDATION_ERROR).
 */
const validate = (schemas) => (req, res, next) => {
  try {
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req[part] = schemas[part].parse(req[part]);
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { validate };
