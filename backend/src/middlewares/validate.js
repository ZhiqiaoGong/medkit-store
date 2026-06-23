// Generic Zod validation middleware for Express.
export const validate =
  (schema) =>
  (req, res, next) => {
    try {
      // Parse against { body, query, params } union; only use what you pass in.
      const data = {
        body: req.body,
        query: req.query,
        params: req.params
      };
      const parsed = schema.parse(data);
      // Overwrite only provided parts to keep original references consistent.
      if (parsed.body) req.body = parsed.body;
      if (parsed.query) req.query = parsed.query;
      if (parsed.params) req.params = parsed.params;
      next();
    } catch (err) {
      if (err?.issues) {
        // Zod error format
        return res.status(400).json({
          error: 'Validation error',
          details: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message
          }))
        });
      }
      next(err);
    }
  };
