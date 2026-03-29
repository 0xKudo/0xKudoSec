/**
 * Returns Express middleware that validates req.body has the required fields.
 * Responds 400 with a descriptive error if any field is missing or not a string.
 * @param {string[]} fields
 */
export function requireFields(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (typeof req.body[field] !== 'string' || req.body[field].trim() === '') {
        return res.status(400).json({ error: `Missing or empty field: ${field}` });
      }
    }
    next();
  };
}
