// Wraps async route handlers so thrown/rejected errors reach the error middleware
// without a try/catch in every controller.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)
